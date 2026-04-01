package com.imaginify.handler;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.S3Event;
import com.amazonaws.services.lambda.runtime.events.models.s3.S3EventNotification;
import com.imaginify.model.Book;
import com.imaginify.model.Chapter;
import com.imaginify.model.ProcessingStatus;
import com.imaginify.model.Segment;
import com.imaginify.model.TextChapter;
import com.imaginify.model.TextMetadata;
import com.imaginify.service.ChapterSummaryService;
import com.imaginify.service.SegmentDetectionService;
import com.imaginify.service.TextParsingService;
import com.imaginify.util.ChapterTypeDetector;
import com.imaginify.util.SlugUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.enhanced.dynamodb.DynamoDbEnhancedClient;
import software.amazon.awssdk.enhanced.dynamodb.DynamoDbTable;
import software.amazon.awssdk.enhanced.dynamodb.Expression;
import software.amazon.awssdk.enhanced.dynamodb.Key;
import software.amazon.awssdk.enhanced.dynamodb.TableSchema;
import software.amazon.awssdk.enhanced.dynamodb.model.PutItemEnhancedRequest;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.ConditionalCheckFailedException;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.CopyObjectRequest;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.secretsmanager.SecretsManagerClient;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.lambda.LambdaClient;
import software.amazon.awssdk.services.lambda.model.InvocationType;
import software.amazon.awssdk.services.lambda.model.InvokeRequest;
import software.amazon.awssdk.core.SdkBytes;

import com.imaginify.model.ImageStatus;
import com.imaginify.service.client.GeminiTextClient;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class BookUploadEventHandler implements RequestHandler<S3Event, String> {

    private static final Logger log = LoggerFactory.getLogger(BookUploadEventHandler.class);
    private static final Pattern BOOK_KEY_PATTERN = Pattern.compile(
            "^books/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\\.txt$");

    private final S3Client s3Client;
    private final DynamoDbTable<Book> bookTable;
    private final TextParsingService textParsingService;
    private final SegmentDetectionService segmentDetectionService;
    private final ChapterSummaryService chapterSummaryService;
    private final String bucketName;
    private final LambdaClient lambdaClient;
    private final String imageGenerationLambdaName;

    public BookUploadEventHandler() {
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
        this.textParsingService = new TextParsingService();
        this.segmentDetectionService = new SegmentDetectionService();

        // Initialize Gemini client for AI-powered chapter summarization
        GeminiTextClient geminiClient = null;
        if (secretName != null && !secretName.isBlank()) {
            try {
                SecretsManagerClient secretsClient = SecretsManagerClient.builder()
                        .httpClient(UrlConnectionHttpClient.create())
                        .build();
                geminiClient = new GeminiTextClient(secretsClient, secretName);
                log.info("Gemini client initialized, AI summarization enabled: {}", geminiClient.isConfigured());
            } catch (Exception e) {
                log.warn("Failed to initialize Gemini client, falling back to extractive summarization", e);
            }
        }
        this.chapterSummaryService = new ChapterSummaryService(geminiClient);

        // Initialize Lambda client for triggering image generation
        this.lambdaClient = LambdaClient.builder()
                .httpClient(UrlConnectionHttpClient.create())
                .build();
        this.imageGenerationLambdaName = System.getenv("IMAGE_GENERATION_LAMBDA_NAME");
    }

    BookUploadEventHandler(S3Client s3Client, DynamoDbTable<Book> bookTable,
                           TextParsingService textParsingService,
                           SegmentDetectionService segmentDetectionService,
                           ChapterSummaryService chapterSummaryService,
                           String bucketName,
                           LambdaClient lambdaClient,
                           String imageGenerationLambdaName) {
        this.s3Client = s3Client;
        this.bookTable = bookTable;
        this.textParsingService = textParsingService;
        this.segmentDetectionService = segmentDetectionService;
        this.chapterSummaryService = chapterSummaryService;
        this.bucketName = bucketName;
        this.lambdaClient = lambdaClient;
        this.imageGenerationLambdaName = imageGenerationLambdaName;
    }

    @Override
    public String handleRequest(S3Event event, Context context) {
        for (S3EventNotification.S3EventNotificationRecord record : event.getRecords()) {
            String key = record.getS3().getObject().getUrlDecodedKey();
            String eventBucket = record.getS3().getBucket().getName();
            processRecord(eventBucket, key);
        }
        return "OK";
    }

    private void processRecord(String eventBucket, String key) {
        Matcher matcher = BOOK_KEY_PATTERN.matcher(key);
        if (!matcher.matches()) {
            log.info("Skipping non-matching key: {}", key);
            return;
        }

        String bookId = matcher.group(1);
        log.info("Processing book upload: bookId={}, key={}", bookId, key);

        Book book = bookTable.getItem(Key.builder().partitionValue(bookId).build());
        if (book == null) {
            log.warn("Book not found in DynamoDB: bookId={}", bookId);
            return;
        }

        if (ProcessingStatus.COMPLETED.name().equals(book.getProcessingStatus())) {
            log.info("Book already completed, skipping: bookId={}", bookId);
            return;
        }

        // Atomic claim: only proceed if status is PENDING_UPLOAD
        try {
            book.setProcessingStatus(ProcessingStatus.PROCESSING.name());
            bookTable.putItem(PutItemEnhancedRequest.builder(Book.class)
                    .item(book)
                    .conditionExpression(Expression.builder()
                            .expression("processingStatus = :expected")
                            .expressionValues(Map.of(
                                    ":expected", software.amazon.awssdk.services.dynamodb.model.AttributeValue.builder()
                                            .s(ProcessingStatus.PENDING_UPLOAD.name())
                                            .build()))
                            .build())
                    .build());
        } catch (ConditionalCheckFailedException e) {
            log.info("Book already claimed by another invocation, skipping: bookId={}", bookId);
            return;
        }

        try {
            ResponseBytes<GetObjectResponse> responseBytes = s3Client.getObjectAsBytes(
                    GetObjectRequest.builder()
                            .bucket(eventBucket)
                            .key(key)
                            .build());
            byte[] fileBytes = responseBytes.asByteArray();

            TextMetadata metadata = textParsingService.parse(fileBytes);
            String fullText = new String(fileBytes, StandardCharsets.UTF_8);

            if (metadata.title() != null) {
                book.setTitle(metadata.title());
            }
            if (metadata.authors() != null && !metadata.authors().isEmpty()) {
                book.setAuthors(metadata.authors());
            }
            if (metadata.genre() != null && !metadata.genre().isEmpty()) {
                book.setGenre(metadata.genre());
            }
            book.setLanguage(metadata.language());

            // Generate slug from title for S3 paths
            String slug = SlugUtils.slugify(book.getTitle());
            book.setSlug(slug);

            // Copy book file to slug-based path and delete the UUID-based file
            String newBookKey = String.format("books/%s/book.txt", slug);
            copyAndDeleteFile(eventBucket, key, newBookKey);
            book.setFileUrl("s3://" + newBookKey);

            // First pass: Create chapter structures with metadata (no summaries yet)
            // This allows frontend to show totalChapters immediately
            List<Chapter> chapters = new ArrayList<>();
            for (TextChapter tc : metadata.chapters()) {
                Chapter chapter = new Chapter();
                chapter.setChapterNumber(tc.chapterNumber());
                chapter.setTitle(tc.title());
                chapter.setStartOffset(tc.startOffset());
                chapter.setTextLength(tc.textLength());
                chapter.setChapterType(ChapterTypeDetector.detectType(tc.title(), tc.textLength()));
                chapters.add(chapter);
            }
            book.setChapters(chapters);

            // Save with chapter count - abort if book was deleted
            if (!saveBookIfExists(book, bookId)) {
                log.info("Book was deleted during processing, aborting: bookId={}", bookId);
                return;
            }
            log.info("Book metadata saved with {} chapters, beginning summarization", chapters.size());

            // Second pass: Generate summaries and save progress incrementally
            for (int i = 0; i < metadata.chapters().size(); i++) {
                TextChapter tc = metadata.chapters().get(i);
                Chapter chapter = chapters.get(i);

                // Extract chapter text
                int endOffset = Math.min(tc.startOffset() + tc.textLength(), fullText.length());
                String chapterText = fullText.substring(tc.startOffset(), endOffset);

                // Upload chapter text to S3 (not stored in DynamoDB due to 400KB limit)
                String chapterTextKey = String.format("books/%s/chapters/%02d.txt", slug, tc.chapterNumber());
                uploadChapterText(eventBucket, chapterTextKey, chapterText);

                // Generate chapter summary (skips TRANSITION chapters)
                String summary = chapterSummaryService.generateSummary(chapterText, chapter.getChapterType());
                chapter.setSummary(summary);

                // Detect reading segments within the chapter (stores offsets only, not text)
                List<Segment> segments = segmentDetectionService.detectSegments(chapterText);
                for (Segment segment : segments) {
                    segment.setText(null); // Clear segment text - only keep offsets
                }
                chapter.setSegments(segments);

                log.info("Chapter {} '{}' [{}] - {} chars, {} segments, summary: {}",
                        tc.chapterNumber(), tc.title(), chapter.getChapterType(), chapterText.length(), segments.size(),
                        summary != null ? summary.substring(0, Math.min(50, summary.length())) + "..." : "null");

                // Save progress after each chapter - abort if book was deleted
                if (!saveBookIfExists(book, bookId)) {
                    log.info("Book was deleted during processing, aborting: bookId={}", bookId);
                    return;
                }
            }
            book.setChapters(chapters);

            book.setProcessingStatus(ProcessingStatus.COMPLETED.name());

            // Final save - abort if book was deleted
            if (!saveBookIfExists(book, bookId)) {
                log.info("Book was deleted during processing, aborting: bookId={}", bookId);
                return;
            }
            log.info("Book processing completed: bookId={}, title={}", bookId, book.getTitle());

            // Auto-trigger image generation
            triggerImageGeneration(bookId, book);
        } catch (Exception e) {
            log.error("Failed to process book: bookId={}", bookId, e);
            book.setProcessingStatus(ProcessingStatus.FAILED.name());
            // Only save failure status if book still exists
            saveBookIfExists(book, bookId);
        }
    }

    /**
     * Saves the book to DynamoDB only if it still exists (wasn't deleted).
     * Uses a conditional write to prevent re-creating deleted books.
     *
     * @return true if save succeeded, false if book was deleted
     */
    private boolean saveBookIfExists(Book book, String bookId) {
        try {
            bookTable.putItem(PutItemEnhancedRequest.builder(Book.class)
                    .item(book)
                    .conditionExpression(Expression.builder()
                            .expression("attribute_exists(bookId)")
                            .build())
                    .build());
            return true;
        } catch (ConditionalCheckFailedException e) {
            log.info("Book no longer exists (was deleted): bookId={}", bookId);
            return false;
        }
    }

    private void uploadChapterText(String bucket, String key, String text) {
        log.info("Uploading chapter text to S3: bucket={}, key={}, length={}", bucket, key, text.length());
        s3Client.putObject(
                PutObjectRequest.builder()
                        .bucket(bucket)
                        .key(key)
                        .contentType("text/plain; charset=utf-8")
                        .build(),
                RequestBody.fromString(text));
    }

    private void copyAndDeleteFile(String bucket, String sourceKey, String destKey) {
        log.info("Moving book file: {} -> {}", sourceKey, destKey);
        s3Client.copyObject(CopyObjectRequest.builder()
                .sourceBucket(bucket)
                .sourceKey(sourceKey)
                .destinationBucket(bucket)
                .destinationKey(destKey)
                .build());
        s3Client.deleteObject(DeleteObjectRequest.builder()
                .bucket(bucket)
                .key(sourceKey)
                .build());
    }

    /**
     * Triggers asynchronous image generation for a book by invoking the image generation Lambda.
     * Sets imageStatus to GENERATING and invokes the Lambda asynchronously.
     */
    private void triggerImageGeneration(String bookId, Book book) {
        if (imageGenerationLambdaName == null || imageGenerationLambdaName.isBlank()) {
            log.warn("Image generation Lambda function name not configured. " +
                    "Set IMAGE_GENERATION_LAMBDA_NAME environment variable.");
            return;
        }

        try {
            // Set status to GENERATING before invoking Lambda - only if book still exists
            book.setImageStatus(ImageStatus.GENERATING.name());
            if (!saveBookIfExists(book, bookId)) {
                log.info("Book was deleted, skipping image generation: bookId={}", bookId);
                return;
            }

            String payload = String.format("{\"bookId\":\"%s\"}", bookId);

            InvokeRequest invokeRequest = InvokeRequest.builder()
                    .functionName(imageGenerationLambdaName)
                    .invocationType(InvocationType.EVENT) // Async invocation
                    .payload(SdkBytes.fromUtf8String(payload))
                    .build();

            lambdaClient.invoke(invokeRequest);
            log.info("Successfully triggered image generation for book: {}", bookId);

        } catch (Exception e) {
            log.error("Failed to trigger image generation for book: {}", bookId, e);
            // Revert status on failure - only if book still exists
            book.setImageStatus(ImageStatus.FAILED.name());
            saveBookIfExists(book, bookId);
        }
    }
}
