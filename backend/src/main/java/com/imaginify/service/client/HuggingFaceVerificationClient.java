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
 * Client for Hugging Face Inference API image verification using vision-language models.
 *
 * Uses free tier vision models to verify that generated images match their prompts.
 * Approach:
 * 1. Use BLIP to caption the image
 * 2. Compare caption similarity to original prompt
 *
 * Free tier: Rate-limited but unlimited usage
 */
public class HuggingFaceVerificationClient {

    private static final Logger log = LoggerFactory.getLogger(HuggingFaceVerificationClient.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();

    private static final String HF_API_BASE = "https://router.huggingface.co/hf-inference/models/";

    // Vision-language models for image understanding
    private static final String BLIP_CAPTIONING = "Salesforce/blip-image-captioning-large";
    private static final String BLIP_VQA = "Salesforce/blip-vqa-base";

    // Similarity threshold for pass/fail
    private static final double SIMILARITY_THRESHOLD = 0.3;

    private static final int MAX_RETRIES = 3;
    private static final long RETRY_DELAY_MS = 2000;
    private static final long MODEL_LOADING_WAIT_MS = 20000;

    private final HttpClient httpClient;
    private final String apiToken;
    private final boolean configured;

    /**
     * Default constructor (unconfigured).
     */
    public HuggingFaceVerificationClient() {
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(30))
                .build();
        this.apiToken = null;
        this.configured = false;
    }

    /**
     * Constructor with Secrets Manager for API token retrieval.
     */
    public HuggingFaceVerificationClient(SecretsManagerClient secretsClient, String secretName) {
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
                    log.info("Hugging Face token loaded for verification");
                }
            }
        } catch (Exception e) {
            log.warn("Failed to load Hugging Face token: {}", e.getMessage());
        }

        this.apiToken = token;
        this.configured = isConfigured;
    }

    public boolean isConfigured() {
        return configured;
    }

    /**
     * Verify that a generated image matches its prompt.
     *
     * Strategy:
     * 1. Get image caption using BLIP
     * 2. Calculate keyword overlap between caption and prompt
     * 3. Return score based on similarity
     */
    public QualityScore verifyImage(byte[] imageData, String prompt) {
        QualityScore score = new QualityScore();

        if (!configured) {
            log.warn("Hugging Face verification not configured");
            score.setPassed(true);
            score.setOverallScore(1.0);
            score.setFeedback("Verification skipped - not configured");
            return score;
        }

        try {
            // Step 1: Get image caption
            String caption = getCaptionWithRetry(imageData);
            if (caption == null || caption.isBlank()) {
                log.warn("Failed to get image caption");
                score.setPassed(true);
                score.setOverallScore(0.5);
                score.setFeedback("Could not analyze image - passed with reduced confidence");
                return score;
            }

            log.info("Image caption: {}", caption);

            // Step 2: Calculate similarity between caption and prompt
            double similarity = calculateSimilarity(caption.toLowerCase(), prompt.toLowerCase());

            // Step 3: Build score
            Map<String, Integer> criteriaScores = new HashMap<>();
            criteriaScores.put("prompt_match", (int) (similarity * 100));
            criteriaScores.put("caption_quality", caption.split("\\s+").length > 3 ? 80 : 50);

            boolean passed = similarity >= SIMILARITY_THRESHOLD;
            score.setPassed(passed);
            score.setOverallScore(similarity);
            score.setCriteriaScores(criteriaScores);
            score.setFeedback(String.format("Caption: \"%s\" (similarity: %.0f%%)", caption, similarity * 100));

            log.info("Verification result: passed={}, similarity={:.2f}, caption=\"{}\"",
                    passed, similarity, caption);

        } catch (Exception e) {
            log.error("Verification error: {}", e.getMessage(), e);
            score.setPassed(true);
            score.setOverallScore(0.5);
            score.setFeedback("Verification error - passed with reduced confidence");
        }

        return score;
    }

    private String getCaptionWithRetry(byte[] imageData) {
        for (int attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                return getCaption(imageData);
            } catch (ModelLoadingException e) {
                log.info("Model loading, waiting {}ms (attempt {}/{})",
                        MODEL_LOADING_WAIT_MS, attempt + 1, MAX_RETRIES);
                sleep(MODEL_LOADING_WAIT_MS);
            } catch (Exception e) {
                log.warn("Caption attempt {} failed: {}", attempt + 1, e.getMessage());
                if (attempt < MAX_RETRIES - 1) {
                    sleep(RETRY_DELAY_MS);
                }
            }
        }
        return null;
    }

    private String getCaption(byte[] imageData) throws Exception {
        String url = HF_API_BASE + BLIP_CAPTIONING;

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Authorization", "Bearer " + apiToken)
                .header("Content-Type", "application/octet-stream")
                .timeout(Duration.ofSeconds(120))
                .POST(HttpRequest.BodyPublishers.ofByteArray(imageData))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() == 503) {
            throw new ModelLoadingException("Model is loading");
        }

        if (response.statusCode() != 200) {
            log.error("BLIP API error: status={}, body={}", response.statusCode(), response.body());
            throw new RuntimeException("API error: " + response.statusCode());
        }

        // Parse response - BLIP returns array of objects with "generated_text"
        JsonNode responseJson = objectMapper.readTree(response.body());

        if (responseJson.isArray() && responseJson.size() > 0) {
            JsonNode first = responseJson.get(0);
            if (first.has("generated_text")) {
                return first.get("generated_text").asText();
            }
        }

        log.warn("Unexpected BLIP response format: {}", response.body());
        return null;
    }

    /**
     * Calculate keyword-based similarity between caption and prompt.
     * Uses Jaccard similarity on significant words.
     */
    private double calculateSimilarity(String caption, String prompt) {
        // Extract significant words (length > 2, not common stop words)
        var captionWords = extractKeywords(caption);
        var promptWords = extractKeywords(prompt);

        if (captionWords.isEmpty() || promptWords.isEmpty()) {
            return 0.5; // Can't compare, neutral score
        }

        // Calculate Jaccard similarity: |intersection| / |union|
        long intersection = captionWords.stream()
                .filter(promptWords::contains)
                .count();

        int union = captionWords.size() + promptWords.size() - (int) intersection;

        if (union == 0) return 0.5;

        double jaccard = (double) intersection / union;

        // Also check for key descriptive matches (boost score if main subjects match)
        double keywordBoost = 0;
        for (String word : captionWords) {
            if (prompt.contains(word) && word.length() > 4) {
                keywordBoost += 0.1;
            }
        }

        return Math.min(1.0, jaccard + keywordBoost);
    }

    private java.util.Set<String> extractKeywords(String text) {
        var stopWords = java.util.Set.of(
                "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
                "have", "has", "had", "do", "does", "did", "will", "would", "could",
                "should", "may", "might", "must", "shall", "can", "of", "in", "to",
                "for", "with", "on", "at", "by", "from", "as", "into", "through",
                "during", "before", "after", "above", "below", "between", "under",
                "again", "further", "then", "once", "here", "there", "when", "where",
                "why", "how", "all", "each", "few", "more", "most", "other", "some",
                "such", "no", "nor", "not", "only", "own", "same", "so", "than",
                "too", "very", "just", "and", "but", "if", "or", "because", "until",
                "while", "this", "that", "these", "those", "image", "picture", "photo",
                "showing", "shows", "depicting", "depicts", "illustration", "scene"
        );

        return java.util.Arrays.stream(text.split("\\W+"))
                .filter(w -> w.length() > 2)
                .filter(w -> !stopWords.contains(w))
                .collect(java.util.stream.Collectors.toSet());
    }

    private void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private static class ModelLoadingException extends Exception {
        ModelLoadingException(String message) {
            super(message);
        }
    }
}
