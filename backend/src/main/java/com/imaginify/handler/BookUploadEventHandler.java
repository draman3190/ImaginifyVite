package com.imaginify.handler;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.S3Event;
import com.amazonaws.services.lambda.runtime.events.models.s3.S3EventNotification;
import com.imaginify.model.Book;
import com.imaginify.model.Chapter;
import com.imaginify.model.ProcessingStatus;
import com.imaginify.model.TextChapter;
import com.imaginify.model.TextMetadata;
import com.imaginify.service.TextParsingService;
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
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;

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
    }

    BookUploadEventHandler(S3Client s3Client, DynamoDbTable<Book> bookTable,
                           TextParsingService textParsingService, String bucketName) {
        this.s3Client = s3Client;
        this.bookTable = bookTable;
        this.textParsingService = textParsingService;
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
            book.setLanguage(metadata.language());
            book.setFileUrl("s3://" + key);

            List<Chapter> chapters = new ArrayList<>();
            for (TextChapter tc : metadata.chapters()) {
                Chapter chapter = new Chapter();
                chapter.setChapterNumber(tc.chapterNumber());
                chapter.setTitle(tc.title());
                chapter.setStartOffset(tc.startOffset());
                chapter.setTextLength(tc.textLength());

                // Extract and store the full chapter text for image generation prompts
                int endOffset = Math.min(tc.startOffset() + tc.textLength(), fullText.length());
                String chapterText = fullText.substring(tc.startOffset(), endOffset);
                chapter.setText(chapterText);

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
}
