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
import java.util.Map;

/**
 * Client for Hugging Face Inference API for FLUX image generation.
 *
 * Uses FLUX.1-schnell model via the free Inference API:
 * - Rate-limited but unlimited free usage
 * - No credit card required
 * - Apache 2.0 license (commercial use allowed)
 *
 * API Documentation: https://huggingface.co/docs/inference-providers
 */
@Component
public class HuggingFaceImageClient implements AiImageGenerationClient {

    private static final Logger log = LoggerFactory.getLogger(HuggingFaceImageClient.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();

    private static final String HF_API_BASE = "https://router.huggingface.co/hf-inference/models/";

    // FLUX models available via Inference API
    private static final String FLUX_SCHNELL = "black-forest-labs/FLUX.1-schnell";
    private static final String FLUX_DEV = "black-forest-labs/FLUX.1-dev";

    private static final int MAX_RETRIES = 3;
    private static final long RETRY_DELAY_MS = 2000;
    private static final long MODEL_LOADING_WAIT_MS = 30000; // Wait for cold start

    private final HttpClient httpClient;
    private final String apiToken;
    private final boolean configured;

    /**
     * Default constructor for Spring context (unconfigured).
     */
    public HuggingFaceImageClient() {
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(30))
                .build();
        this.apiToken = null;
        this.configured = false;
    }

    /**
     * Constructor for Lambda handler with Secrets Manager.
     */
    public HuggingFaceImageClient(SecretsManagerClient secretsClient, String secretName) {
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(30))
                .build();

        String token = null;
        boolean isConfigured = false;

        try {
            String secretJson = secretsClient.getSecretValue(
                    GetSecretValueRequest.builder().secretId(secretName).build()
            ).secretString();

            JsonNode secrets = objectMapper.readTree(secretJson);
            if (secrets.has("huggingFaceToken")) {
                token = secrets.get("huggingFaceToken").asText();
                if (token != null && !token.isBlank() && !token.equals("PLACEHOLDER")) {
                    isConfigured = true;
                    log.info("Hugging Face API token loaded from Secrets Manager");
                }
            }
        } catch (Exception e) {
            log.warn("Failed to load Hugging Face token from Secrets Manager: {}", e.getMessage());
        }

        this.apiToken = token;
        this.configured = isConfigured;
    }

    public boolean isConfigured() {
        return configured;
    }

    /**
     * Generate an image using FLUX.1-schnell model.
     *
     * @param prompt The text prompt describing the image to generate
     * @return The generated image as PNG bytes
     * @throws RuntimeException if generation fails after retries
     */
    @Override
    public byte[] generateImage(String prompt) {
        if (!configured) {
            throw new UnsupportedOperationException("Hugging Face not configured - API token not set");
        }

        // Try schnell first (faster), then dev (higher quality)
        String[] models = {FLUX_SCHNELL, FLUX_DEV};

        for (String model : models) {
            for (int attempt = 0; attempt < MAX_RETRIES; attempt++) {
                try {
                    return callHuggingFaceApi(model, prompt);
                } catch (ModelLoadingException e) {
                    log.info("Model {} is loading, waiting {}ms before retry (attempt {}/{})",
                            model, MODEL_LOADING_WAIT_MS, attempt + 1, MAX_RETRIES);
                    sleep(MODEL_LOADING_WAIT_MS);
                } catch (RateLimitException e) {
                    log.warn("Rate limit hit for {}, waiting before retry (attempt {}/{})",
                            model, attempt + 1, MAX_RETRIES);
                    sleep(RETRY_DELAY_MS * (attempt + 1));
                } catch (Exception e) {
                    if (e.getMessage() != null && e.getMessage().contains("not found")) {
                        log.info("Model {} not available, trying next", model);
                        break; // Try next model
                    }
                    log.error("Image generation failed for {} on attempt {}: {}",
                            model, attempt + 1, e.getMessage());
                    if (attempt == MAX_RETRIES - 1) {
                        break; // Try next model
                    }
                    sleep(RETRY_DELAY_MS);
                }
            }
        }

        throw new RuntimeException("Image generation failed after trying all models");
    }

    private byte[] callHuggingFaceApi(String model, String prompt) throws Exception {
        // Build request body - simple JSON with inputs field
        Map<String, Object> requestBody = Map.of(
                "inputs", prompt
        );

        String jsonBody = objectMapper.writeValueAsString(requestBody);
        log.debug("Hugging Face request to {}: prompt length={}", model, prompt.length());

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(HF_API_BASE + model))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + apiToken)
                .timeout(Duration.ofSeconds(180)) // Longer timeout for cold starts
                .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
                .build();

        HttpResponse<byte[]> response = httpClient.send(request, HttpResponse.BodyHandlers.ofByteArray());

        // Check for error responses
        if (response.statusCode() == 503) {
            // Model is loading (cold start)
            String bodyStr = new String(response.body());
            log.info("Model loading response: {}", bodyStr);
            throw new ModelLoadingException("Model is loading: " + bodyStr);
        }

        if (response.statusCode() == 429) {
            throw new RateLimitException("Rate limit exceeded for Hugging Face");
        }

        if (response.statusCode() != 200) {
            String errorBody = new String(response.body());
            log.error("Hugging Face error: status={}, body={}", response.statusCode(), errorBody);
            throw new RuntimeException("Hugging Face returned status " + response.statusCode() + ": " + errorBody);
        }

        // Check content type - should be image/*
        String contentType = response.headers().firstValue("Content-Type").orElse("");
        if (!contentType.startsWith("image/")) {
            // Might be JSON error response
            String bodyStr = new String(response.body());
            log.error("Unexpected content type {}: {}", contentType, bodyStr);
            throw new RuntimeException("Expected image response but got: " + contentType);
        }

        byte[] imageBytes = response.body();
        log.info("Generated image with {}: {} bytes", model, imageBytes.length);

        return imageBytes;
    }

    private void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    @Override
    public String getProviderName() {
        return "huggingface-flux";
    }

    private static class RateLimitException extends Exception {
        RateLimitException(String message) {
            super(message);
        }
    }

    private static class ModelLoadingException extends Exception {
        ModelLoadingException(String message) {
            super(message);
        }
    }
}
