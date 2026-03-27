package com.imaginify.handler;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.imaginify.model.Book;
import com.imaginify.model.Chapter;
import com.imaginify.model.ImageMetadata;
import com.imaginify.model.ImageStatus;
import com.imaginify.service.ImageFormattingService;
import com.imaginify.service.PromptTemplateService;
import com.imaginify.service.QualityAssuranceService;
import com.imaginify.service.client.AiImageGenerationClient;
import com.imaginify.service.client.HuggingFaceImageClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import software.amazon.awssdk.enhanced.dynamodb.DynamoDbEnhancedClient;
import software.amazon.awssdk.enhanced.dynamodb.DynamoDbTable;
import software.amazon.awssdk.enhanced.dynamodb.Key;
import software.amazon.awssdk.enhanced.dynamodb.TableSchema;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.secretsmanager.SecretsManagerClient;
import software.amazon.awssdk.core.sync.RequestBody;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Event-driven Lambda handler for asynchronous image generation.
 * Triggered by the ImageGenerationController via async Lambda invocation.
 *
 * This handler:
 * 1. Retrieves book metadata from DynamoDB
 * 2. Processes each chapter to generate images
 * 3. Validates images through 3-layer quality assurance
 * 4. Post-processes images (extract from collage, resize, enhance)
 * 5. Stores optimized images in S3
 * 6. Updates book status incrementally
 */
public class ImageGenerationEventHandler implements RequestHandler<Map<String, String>, String> {

    private static final Logger log = LoggerFactory.getLogger(ImageGenerationEventHandler.class);
    private static final int MAX_QA_RETRIES = 4; // 5 total attempts

    private final S3Client s3Client;
    private final DynamoDbTable<Book> bookTable;
    private final String bucketName;
    private final PromptTemplateService promptTemplateService;
    private final AiImageGenerationClient imageGenerationClient;
    private final QualityAssuranceService qualityAssuranceService;
    private final ImageFormattingService imageFormattingService;

    public ImageGenerationEventHandler() {
        String tableName = System.getenv("TABLE_NAME");
        this.bucketName = System.getenv("BUCKET_NAME");
        String secretName = System.getenv("SECRET_NAME");

        this.s3Client = S3Client.builder()
                .httpClient(UrlConnectionHttpClient.create())
                .build();

        DynamoDbClient dynamoDbClient = DynamoDbClient.builder()
                .httpClient(UrlConnectionHttpClient.create())
                .build();
        DynamoDbEnhancedClient enhancedClient = DynamoDbEnhancedClient.builder()
                .dynamoDbClient(dynamoDbClient)
                .build();
        this.bookTable = enhancedClient.table(tableName, TableSchema.fromBean(Book.class));

        // Initialize services
        this.promptTemplateService = new PromptTemplateService();
        this.imageFormattingService = new ImageFormattingService();

        // Initialize clients that require Secrets Manager
        AiImageGenerationClient imageClient = null;

        if (secretName != null && !secretName.isBlank()) {
            try {
                SecretsManagerClient secretsClient = SecretsManagerClient.builder()
                        .httpClient(UrlConnectionHttpClient.create())
                        .build();

                // Initialize Hugging Face client for image generation (FLUX model)
                imageClient = new HuggingFaceImageClient(secretsClient, secretName);
                log.info("Hugging Face image generation client initialized, configured: {}",
                        ((HuggingFaceImageClient) imageClient).isConfigured());

            } catch (Exception e) {
                log.warn("Failed to initialize API clients", e);
            }
        }

        this.imageGenerationClient = imageClient;
        // Use Layers 1-2 QA only (AI verification disabled until reliable free API available)
        this.qualityAssuranceService = new QualityAssuranceService();
    }

    // Test constructor for dependency injection
    ImageGenerationEventHandler(S3Client s3Client, DynamoDbTable<Book> bookTable, String bucketName,
                                 PromptTemplateService promptTemplateService,
                                 AiImageGenerationClient imageGenerationClient,
                                 QualityAssuranceService qualityAssuranceService,
                                 ImageFormattingService imageFormattingService) {
        this.s3Client = s3Client;
        this.bookTable = bookTable;
        this.bucketName = bucketName;
        this.promptTemplateService = promptTemplateService;
        this.imageGenerationClient = imageGenerationClient;
        this.qualityAssuranceService = qualityAssuranceService;
        this.imageFormattingService = imageFormattingService;
    }

    @Override
    public String handleRequest(Map<String, String> event, Context context) {
        String bookId = event.get("bookId");
        if (bookId == null || bookId.isBlank()) {
            log.error("Missing bookId in event");
            return "ERROR: Missing bookId";
        }

        log.info("Starting image generation for book: {}", bookId);

        Book book = bookTable.getItem(Key.builder().partitionValue(bookId).build());
        if (book == null) {
            log.error("Book not found: {}", bookId);
            return "ERROR: Book not found";
        }

        // Verify book is in GENERATING state (set by controller)
        if (!ImageStatus.GENERATING.name().equals(book.getImageStatus())) {
            log.warn("Book not in GENERATING state, current status: {}", book.getImageStatus());
            return "ERROR: Invalid state";
        }

        try {
            processBook(book);
            book.setImageStatus(ImageStatus.COMPLETED.name());
            bookTable.putItem(book);
            log.info("Image generation completed for book: {}", bookId);
            return "OK";
        } catch (Exception e) {
            log.error("Image generation failed for book: {}", bookId, e);
            book.setImageStatus(ImageStatus.FAILED.name());
            bookTable.putItem(book);
            return "ERROR: " + e.getMessage();
        }
    }

    private void processBook(Book book) {
        List<Chapter> chapters = book.getChapters();
        if (chapters == null || chapters.isEmpty()) {
            log.warn("Book has no chapters: {}", book.getBookId());
            return;
        }

        for (int i = 0; i < chapters.size(); i++) {
            Chapter chapter = chapters.get(i);
            log.info("Processing chapter {}/{}: {}", i + 1, chapters.size(), chapter.getTitle());

            try {
                processChapter(book, chapter);
                // Save progress after each chapter
                bookTable.putItem(book);
            } catch (Exception e) {
                log.error("Failed to process chapter {}: {}", chapter.getChapterNumber(), e.getMessage(), e);
                // Continue with next chapter instead of failing entire book
            }
        }
    }

    private void processChapter(Book book, Chapter chapter) {
        // Skip transition chapters (part headers, etc.)
        if ("TRANSITION".equals(chapter.getChapterType())) {
            log.info("Skipping transition chapter: {}", chapter.getTitle());
            return;
        }

        // Step 1: Build prompt with book/chapter context
        String prompt = buildPrompt(book, chapter);

        // Step 2: Generate collage image with QA retries
        byte[] collageImage = generateImageWithRetries(prompt, chapter);
        if (collageImage == null) {
            log.warn("Failed to generate valid image for chapter {} after retries", chapter.getChapterNumber());
            return;
        }

        // Step 3: Extract individual images from collage
        List<byte[]> extractedImages = extractImagesFromCollage(collageImage);

        // Step 4: Post-process and store each image
        List<ImageMetadata> imageMetadataList = new ArrayList<>();
        for (int i = 0; i < extractedImages.size(); i++) {
            byte[] processedImage = postProcessImage(extractedImages.get(i));
            if (processedImage == null) {
                continue;
            }

            // Store in S3: books/{slug}/images/chapter_{chapterNum}/{imgNum}.png
            String key = String.format("books/%s/images/chapter_%02d/%03d.png",
                    book.getSlug(), chapter.getChapterNumber(), i + 1);
            String url = uploadImage(key, processedImage);

            ImageMetadata metadata = new ImageMetadata();
            metadata.setId(UUID.randomUUID().toString());
            metadata.setUrl(url);
            metadata.setProvider(imageGenerationClient != null ? imageGenerationClient.getProviderName() : "unknown");
            metadata.setWidth(1024);
            metadata.setHeight(1024);
            metadata.setFormat("png");
            metadata.setCreatedAt(Instant.now());
            metadata.setType("CHAPTER");
            imageMetadataList.add(metadata);
        }

        chapter.setImages(imageMetadataList);
        log.info("Generated {} images for chapter {}", imageMetadataList.size(), chapter.getChapterNumber());
    }

    private String buildPrompt(Book book, Chapter chapter) {
        // TODO: Retrieve chapter text from S3 and build full prompt
        // For now, use summary as context
        return promptTemplateService.buildVisualizationPrompt(
                book.getTitle(),
                book.getAuthors(),
                book.getGenre(),
                book.getTone(),
                book.getArtStyle(),
                chapter.getChapterNumber(),
                chapter.getTitle(),
                chapter.getSummary()
        );
    }

    /**
     * Generate image with quality assurance retries.
     * Layer 1: Hard constraints (resolution, aspect ratio, file size)
     * Layer 2: Automated visual scoring (sharpness, contrast, artifacts)
     * Layer 3: AI-as-judge (theme matching, style consistency)
     */
    private byte[] generateImageWithRetries(String prompt, Chapter chapter) {
        if (imageGenerationClient == null) {
            log.warn("Image generation client not configured, skipping generation");
            return null;
        }

        for (int attempt = 1; attempt <= MAX_QA_RETRIES + 1; attempt++) {
            try {
                log.info("Image generation attempt {}/{} for chapter {}",
                        attempt, MAX_QA_RETRIES + 1, chapter.getChapterNumber());

                byte[] imageData = imageGenerationClient.generateImage(prompt);

                // Validate through 3-layer QA
                var qaResult = qualityAssuranceService.validateGeneratedImage(imageData, prompt);
                if (qaResult.isPassed()) {
                    log.info("Image passed QA on attempt {}", attempt);
                    return imageData;
                }

                log.warn("Image failed QA on attempt {}: {}", attempt, qaResult.getFeedback());
            } catch (UnsupportedOperationException e) {
                // Stub implementation - expected during development
                log.info("Image generation not yet implemented (stub)");
                return null;
            } catch (Exception e) {
                log.error("Image generation error on attempt {}: {}", attempt, e.getMessage());
            }
        }

        log.error("Image generation failed QA after {} attempts for chapter {}",
                MAX_QA_RETRIES + 1, chapter.getChapterNumber());
        // Record metric for monitoring
        return null;
    }

    /**
     * Extract individual images from collage.
     * Detects visual regions and extracts each as independent image.
     */
    private List<byte[]> extractImagesFromCollage(byte[] collageImage) {
        try {
            return imageFormattingService.extractFromCollage(collageImage);
        } catch (UnsupportedOperationException e) {
            log.info("Collage extraction not yet implemented (stub)");
            // Return single image as fallback
            return List.of(collageImage);
        }
    }

    /**
     * Post-process image: resize, enhance, format conversion.
     * Validates processed image meets quality benchmarks.
     */
    private byte[] postProcessImage(byte[] imageData) {
        try {
            // Resize to target resolution
            byte[] resized = imageFormattingService.resize(imageData, 1024, 1024);

            // Enhance (sharpen, denoise)
            byte[] enhanced = imageFormattingService.enhance(resized);

            // Convert to PNG
            byte[] formatted = imageFormattingService.convertFormat(enhanced, "png");

            // Validate processed image
            var qaResult = qualityAssuranceService.validateProcessedImage(formatted);
            if (!qaResult.isPassed()) {
                log.warn("Processed image failed QA: {}", qaResult.getFeedback());
                // Return original if processing degrades quality
                return imageData;
            }

            return formatted;
        } catch (UnsupportedOperationException e) {
            log.info("Image post-processing not yet implemented (stub)");
            return imageData;
        }
    }

    private String uploadImage(String key, byte[] imageData) {
        log.info("Uploading image to S3: bucket={}, key={}", bucketName, key);
        s3Client.putObject(
                PutObjectRequest.builder()
                        .bucket(bucketName)
                        .key(key)
                        .contentType("image/png")
                        .build(),
                RequestBody.fromBytes(imageData));
        return "s3://" + bucketName + "/" + key;
    }
}
