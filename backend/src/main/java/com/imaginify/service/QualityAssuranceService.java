package com.imaginify.service;

import com.imaginify.model.QualityScore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class QualityAssuranceService {

    private static final Logger log = LoggerFactory.getLogger(QualityAssuranceService.class);
    private static final int MAX_RETRIES = 4;

    public QualityScore validateGeneratedImage(byte[] imageData, String prompt) {
        QualityScore score = new QualityScore();

        // Basic validation: check image data exists and has reasonable size
        if (imageData == null || imageData.length < 1000) {
            score.setPassed(false);
            score.setOverallScore(0.0);
            score.setFeedback("Image data is missing or too small");
            return score;
        }

        // For now, pass all images that meet basic size requirements
        // TODO: Implement 3-layer QA (hard constraints, visual scoring, AI-as-judge)
        score.setPassed(true);
        score.setOverallScore(1.0);
        score.setFeedback("Basic validation passed");
        log.info("Image passed basic QA validation: {} bytes", imageData.length);
        return score;
    }

    public QualityScore validateProcessedImage(byte[] imageData) {
        QualityScore score = new QualityScore();

        if (imageData == null || imageData.length < 1000) {
            score.setPassed(false);
            score.setOverallScore(0.0);
            score.setFeedback("Processed image data is missing or too small");
            return score;
        }

        score.setPassed(true);
        score.setOverallScore(1.0);
        score.setFeedback("Processed image validation passed");
        return score;
    }

    public int getMaxRetries() {
        return MAX_RETRIES;
    }
}
