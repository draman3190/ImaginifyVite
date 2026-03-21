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
import software.amazon.awssdk.core.sync.RequestBody;

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

    public BookUploadEventHandler() {
        String tableName = System.getenv("TABLE_NAME");
        this.bucketName = System.getenv("BUCKET_NAME");

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
        this.chapterSummaryService = new ChapterSummaryService();
    }

    BookUploadEventHandler(S3Client s3Client, DynamoDbTable<Book> bookTable,
                           TextParsingService textParsingService,
                           SegmentDetectionService segmentDetectionService,
                           ChapterSummaryService chapterSummaryService,
                           String bucketName) {
        this.s3Client = s3Client;
        this.bookTable = bookTable;
        this.textParsingService = textParsingService;
        this.segmentDetectionService = segmentDetectionService;
        this.chapterSummaryService = chapterSummaryService;
        this.bucketName = bucketName;
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

            List<Chapter> chapters = new ArrayList<>();
            for (TextChapter tc : metadata.chapters()) {
                Chapter chapter = new Chapter();
                chapter.setChapterNumber(tc.chapterNumber());
                chapter.setTitle(tc.title());
                chapter.setStartOffset(tc.startOffset());
                chapter.setTextLength(tc.textLength());

                // Detect chapter type (CONTENT vs TRANSITION for part headers/dividers)
                String chapterType = ChapterTypeDetector.detectType(tc.title(), tc.textLength());
                chapter.setChapterType(chapterType);

                // Extract chapter text
                int endOffset = Math.min(tc.startOffset() + tc.textLength(), fullText.length());
                String chapterText = fullText.substring(tc.startOffset(), endOffset);

                // Upload chapter text to S3 (not stored in DynamoDB due to 400KB limit)
                String chapterTextKey = String.format("books/%s/chapters/%02d.txt", slug, tc.chapterNumber());
                uploadChapterText(eventBucket, chapterTextKey, chapterText);

                // Generate chapter summary
                String summary = chapterSummaryService.generateSummary(chapterText);
                chapter.setSummary(summary);

                // Detect reading segments within the chapter (stores offsets only, not text)
                List<Segment> segments = segmentDetectionService.detectSegments(chapterText);
                for (Segment segment : segments) {
                    segment.setText(null); // Clear segment text - only keep offsets
                }
                chapter.setSegments(segments);
                log.info("Chapter {} '{}' [{}] - {} chars, {} segments, summary: {}",
                        tc.chapterNumber(), tc.title(), chapterType, chapterText.length(), segments.size(),
                        summary != null ? summary.substring(0, Math.min(50, summary.length())) + "..." : "null");

                chapters.add(chapter);
            }
            book.setChapters(chapters);

            book.setProcessingStatus(ProcessingStatus.COMPLETED.name());
            bookTable.putItem(book);
            log.info("Book processing completed: bookId={}, title={}", bookId, book.getTitle());
        } catch (Exception e) {
            log.error("Failed to process book: bookId={}", bookId, e);
            book.setProcessingStatus(ProcessingStatus.FAILED.name());
            bookTable.putItem(book);
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
}
