package com.imaginify.service.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import java.util.List;
import java.util.Map;

/**
 * Client for Google Gemini image generation using "Nano Banana" models.
 *
 * Uses the Gemini 2.5 Flash Image model (Nano Banana) which supports native image generation
 * through the generateContent API with responseModalities including "image".
 *
 * Free tier limits apply - approximately 5 images per day.
 */
@Component
public class GeminiImageGenerationClient implements AiImageGenerationClient {

    private static final Logger log = LoggerFactory.getLogger(GeminiImageGenerationClient.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();

    // Gemini API endpoint
    private static final String GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";

    // Model fallback order - try each Nano Banana variant
    private static final List<String> IMAGE_MODEL_FALLBACK = List.of(
            "gemini-2.5-flash-image",       // Nano Banana
            "gemini-3.1-flash-image-preview", // Nano Banana 2
            "gemini-3-pro-image-preview"    // Nano Banana Pro
    );

    // Retry settings for rate limiting
    private static final int MAX_RETRIES = 5;
    private static final long INITIAL_WAIT_SECONDS = 10;
    private static final long MAX_WAIT_SECONDS = 60;

    private final HttpClient httpClient;
    private final String apiKey;
    private final boolean configured;

    /**
     * Default constructor for Spring context (unconfigured).
     */
    public GeminiImageGenerationClient() {
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(30))
                .build();
        this.apiKey = null;
        this.configured = false;
    }

    /**
     * Constructor for Lambda handler with Secrets Manager.
     */
    public GeminiImageGenerationClient(SecretsManagerClient secretsClient, String secretName) {
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
            // Use the same API key as text generation (geminiApiKey)
            // Imagen 3 uses the same API key as other Gemini models
            if (secrets.has("geminiApiKey")) {
                key = secrets.get("geminiApiKey").asText();
                if (key != null && !key.isBlank() && !"PLACEHOLDER".equals(key)) {
                    isConfigured = true;
                    log.info("Gemini API key loaded from Secrets Manager for image generation");
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
     * Generate an image using Gemini Nano Banana models.
     * Tries multiple models with exponential backoff on rate limits.
     *
     * @param prompt The text prompt describing the image to generate
     * @return The generated image as PNG bytes
     * @throws RuntimeException if generation fails after retries
     */
    @Override
    public byte[] generateImage(String prompt) {
        if (!configured) {
            throw new UnsupportedOperationException("Gemini image generation not configured - API key not set");
        }

        for (int attempt = 0; attempt < MAX_RETRIES; attempt++) {
            int rateLimitedCount = 0;

            // Try each model in fallback order
            for (String model : IMAGE_MODEL_FALLBACK) {
                try {
                    return callImageApi(model, prompt);
                } catch (RateLimitException e) {
                    log.info("Rate limit hit for {}, trying next model", model);
                    rateLimitedCount++;
                } catch (Exception e) {
                    log.error("Image generation failed for {}: {}", model, e.getMessage());
                    // Continue to next model
                }
            }

            // If ALL models are rate-limited, wait with exponential backoff and retry
            if (rateLimitedCount == IMAGE_MODEL_FALLBACK.size()) {
                long waitSeconds = Math.min(INITIAL_WAIT_SECONDS * (1L << attempt), MAX_WAIT_SECONDS);
                log.info("All image models rate-limited, waiting {} seconds before retry (attempt {}/{})",
                        waitSeconds, attempt + 1, MAX_RETRIES);
                try {
                    Thread.sleep(waitSeconds * 1000);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new RuntimeException("Interrupted while waiting for rate limit cooldown", ie);
                }
            } else {
                // Some models failed for non-rate-limit reasons, don't retry
                break;
            }
        }

        throw new RuntimeException("Image generation failed after trying all models with " + MAX_RETRIES + " retry attempts");
    }

    private byte[] callImageApi(String model, String prompt) throws Exception {
        String url = GEMINI_API_BASE + model + ":generateContent?key=" + apiKey;

        // Build request body for Gemini generateContent API with image output
        // The Nano Banana models use generateContent with responseModalities: ["image"]
        Map<String, Object> requestBody = Map.of(
                "contents", List.of(
                        Map.of("parts", List.of(
                                Map.of("text", prompt)
                        ))
                ),
                "generationConfig", Map.of(
                        "responseModalities", List.of("image", "text"),
                        "temperature", 1.0,
                        "topP", 0.95,
                        "topK", 40
                )
        );

        String jsonBody = objectMapper.writeValueAsString(requestBody);
        log.debug("Gemini Image API request to {}: {}", model, jsonBody);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Content-Type", "application/json")
                .timeout(Duration.ofSeconds(120))  // Image generation can take longer
                .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() == 429) {
            throw new RateLimitException("Rate limit exceeded for Gemini Image API");
        }

        if (response.statusCode() != 200) {
            log.error("Gemini Image API error: status={}, body={}", response.statusCode(), response.body());
            throw new RuntimeException("Gemini Image API returned status " + response.statusCode() + ": " + response.body());
        }

        // Parse response and extract image bytes
        // Response format: { "candidates": [{ "content": { "parts": [{ "inlineData": { "mimeType": "...", "data": "base64..." } }] } }] }
        JsonNode responseJson = objectMapper.readTree(response.body());
        JsonNode candidates = responseJson.path("candidates");

        if (candidates.isEmpty() || !candidates.isArray() || candidates.size() == 0) {
            log.error("No candidates in Gemini response: {}", response.body());
            throw new RuntimeException("No images generated in Gemini response");
        }

        // Find the image part in the response
        JsonNode parts = candidates.get(0).path("content").path("parts");
        String base64Image = null;
        String mimeType = "image/png";

        for (JsonNode part : parts) {
            JsonNode inlineData = part.path("inlineData");
            if (!inlineData.isMissingNode()) {
                base64Image = inlineData.path("data").asText();
                mimeType = inlineData.path("mimeType").asText("image/png");
                break;
            }
        }

        if (base64Image == null || base64Image.isBlank()) {
            log.error("No image data in Gemini response: {}", response.body());
            throw new RuntimeException("No image data in Gemini response");
        }

        byte[] imageBytes = Base64.getDecoder().decode(base64Image);
        log.info("Generated image: {} bytes, mimeType={}", imageBytes.length, mimeType);

        return imageBytes;
    }

    @Override
    public String getProviderName() {
        return "gemini-nano-banana";
    }

    private static class RateLimitException extends Exception {
        RateLimitException(String message) {
            super(message);
        }
    }
}
