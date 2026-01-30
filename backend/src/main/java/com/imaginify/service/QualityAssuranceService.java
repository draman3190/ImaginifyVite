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
        throw new UnsupportedOperationException("Image quality validation not yet implemented");
    }

    public QualityScore validateProcessedImage(byte[] imageData) {
        throw new UnsupportedOperationException("Processed image quality validation not yet implemented");
    }

    public int getMaxRetries() {
        return MAX_RETRIES;
    }
}
