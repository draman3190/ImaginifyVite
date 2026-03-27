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
import java.util.Map;

/**
 * Client for Together AI's FLUX image generation API.
 *
 * Uses FLUX.1 [schnell] model which offers:
 * - 3 months of free unlimited API access
 * - No credit card required
 * - Commercial use allowed (Apache 2.0 license)
 *
 * API Documentation: https://docs.together.ai/reference/images
 * Free tier info: https://www.together.ai/blog/flux-api-is-now-available-on-together-ai-new-pro-free-access-to-flux-schnell
 */
@Component
public class TogetherAiImageClient implements AiImageGenerationClient {

    private static final Logger log = LoggerFactory.getLogger(TogetherAiImageClient.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();

    private static final String TOGETHER_API_BASE = "https://api.together.xyz/v1/images/generations";

    // Free tier model - 3 months unlimited access
    private static final String FLUX_SCHNELL_FREE = "black-forest-labs/FLUX.1-schnell-Free";

    // Fallback to regular schnell if free endpoint is unavailable
    private static final String FLUX_SCHNELL = "black-forest-labs/FLUX.1-schnell";

    private static final int MAX_RETRIES = 3;
    private static final long RETRY_DELAY_MS = 2000;

    private final HttpClient httpClient;
    private final String apiKey;
    private final boolean configured;

    /**
     * Default constructor for Spring context (unconfigured).
     */
    public TogetherAiImageClient() {
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(30))
                .build();
        this.apiKey = null;
        this.configured = false;
    }

    /**
     * Constructor for Lambda handler with Secrets Manager.
     */
    public TogetherAiImageClient(SecretsManagerClient secretsClient, String secretName) {
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
            if (secrets.has("togetherApiKey")) {
                key = secrets.get("togetherApiKey").asText();
                if (key != null && !key.isBlank() && !"PLACEHOLDER".equals(key)) {
                    isConfigured = true;
                    log.info("Together AI API key loaded from Secrets Manager");
                }
            }
        } catch (Exception e) {
            log.warn("Failed to load Together AI API key from Secrets Manager: {}", e.getMessage());
        }

        this.apiKey = key;
        this.configured = isConfigured;
    }

    public boolean isConfigured() {
        return configured;
    }

    /**
     * Generate an image using FLUX.1 [schnell] model.
     *
     * @param prompt The text prompt describing the image to generate
     * @return The generated image as PNG bytes
     * @throws RuntimeException if generation fails after retries
     */
    @Override
    public byte[] generateImage(String prompt) {
        if (!configured) {
            throw new UnsupportedOperationException("Together AI not configured - API key not set");
        }

        // Try free model first, then regular model
        String[] models = {FLUX_SCHNELL_FREE, FLUX_SCHNELL};

        for (String model : models) {
            for (int attempt = 0; attempt < MAX_RETRIES; attempt++) {
                try {
                    return callTogetherApi(model, prompt);
                } catch (RateLimitException e) {
                    log.warn("Rate limit hit for {}, waiting before retry (attempt {}/{})",
                            model, attempt + 1, MAX_RETRIES);
                    sleep(RETRY_DELAY_MS * (attempt + 1));
                } catch (Exception e) {
                    if (e.getMessage() != null && e.getMessage().contains("model")) {
                        log.info("Model {} not available, trying next", model);
                        break; // Try next model
                    }
                    log.error("Image generation failed for {} on attempt {}: {}",
                            model, attempt + 1, e.getMessage());
                    if (attempt == MAX_RETRIES - 1) {
                        // Last attempt for this model, try next
                        break;
                    }
                    sleep(RETRY_DELAY_MS);
                }
            }
        }

        throw new RuntimeException("Image generation failed after trying all models");
    }

    private byte[] callTogetherApi(String model, String prompt) throws Exception {
        // Build request body for Together AI Images API
        Map<String, Object> requestBody = Map.of(
                "model", model,
                "prompt", prompt,
                "width", 1024,
                "height", 1024,
                "steps", 4,  // schnell is optimized for 1-4 steps
                "n", 1,
                "response_format", "b64_json"
        );

        String jsonBody = objectMapper.writeValueAsString(requestBody);
        log.debug("Together AI request to {}: prompt length={}", model, prompt.length());

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(TOGETHER_API_BASE))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + apiKey)
                .timeout(Duration.ofSeconds(120))
                .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() == 429) {
            throw new RateLimitException("Rate limit exceeded for Together AI");
        }

        if (response.statusCode() != 200) {
            log.error("Together AI error: status={}, body={}", response.statusCode(), response.body());
            throw new RuntimeException("Together AI returned status " + response.statusCode() + ": " + response.body());
        }

        // Parse response: { "data": [{ "b64_json": "base64..." }] }
        JsonNode responseJson = objectMapper.readTree(response.body());
        JsonNode data = responseJson.path("data");

        if (data.isEmpty() || !data.isArray() || data.size() == 0) {
            log.error("No data in Together AI response: {}", response.body());
            throw new RuntimeException("No images generated in Together AI response");
        }

        String base64Image = data.get(0).path("b64_json").asText();

        if (base64Image == null || base64Image.isBlank()) {
            log.error("No image data in Together AI response: {}", response.body());
            throw new RuntimeException("No image data in Together AI response");
        }

        byte[] imageBytes = Base64.getDecoder().decode(base64Image);
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
        return "together-flux";
    }

    private static class RateLimitException extends Exception {
        RateLimitException(String message) {
            super(message);
        }
    }
}
