package com.imaginify.service.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.imaginify.model.QualityScore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import software.amazon.awssdk.services.secretsmanager.SecretsManagerClient;
import software.amazon.awssdk.services.secretsmanager.model.GetSecretValueRequest;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Client for Google Gemini API image verification using vision capabilities.
 *
 * Uses Gemini's free tier multimodal capabilities to verify that generated
 * images match their prompts (AI-as-judge layer of quality assurance).
 *
 * Free tier limits:
 * - gemini-2.0-flash: 15 RPM, 1M tokens/min, 1500 requests/day
 * - Supports image input (up to 20MB per image)
 */
public class GeminiVerificationClient {

    private static final Logger log = LoggerFactory.getLogger(GeminiVerificationClient.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();

    private static final String GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";

    // Models with vision capabilities (ordered by preference)
    private static final List<String> VISION_MODELS = List.of(
            "gemini-2.5-flash",
            "gemini-2.0-flash"
    );

    // Verification threshold
    private static final double PASS_THRESHOLD = 0.7;

    // Rate limit handling
    private static final int MAX_RETRIES = 3;
    private static final long RETRY_DELAY_MS = 5000;

    private final HttpClient httpClient;
    private final String apiKey;
    private final boolean configured;

    /**
     * Default constructor (unconfigured).
     */
    public GeminiVerificationClient() {
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(30))
                .build();
        this.apiKey = null;
        this.configured = false;
    }

    /**
     * Constructor with Secrets Manager for API key retrieval.
     */
    public GeminiVerificationClient(SecretsManagerClient secretsClient, String secretName) {
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(30))
                .build();

        String key = null;
        boolean isConfigured = false;

        try {
            String secretJson = secretsClient.getSecretValue(
                    GetSecretValueRequest.builder().secretId(secretName).build()
            ).secretString();

            JsonNode secrets = objectMapper.readTree(secretJson);
            if (secrets.has("geminiApiKey")) {
                key = secrets.get("geminiApiKey").asText();
                if (key != null && !key.isBlank() && !key.equals("PLACEHOLDER")) {
                    isConfigured = true;
                    log.info("Gemini API key loaded from Secrets Manager for verification");
                }
            }
        } catch (Exception e) {
            log.warn("Failed to load Gemini API key from Secrets Manager: {}", e.getMessage());
        }

        this.apiKey = key;
        this.configured = isConfigured;
    }

    public boolean isConfigured() {
        return configured;
    }

    /**
     * Verify that a generated image matches its prompt using Gemini's vision capabilities.
     *
     * @param imageData The generated image as PNG/JPEG bytes
     * @param prompt The original prompt used to generate the image
     * @return QualityScore with pass/fail, score (0-1), and detailed feedback
     */
    public QualityScore verifyImage(byte[] imageData, String prompt) {
        QualityScore score = new QualityScore();

        if (!configured) {
            log.warn("Gemini verification not configured - API key not set");
            score.setPassed(true);
            score.setOverallScore(1.0);
            score.setFeedback("Verification skipped - Gemini not configured");
            return score;
        }

        String base64Image = Base64.getEncoder().encodeToString(imageData);
        String mimeType = detectMimeType(imageData);

        for (int attempt = 0; attempt < MAX_RETRIES; attempt++) {
            for (String model : VISION_MODELS) {
                try {
                    QualityScore result = callVerificationApi(model, base64Image, mimeType, prompt);
                    if (result != null) {
                        return result;
                    }
                } catch (RateLimitException e) {
                    log.info("Rate limit hit for {} on verification, trying next model", model);
                } catch (Exception e) {
                    log.error("Verification error with {}: {}", model, e.getMessage());
                }
            }

            // All models rate-limited, wait and retry
            if (attempt < MAX_RETRIES - 1) {
                log.info("All verification models rate-limited, waiting {}ms", RETRY_DELAY_MS);
                sleep(RETRY_DELAY_MS);
            }
        }

        // On failure, pass through with reduced confidence
        log.warn("Gemini verification failed after retries, passing with reduced confidence");
        score.setPassed(true);
        score.setOverallScore(0.5);
        score.setFeedback("Verification service unavailable - passed with reduced confidence");
        return score;
    }

    private QualityScore callVerificationApi(String model, String base64Image, String mimeType, String prompt) throws Exception {
        String url = GEMINI_API_BASE + model + ":generateContent?key=" + apiKey;

        // Build the verification prompt
        String verificationPrompt = buildVerificationPrompt(prompt);

        // Build multimodal request with image and text
        Map<String, Object> requestBody = Map.of(
                "contents", List.of(Map.of(
                        "parts", List.of(
                                Map.of(
                                        "inline_data", Map.of(
                                                "mime_type", mimeType,
                                                "data", base64Image
                                        )
                                ),
                                Map.of("text", verificationPrompt)
                        )
                )),
                "generationConfig", Map.of(
                        "temperature", 0.1,
                        "maxOutputTokens", 1024
                )
        );

        String jsonBody = objectMapper.writeValueAsString(requestBody);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Content-Type", "application/json")
                .timeout(Duration.ofSeconds(60))
                .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() == 429) {
            throw new RateLimitException("Rate limit exceeded for " + model);
        }

        if (response.statusCode() != 200) {
            log.error("Gemini verification API error: status={}, body={}", response.statusCode(), response.body());
            return null;
        }

        return parseVerificationResponse(response.body());
    }

    private String buildVerificationPrompt(String originalPrompt) {
        return String.format("""
            You are an image quality verification assistant. Evaluate whether this generated image matches its intended prompt.

            ORIGINAL PROMPT: %s

            Evaluate the image on these criteria (0-100 each):
            1. PROMPT_MATCH: How well does the image match the key elements described in the prompt?
            2. VISUAL_QUALITY: Is the image clear, well-composed, and free of obvious artifacts?
            3. STYLE_CONSISTENCY: Does the image have a consistent artistic style?
            4. CONTENT_SAFETY: Is the image appropriate and free of problematic content?

            Respond ONLY with a JSON object in this exact format (no markdown, no explanation):
            {"scores":{"prompt_match":85,"visual_quality":90,"style_consistency":80,"content_safety":100},"overall_score":88,"passed":true,"feedback":"Brief explanation"}

            Set "passed" to true if overall_score >= 70.
            """, originalPrompt);
    }

    private QualityScore parseVerificationResponse(String responseBody) {
        QualityScore score = new QualityScore();

        try {
            JsonNode response = objectMapper.readTree(responseBody);
            JsonNode candidates = response.path("candidates");

            if (candidates.isEmpty() || !candidates.isArray() || candidates.size() == 0) {
                log.warn("No candidates in Gemini verification response");
                score.setPassed(true);
                score.setOverallScore(0.5);
                score.setFeedback("Could not parse verification response");
                return score;
            }

            JsonNode content = candidates.get(0).path("content");
            JsonNode parts = content.path("parts");

            if (parts.isEmpty() || !parts.isArray() || parts.size() == 0) {
                log.warn("No parts in Gemini verification response");
                score.setPassed(true);
                score.setOverallScore(0.5);
                score.setFeedback("No verification text in response");
                return score;
            }

            String textResponse = parts.get(0).path("text").asText();

            // Extract JSON from response (handle potential markdown)
            String jsonStr = extractJson(textResponse);
            JsonNode evaluation = objectMapper.readTree(jsonStr);

            // Extract scores
            double overallScore = evaluation.has("overall_score")
                    ? evaluation.get("overall_score").asDouble() / 100.0
                    : 0.5;
            boolean passed = evaluation.has("passed")
                    ? evaluation.get("passed").asBoolean()
                    : overallScore >= PASS_THRESHOLD;
            String feedback = evaluation.has("feedback")
                    ? evaluation.get("feedback").asText()
                    : "No feedback provided";

            // Extract individual criteria scores
            Map<String, Integer> criteriaScores = new HashMap<>();
            if (evaluation.has("scores")) {
                JsonNode scores = evaluation.get("scores");
                if (scores.has("prompt_match")) criteriaScores.put("prompt_match", scores.get("prompt_match").asInt());
                if (scores.has("visual_quality")) criteriaScores.put("visual_quality", scores.get("visual_quality").asInt());
                if (scores.has("style_consistency")) criteriaScores.put("style_consistency", scores.get("style_consistency").asInt());
                if (scores.has("content_safety")) criteriaScores.put("content_safety", scores.get("content_safety").asInt());
            }

            score.setPassed(passed);
            score.setOverallScore(overallScore);
            score.setCriteriaScores(criteriaScores);
            score.setFeedback(feedback);

            log.info("Gemini verification: passed={}, score={}, feedback={}", passed, overallScore, feedback);

        } catch (Exception e) {
            log.error("Failed to parse Gemini verification response: {}", e.getMessage());
            score.setPassed(true);
            score.setOverallScore(0.5);
            score.setFeedback("Failed to parse verification response");
        }

        return score;
    }

    private String extractJson(String text) {
        // Remove markdown code blocks if present
        if (text.contains("```json")) {
            int start = text.indexOf("```json") + 7;
            int end = text.indexOf("```", start);
            if (end > start) {
                return text.substring(start, end).trim();
            }
        }
        if (text.contains("```")) {
            int start = text.indexOf("```") + 3;
            int end = text.indexOf("```", start);
            if (end > start) {
                return text.substring(start, end).trim();
            }
        }
        return text.trim();
    }

    private String detectMimeType(byte[] imageData) {
        if (imageData.length < 4) {
            return "image/png";
        }

        // PNG: 89 50 4E 47
        if (imageData[0] == (byte) 0x89 && imageData[1] == (byte) 0x50 &&
            imageData[2] == (byte) 0x4E && imageData[3] == (byte) 0x47) {
            return "image/png";
        }

        // JPEG: FF D8 FF
        if (imageData[0] == (byte) 0xFF && imageData[1] == (byte) 0xD8 && imageData[2] == (byte) 0xFF) {
            return "image/jpeg";
        }

        // GIF: 47 49 46
        if (imageData[0] == (byte) 0x47 && imageData[1] == (byte) 0x49 && imageData[2] == (byte) 0x46) {
            return "image/gif";
        }

        // WebP
        if (imageData.length > 11 &&
            imageData[0] == (byte) 0x52 && imageData[1] == (byte) 0x49 &&
            imageData[2] == (byte) 0x46 && imageData[3] == (byte) 0x46 &&
            imageData[8] == (byte) 0x57 && imageData[9] == (byte) 0x45 &&
            imageData[10] == (byte) 0x42 && imageData[11] == (byte) 0x50) {
            return "image/webp";
        }

        return "image/png";
    }

    private void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private static class RateLimitException extends Exception {
        RateLimitException(String message) {
            super(message);
        }
    }
}
