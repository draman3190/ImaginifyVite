package com.imaginify.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.imaginify.dto.response.GenerateImagesResponse;
import com.imaginify.exception.BookNotFoundException;
import com.imaginify.exception.ImageGenerationException;
import com.imaginify.model.Book;
import com.imaginify.model.ImageStatus;
import com.imaginify.model.ProcessingStatus;
import com.imaginify.repository.BookRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.core.SdkBytes;
import software.amazon.awssdk.services.lambda.LambdaClient;
import software.amazon.awssdk.services.lambda.model.InvocationType;
import software.amazon.awssdk.services.lambda.model.InvokeRequest;

import java.util.Map;

/**
 * Service that triggers asynchronous image generation by invoking
 * the ImageGenerationEventHandler Lambda function.
 */
@Service
public class ImageGenerationTriggerService {

    private static final Logger log = LoggerFactory.getLogger(ImageGenerationTriggerService.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();

    private final BookRepository bookRepository;
    private final LambdaClient lambdaClient;
    private final String imageGenerationLambdaName;

    public ImageGenerationTriggerService(
            BookRepository bookRepository,
            LambdaClient lambdaClient,
            @Value("${aws.lambda.image-generation-function-name:}") String imageGenerationLambdaName) {
        this.bookRepository = bookRepository;
        this.lambdaClient = lambdaClient;
        this.imageGenerationLambdaName = imageGenerationLambdaName;
    }

    /**
     * Triggers asynchronous image generation for a book.
     * Sets status to GENERATING and invokes Lambda, then returns immediately.
     */
    public GenerateImagesResponse triggerImageGeneration(String bookId) {
        log.info("Triggering image generation for book: {}", bookId);

        // Validate book exists
        Book book = bookRepository.findById(bookId)
                .orElseThrow(() -> new BookNotFoundException(bookId));

        // Validate book is ready for image generation
        if (!ProcessingStatus.COMPLETED.name().equals(book.getProcessingStatus())) {
            throw new ImageGenerationException(
                    "Book is not ready for image generation. Current status: " + book.getProcessingStatus());
        }

        // Check if already generating
        if (ImageStatus.GENERATING.name().equals(book.getImageStatus())) {
            log.info("Image generation already in progress for book: {}", bookId);
            return new GenerateImagesResponse(bookId, ImageStatus.GENERATING.name(),
                    "Image generation already in progress");
        }

        // Check if already completed
        if (ImageStatus.COMPLETED.name().equals(book.getImageStatus())) {
            log.info("Images already generated for book: {}", bookId);
            return new GenerateImagesResponse(bookId, ImageStatus.COMPLETED.name(),
                    "Images already generated");
        }

        // Set status to GENERATING
        book.setImageStatus(ImageStatus.GENERATING.name());
        bookRepository.save(book);

        // Invoke Lambda asynchronously
        invokeLambdaAsync(bookId);

        return new GenerateImagesResponse(bookId, ImageStatus.GENERATING.name(),
                "Image generation started");
    }

    private void invokeLambdaAsync(String bookId) {
        if (imageGenerationLambdaName == null || imageGenerationLambdaName.isBlank()) {
            log.warn("Image generation Lambda function name not configured. " +
                    "Set aws.lambda.image-generation-function-name property.");
            return;
        }

        try {
            String payload = objectMapper.writeValueAsString(Map.of("bookId", bookId));

            InvokeRequest invokeRequest = InvokeRequest.builder()
                    .functionName(imageGenerationLambdaName)
                    .invocationType(InvocationType.EVENT) // Async invocation
                    .payload(SdkBytes.fromUtf8String(payload))
                    .build();

            lambdaClient.invoke(invokeRequest);
            log.info("Successfully invoked image generation Lambda for book: {}", bookId);

        } catch (Exception e) {
            log.error("Failed to invoke image generation Lambda for book: {}", bookId, e);
            // Revert status on failure
            bookRepository.findById(bookId).ifPresent(book -> {
                book.setImageStatus(ImageStatus.FAILED.name());
                bookRepository.save(book);
            });
            throw new ImageGenerationException("Failed to start image generation: " + e.getMessage(), e);
        }
    }
}
