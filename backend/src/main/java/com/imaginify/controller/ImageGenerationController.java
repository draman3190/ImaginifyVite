package com.imaginify.controller;

import com.imaginify.dto.request.GenerateImagesRequest;
import com.imaginify.dto.response.GenerateImagesResponse;
import com.imaginify.service.ImageGenerationTriggerService;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/images")
public class ImageGenerationController {

    private static final Logger log = LoggerFactory.getLogger(ImageGenerationController.class);

    private final ImageGenerationTriggerService triggerService;

    public ImageGenerationController(ImageGenerationTriggerService triggerService) {
        this.triggerService = triggerService;
    }

    /**
     * Triggers asynchronous image generation for a book.
     * Returns immediately with GENERATING status while processing happens in background Lambda.
     */
    @PostMapping("/generate")
    public ResponseEntity<GenerateImagesResponse> generateImages(
            @Valid @RequestBody GenerateImagesRequest request) {
        log.info("Received image generation request for book: {}", request.bookId());
        GenerateImagesResponse response = triggerService.triggerImageGeneration(request.bookId());
        return ResponseEntity.accepted().body(response);
    }
}
