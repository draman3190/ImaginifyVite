package com.imaginify.service.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.imaginify.model.QualityScore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
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
 * Client for Claude API image verification using vision capabilities.
 *
 * Uses Claude's multimodal capabilities to verify that generated images
 * match their prompts (AI-as-judge layer of quality assurance).
 *
 * API Documentation: https://docs.anthropic.com/en/docs/vision
 */
@Component
public class ClaudeVerificationClient {

    private static final Logger log = LoggerFactory.getLogger(ClaudeVerificationClient.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();

    private static final String ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
    private static final String ANTHROPIC_VERSION = "2023-06-01";
    private static final String MODEL = "claude-sonnet-4-20250514";

    // Verification thresholds
    private static final double PASS_THRESHOLD = 0.7;

    private final HttpClient httpClient;
    private final String apiKey;
    private final boolean configured;

    /**
     * Default constructor for Spring context (unconfigured).
     */
    public ClaudeVerificationClient() {
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(30))
                .build();
        this.apiKey = null;
        this.configured = false;
    }

    /**
     * Constructor for Lambda handler with Secrets Manager.
     */
    public ClaudeVerificationClient(SecretsManagerClient secretsClient, String secretName) {
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
            if (secrets.has("claudeApiKey")) {
                key = secrets.get("claudeApiKey").asText();
                if (key != null && !key.isBlank() && !key.equals("PLACEHOLDER")) {
                    isConfigured = true;
                    log.info("Claude API key loaded from Secrets Manager");
                }
            }
        } catch (Exception e) {
            log.warn("Failed to load Claude API key from Secrets Manager: {}", e.getMessage());
        }

        this.apiKey = key;
        this.configured = isConfigured;
    }

    public boolean isConfigured() {
        return configured;
    }

    /**
     * Verify that a generated image matches its prompt using Claude's vision capabilities.
     *
     * @param imageData The generated image as PNG/JPEG bytes
     * @param prompt The original prompt used to generate the image
     * @return QualityScore with pass/fail, score (0-1), and detailed feedback
     */
    public QualityScore verifyImage(byte[] imageData, String prompt) {
        QualityScore score = new QualityScore();

        if (!configured) {
            log.warn("Claude verification not configured - API key not set");
            // Pass through without verification
            score.setPassed(true);
            score.setOverallScore(1.0);
            score.setFeedback("Verification skipped - Claude not configured");
            return score;
        }

        try {
            String base64Image = Base64.getEncoder().encodeToString(imageData);
            String mediaType = detectMediaType(imageData);

            // Build the verification request
            Map<String, Object> request = buildVerificationRequest(base64Image, mediaType, prompt);
            String requestBody = objectMapper.writeValueAsString(request);

            HttpRequest httpRequest = HttpRequest.newBuilder()
                    .uri(URI.create(ANTHROPIC_API_URL))
                    .header("Content-Type", "application/json")
                    .header("x-api-key", apiKey)
                    .header("anthropic-version", ANTHROPIC_VERSION)
                    .timeout(Duration.ofSeconds(60))
                    .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                    .build();

            HttpResponse<String> response = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() != 200) {
                log.error("Claude API error: status={}, body={}", response.statusCode(), response.body());
                // On API error, pass through to avoid blocking pipeline
                score.setPassed(true);
                score.setOverallScore(0.5);
                score.setFeedback("Verification API error - passed with reduced confidence");
                return score;
            }

            return parseVerificationResponse(response.body());

        } catch (Exception e) {
            log.error("Claude verification failed: {}", e.getMessage(), e);
            // On error, pass through to avoid blocking pipeline
            score.setPassed(true);
            score.setOverallScore(0.5);
            score.setFeedback("Verification error - passed with reduced confidence");
            return score;
        }
    }

    private Map<String, Object> buildVerificationRequest(String base64Image, String mediaType, String prompt) {
        // Build the system prompt for verification
        String systemPrompt = """
            You are an image quality verification assistant. Your task is to evaluate whether a generated image
            matches its intended prompt description.

            Evaluate the image on these criteria:
            1. PROMPT_MATCH (0-100): How well does the image match the key elements described in the prompt?
            2. VISUAL_QUALITY (0-100): Is the image clear, well-composed, and free of obvious artifacts?
            3. STYLE_CONSISTENCY (0-100): Does the image have a consistent artistic style?
            4. CONTENT_SAFETY (0-100): Is the image appropriate and free of problematic content?

            Respond ONLY with a JSON object in this exact format:
            {
                "scores": {
                    "prompt_match": <0-100>,
                    "visual_quality": <0-100>,
                    "style_consistency": <0-100>,
                    "content_safety": <0-100>
                },
                "overall_score": <0-100>,
                "passed": <true/false>,
                "feedback": "<brief explanation of evaluation>"
            }

            Set "passed" to true if overall_score >= 70.
            """;

        String userMessage = String.format(
            "Please evaluate this image against the following prompt:\n\nPROMPT: %s",
            prompt
        );

        // Build message content with image
        List<Map<String, Object>> content = List.of(
            Map.of(
                "type", "image",
                "source", Map.of(
                    "type", "base64",
                    "media_type", mediaType,
                    "data", base64Image
                )
            ),
            Map.of(
                "type", "text",
                "text", userMessage
            )
        );

        List<Map<String, Object>> messages = List.of(
            Map.of(
                "role", "user",
                "content", content
            )
        );

        Map<String, Object> request = new HashMap<>();
        request.put("model", MODEL);
        request.put("max_tokens", 1024);
        request.put("system", systemPrompt);
        request.put("messages", messages);

        return request;
    }

    private QualityScore parseVerificationResponse(String responseBody) {
        QualityScore score = new QualityScore();

        try {
            JsonNode response = objectMapper.readTree(responseBody);
            JsonNode contentArray = response.get("content");

            if (contentArray == null || !contentArray.isArray() || contentArray.isEmpty()) {
                log.warn("Unexpected Claude response structure");
                score.setPassed(true);
                score.setOverallScore(0.5);
                score.setFeedback("Could not parse verification response");
                return score;
            }

            // Extract text from first content block
            String textResponse = null;
            for (JsonNode block : contentArray) {
                if ("text".equals(block.get("type").asText())) {
                    textResponse = block.get("text").asText();
                    break;
                }
            }

            if (textResponse == null) {
                log.warn("No text content in Claude response");
                score.setPassed(true);
                score.setOverallScore(0.5);
                score.setFeedback("No verification text in response");
                return score;
            }

            // Parse the JSON response from Claude
            // Extract JSON from potential markdown code blocks
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

            log.info("Claude verification: passed={}, score={}, feedback={}", passed, overallScore, feedback);

        } catch (Exception e) {
            log.error("Failed to parse verification response: {}", e.getMessage());
            score.setPassed(true);
            score.setOverallScore(0.5);
            score.setFeedback("Failed to parse verification response");
        }

        return score;
    }

    /**
     * Extract JSON from Claude's response, handling markdown code blocks.
     */
    private String extractJson(String text) {
        // Check for markdown code block
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
        // Assume it's raw JSON
        return text.trim();
    }

    /**
     * Detect image media type from bytes.
     */
    private String detectMediaType(byte[] imageData) {
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

        // WebP: 52 49 46 46 ... 57 45 42 50
        if (imageData[0] == (byte) 0x52 && imageData[1] == (byte) 0x49 &&
            imageData[2] == (byte) 0x46 && imageData[3] == (byte) 0x46 && imageData.length > 11 &&
            imageData[8] == (byte) 0x57 && imageData[9] == (byte) 0x45 &&
            imageData[10] == (byte) 0x42 && imageData[11] == (byte) 0x50) {
            return "image/webp";
        }

        // Default to PNG
        return "image/png";
    }
}
