package com.imaginify.service.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import software.amazon.awssdk.services.secretsmanager.SecretsManagerClient;
import software.amazon.awssdk.services.secretsmanager.model.GetSecretValueRequest;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * Client for Google Gemini API text generation with model fallback for rate limiting.
 *
 * Uses the Gemini free tier which has the following limits:
 * - gemini-2.0-flash: 15 RPM, 1M tokens/min, 1500 requests/day
 * - gemini-1.5-flash: 15 RPM, 1M tokens/min, 1500 requests/day
 * - gemini-1.5-pro: 2 RPM, 32K tokens/min, 50 requests/day
 *
 * This client automatically falls back to alternate models when rate limits are hit.
 */
public class GeminiTextClient {

    private static final Logger log = LoggerFactory.getLogger(GeminiTextClient.class);

    private static final String GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";

    // Model fallback order: try each in sequence
    // Model names from https://generativelanguage.googleapis.com/v1beta/models
    // gemini-flash-latest often has better quota availability
    private static final List<String> MODEL_FALLBACK_ORDER = List.of(
            "gemini-flash-latest",
            "gemini-2.0-flash",
            "gemini-2.5-flash"
    );

    // Initial wait time when rate limit is hit (15 RPM = 4 sec/request, use 5 sec buffer)
    private static final long INITIAL_WAIT_SECONDS = 5;

    // Max wait time for exponential backoff
    private static final long MAX_WAIT_SECONDS = 60;

    // Maximum retries per request (to handle multiple rate limit hits for large books)
    private static final int MAX_RETRIES = 10;

    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final String apiKey;

    /**
     * Create a GeminiTextClient with API key from environment variable.
     */
    public GeminiTextClient(String apiKey) {
        this.apiKey = apiKey;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(30))
                .build();
        this.objectMapper = new ObjectMapper();
    }

    /**
     * Create a GeminiTextClient that retrieves API key from AWS Secrets Manager.
     */
    public GeminiTextClient(SecretsManagerClient secretsManagerClient, String secretName) {
        this.objectMapper = new ObjectMapper();  // Must be initialized before fetchApiKey
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(30))
                .build();
        this.apiKey = fetchApiKey(secretsManagerClient, secretName);
    }

    private String fetchApiKey(SecretsManagerClient client, String secretName) {
        try {
            String secretValue = client.getSecretValue(
                    GetSecretValueRequest.builder()
                            .secretId(secretName)
                            .build()
            ).secretString();

            JsonNode secretJson = objectMapper.readTree(secretValue);
            String key = secretJson.path("geminiApiKey").asText();

            if (key == null || key.isBlank() || "PLACEHOLDER".equals(key)) {
                log.warn("Gemini API key not configured in Secrets Manager");
                return null;
            }

            return key;
        } catch (Exception e) {
            log.error("Failed to fetch Gemini API key from Secrets Manager", e);
            return null;
        }
    }

    /**
     * Generate text using Gemini with retry on rate limiting.
     * Tries all models first, only waits when ALL models are rate-limited.
     *
     * @param prompt the prompt to send to the model
     * @return the generated text, or null if all retries exhausted or API error
     */
    public String generateText(String prompt) {
        if (apiKey == null || apiKey.isBlank()) {
            log.warn("Gemini API key not available, cannot generate text");
            return null;
        }

        for (int attempt = 0; attempt < MAX_RETRIES; attempt++) {
            int rateLimitedCount = 0;

            for (String model : MODEL_FALLBACK_ORDER) {
                try {
                    String result = callModel(model, prompt);
                    if (result != null) {
                        return result;
                    }
                } catch (RateLimitException e) {
                    log.info("Rate limit hit for {}, trying next model", model);
                    rateLimitedCount++;
                } catch (Exception e) {
                    log.error("Error calling {}: {}", model, e.getMessage());
                    // Continue to next model
                }
            }

            // If ALL models are rate-limited, wait with exponential backoff and retry
            if (rateLimitedCount == MODEL_FALLBACK_ORDER.size()) {
                long waitSeconds = Math.min(INITIAL_WAIT_SECONDS * (1L << attempt), MAX_WAIT_SECONDS);
                log.info("All models rate-limited, waiting {} seconds before retry (attempt {}/{})",
                        waitSeconds, attempt + 1, MAX_RETRIES);
                try {
                    Thread.sleep(waitSeconds * 1000);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    log.warn("Interrupted while waiting for rate limit cooldown");
                    return null;
                }
            } else {
                // Some models failed for non-rate-limit reasons, don't retry
                break;
            }
        }

        log.warn("All Gemini retries exhausted");
        return null;
    }

    private String callModel(String model, String prompt) throws Exception {
        String url = GEMINI_API_BASE + model + ":generateContent?key=" + apiKey;

        // Build request body
        String requestBody = objectMapper.writeValueAsString(Map.of(
                "contents", List.of(Map.of(
                        "parts", List.of(Map.of("text", prompt))
                )),
                "generationConfig", Map.of(
                        "temperature", 0.3,
                        "maxOutputTokens", 2000
                )
        ));

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Content-Type", "application/json")
                .timeout(Duration.ofSeconds(60))
                .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() == 429) {
            throw new RateLimitException("Rate limit exceeded for model: " + model);
        }

        if (response.statusCode() != 200) {
            log.warn("Gemini API error for {}: status={}, body={}",
                    model, response.statusCode(), response.body());
            return null;
        }

        // Parse response
        JsonNode responseJson = objectMapper.readTree(response.body());
        JsonNode candidates = responseJson.path("candidates");

        if (candidates.isEmpty() || !candidates.isArray() || candidates.size() == 0) {
            log.warn("No candidates in Gemini response for {}", model);
            return null;
        }

        // Log finish reason to debug truncation issues
        String finishReason = candidates.get(0).path("finishReason").asText("UNKNOWN");
        if (!"STOP".equals(finishReason)) {
            log.warn("Gemini response for {} finished with reason: {}", model, finishReason);
        }

        JsonNode content = candidates.get(0).path("content");
        JsonNode parts = content.path("parts");

        if (parts.isEmpty() || !parts.isArray() || parts.size() == 0) {
            log.warn("No parts in Gemini response for {}", model);
            return null;
        }

        String text = parts.get(0).path("text").asText();
        log.info("Generated text using {}: {} chars, finishReason={}", model, text.length(), finishReason);
        return text;
    }

    /**
     * Check if the client has a valid API key configured.
     */
    public boolean isConfigured() {
        return apiKey != null && !apiKey.isBlank();
    }

    private static class RateLimitException extends Exception {
        RateLimitException(String message) {
            super(message);
        }
    }
}
