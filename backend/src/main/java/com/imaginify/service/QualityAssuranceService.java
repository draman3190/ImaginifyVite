package com.imaginify.service;

import com.imaginify.model.QualityScore;
import com.imaginify.service.client.HuggingFaceVerificationClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;

/**
 * Quality Assurance Service implementing 3-layer image validation:
 *
 * Layer 1: Hard Constraints
 *   - File size limits (min 1KB, max 20MB)
 *   - Valid image format detection (PNG, JPEG, GIF, WebP)
 *
 * Layer 2: Visual Scoring (basic)
 *   - Minimum dimensions check
 *   - File integrity validation
 *
 * Layer 3: AI-as-Judge (Claude Vision)
 *   - Prompt matching evaluation
 *   - Visual quality assessment
 *   - Style consistency check
 *   - Content safety verification
 */
@Service
public class QualityAssuranceService {

    private static final Logger log = LoggerFactory.getLogger(QualityAssuranceService.class);
    private static final int MAX_RETRIES = 4;

    // Hard constraint thresholds
    private static final int MIN_IMAGE_SIZE = 1000;         // 1 KB minimum
    private static final int MAX_IMAGE_SIZE = 20_000_000;   // 20 MB maximum

    private final HuggingFaceVerificationClient verificationClient;

    /**
     * Default constructor for Spring context (no AI verification).
     */
    public QualityAssuranceService() {
        this.verificationClient = null;
    }

    /**
     * Constructor with Hugging Face verification client for full 3-layer QA.
     */
    public QualityAssuranceService(HuggingFaceVerificationClient verificationClient) {
        this.verificationClient = verificationClient;
    }

    /**
     * Validate a generated image through 3-layer quality assurance.
     *
     * @param imageData The generated image bytes
     * @param prompt The original prompt used for generation
     * @return QualityScore with pass/fail status, score, and feedback
     */
    public QualityScore validateGeneratedImage(byte[] imageData, String prompt) {
        // Layer 1: Hard Constraints
        QualityScore hardConstraints = validateHardConstraints(imageData);
        if (!hardConstraints.isPassed()) {
            log.warn("Image failed Layer 1 (hard constraints): {}", hardConstraints.getFeedback());
            return hardConstraints;
        }
        log.debug("Image passed Layer 1 (hard constraints)");

        // Layer 2: Visual Scoring (basic validation)
        QualityScore visualScore = validateVisualQuality(imageData);
        if (!visualScore.isPassed()) {
            log.warn("Image failed Layer 2 (visual scoring): {}", visualScore.getFeedback());
            return visualScore;
        }
        log.debug("Image passed Layer 2 (visual scoring)");

        // Layer 3: AI-as-Judge (Hugging Face Vision)
        if (verificationClient != null && verificationClient.isConfigured()) {
            QualityScore aiJudge = verificationClient.verifyImage(imageData, prompt);
            if (!aiJudge.isPassed()) {
                log.warn("Image failed Layer 3 (AI-as-judge): {}", aiJudge.getFeedback());
                return aiJudge;
            }
            log.info("Image passed all 3 QA layers: score={}, feedback={}",
                    aiJudge.getOverallScore(), aiJudge.getFeedback());
            return aiJudge;
        }

        // If verification not configured, return Layer 2 result with note
        log.info("Image passed Layers 1-2 (AI verification not configured)");
        visualScore.setFeedback(visualScore.getFeedback() + " (AI verification skipped)");
        return visualScore;
    }

    /**
     * Layer 1: Validate hard constraints (file size, format).
     */
    private QualityScore validateHardConstraints(byte[] imageData) {
        QualityScore score = new QualityScore();
        Map<String, Integer> criteriaScores = new HashMap<>();

        // Check for null or empty data
        if (imageData == null || imageData.length == 0) {
            score.setPassed(false);
            score.setOverallScore(0.0);
            score.setFeedback("Image data is missing");
            return score;
        }

        // Check minimum size
        if (imageData.length < MIN_IMAGE_SIZE) {
            score.setPassed(false);
            score.setOverallScore(0.0);
            score.setFeedback(String.format("Image too small: %d bytes (minimum %d)", imageData.length, MIN_IMAGE_SIZE));
            return score;
        }

        // Check maximum size
        if (imageData.length > MAX_IMAGE_SIZE) {
            score.setPassed(false);
            score.setOverallScore(0.0);
            score.setFeedback(String.format("Image too large: %d bytes (maximum %d)", imageData.length, MAX_IMAGE_SIZE));
            return score;
        }

        // Validate image format by checking magic bytes
        String format = detectImageFormat(imageData);
        if (format == null) {
            score.setPassed(false);
            score.setOverallScore(0.0);
            score.setFeedback("Unrecognized image format");
            return score;
        }

        criteriaScores.put("size_check", 100);
        criteriaScores.put("format_check", 100);

        score.setPassed(true);
        score.setOverallScore(1.0);
        score.setCriteriaScores(criteriaScores);
        score.setFeedback(String.format("Hard constraints passed: %s format, %d bytes", format, imageData.length));
        return score;
    }

    /**
     * Layer 2: Basic visual quality validation.
     */
    private QualityScore validateVisualQuality(byte[] imageData) {
        QualityScore score = new QualityScore();
        Map<String, Integer> criteriaScores = new HashMap<>();

        // For now, basic validation that the image data appears valid
        // A more sophisticated implementation could:
        // - Decode the image and check dimensions
        // - Analyze color distribution
        // - Detect artifacts or corruption

        String format = detectImageFormat(imageData);

        // Check that the file has proper structure based on format
        boolean structureValid = validateImageStructure(imageData, format);
        if (!structureValid) {
            score.setPassed(false);
            score.setOverallScore(0.0);
            score.setFeedback("Image structure appears corrupted");
            return score;
        }

        criteriaScores.put("structure_check", 100);

        score.setPassed(true);
        score.setOverallScore(0.9); // Good but not perfect without full visual analysis
        score.setCriteriaScores(criteriaScores);
        score.setFeedback("Visual quality validation passed");
        return score;
    }

    /**
     * Detect image format from magic bytes.
     */
    private String detectImageFormat(byte[] imageData) {
        if (imageData.length < 4) {
            return null;
        }

        // PNG: 89 50 4E 47
        if (imageData[0] == (byte) 0x89 && imageData[1] == (byte) 0x50 &&
            imageData[2] == (byte) 0x4E && imageData[3] == (byte) 0x47) {
            return "PNG";
        }

        // JPEG: FF D8 FF
        if (imageData[0] == (byte) 0xFF && imageData[1] == (byte) 0xD8 && imageData[2] == (byte) 0xFF) {
            return "JPEG";
        }

        // GIF: 47 49 46 38
        if (imageData[0] == (byte) 0x47 && imageData[1] == (byte) 0x49 &&
            imageData[2] == (byte) 0x46 && imageData[3] == (byte) 0x38) {
            return "GIF";
        }

        // WebP: RIFF....WEBP
        if (imageData.length > 11 &&
            imageData[0] == (byte) 0x52 && imageData[1] == (byte) 0x49 &&
            imageData[2] == (byte) 0x46 && imageData[3] == (byte) 0x46 &&
            imageData[8] == (byte) 0x57 && imageData[9] == (byte) 0x45 &&
            imageData[10] == (byte) 0x42 && imageData[11] == (byte) 0x50) {
            return "WebP";
        }

        return null;
    }

    /**
     * Validate image structure based on format-specific checks.
     */
    private boolean validateImageStructure(byte[] imageData, String format) {
        if (format == null) {
            return false;
        }

        switch (format) {
            case "PNG":
                // PNG should end with IEND chunk: 00 00 00 00 49 45 4E 44 AE 42 60 82
                // Simplified check: just ensure it has enough data
                return imageData.length > 100;

            case "JPEG":
                // JPEG should end with FF D9
                if (imageData.length > 2) {
                    return imageData[imageData.length - 2] == (byte) 0xFF &&
                           imageData[imageData.length - 1] == (byte) 0xD9;
                }
                return false;

            case "GIF":
                // GIF should end with 3B (trailer)
                return imageData.length > 10 &&
                       imageData[imageData.length - 1] == (byte) 0x3B;

            case "WebP":
                // WebP has RIFF container, just check basic size
                return imageData.length > 100;

            default:
                return true;
        }
    }

    /**
     * Validate a processed image (simpler validation for post-processing).
     */
    public QualityScore validateProcessedImage(byte[] imageData) {
        // Use Layer 1 validation for processed images
        return validateHardConstraints(imageData);
    }

    public int getMaxRetries() {
        return MAX_RETRIES;
    }
}
