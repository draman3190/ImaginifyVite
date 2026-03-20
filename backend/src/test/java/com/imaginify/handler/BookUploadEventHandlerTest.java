package com.imaginify.handler;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.events.S3Event;
import com.amazonaws.services.lambda.runtime.events.models.s3.S3EventNotification;
import com.imaginify.model.Book;
import com.imaginify.model.Chapter;
import com.imaginify.model.ProcessingStatus;
import com.imaginify.service.ChapterSummaryService;
import com.imaginify.service.SegmentDetectionService;
import com.imaginify.service.TextParsingService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.enhanced.dynamodb.DynamoDbTable;
import software.amazon.awssdk.enhanced.dynamodb.Key;
import software.amazon.awssdk.enhanced.dynamodb.model.PutItemEnhancedRequest;
import software.amazon.awssdk.services.dynamodb.model.ConditionalCheckFailedException;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectResponse;
import software.amazon.awssdk.core.sync.RequestBody;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@SuppressWarnings("unchecked")
class BookUploadEventHandlerTest {

    private static final String BUCKET_NAME = "test-bucket";
    private static final String BOOK_ID = "550e8400-e29b-41d4-a716-446655440000";
    private static final String S3_KEY = "books/" + BOOK_ID + ".txt";

    private S3Client s3Client;
    private DynamoDbTable<Book> bookTable;
    private TextParsingService textParsingService;
    private SegmentDetectionService segmentDetectionService;
    private ChapterSummaryService chapterSummaryService;
    private Context context;
    private BookUploadEventHandler handler;

    @BeforeEach
    void setUp() {
        s3Client = mock(S3Client.class);
        bookTable = mock(DynamoDbTable.class);
        textParsingService = new TextParsingService();
        segmentDetectionService = new SegmentDetectionService();
        chapterSummaryService = new ChapterSummaryService();
        context = mock(Context.class);
        handler = new BookUploadEventHandler(s3Client, bookTable, textParsingService,
                segmentDetectionService, chapterSummaryService, BUCKET_NAME);
    }

    @Test
    void happyPath_parsesAndUpdatesBook() {
        String fileContent = "Title: My Great Book\nAuthor: Jane Doe\nLanguage: English\n\nChapter 1: The Beginning\nSome text here.\n\nChapter 2: The End\nMore text here.\n";
        S3Event event = createS3Event(BUCKET_NAME, S3_KEY);
        Book book = createPendingBook();

        when(bookTable.getItem(any(Key.class))).thenReturn(book);
        mockS3Download(fileContent);

        String result = handler.handleRequest(event, context);

        assertEquals("OK", result);

        // First putItem is the conditional claim (PROCESSING), second is the final save (COMPLETED)
        ArgumentCaptor<PutItemEnhancedRequest<Book>> requestCaptor = ArgumentCaptor.forClass(PutItemEnhancedRequest.class);
        ArgumentCaptor<Book> bookCaptor = ArgumentCaptor.forClass(Book.class);
        verify(bookTable, times(1)).putItem(requestCaptor.capture());
        verify(bookTable, times(1)).putItem(bookCaptor.capture());

        Book savedBook = bookCaptor.getValue();
        assertEquals(ProcessingStatus.COMPLETED.name(), savedBook.getProcessingStatus());
        assertEquals("My Great Book", savedBook.getTitle());
        assertEquals("my-great-book", savedBook.getSlug());
        assertEquals(List.of("Jane Doe"), savedBook.getAuthors());
        assertEquals("English", savedBook.getLanguage());
        assertNotNull(savedBook.getChapters());
        assertEquals(2, savedBook.getChapters().size());
        assertEquals("Chapter 1: The Beginning", savedBook.getChapters().get(0).getTitle());
        assertEquals("Chapter 2: The End", savedBook.getChapters().get(1).getTitle());

        // Verify summary is populated (text is stored in S3, not in the chapter)
        Chapter chapter1 = savedBook.getChapters().get(0);
        assertNotNull(chapter1.getSummary());

        // Verify chapter text was uploaded to S3 with slug and zero-padded numbers
        ArgumentCaptor<PutObjectRequest> putCaptor = ArgumentCaptor.forClass(PutObjectRequest.class);
        verify(s3Client, times(2)).putObject(putCaptor.capture(), any(RequestBody.class));
        List<PutObjectRequest> puts = putCaptor.getAllValues();
        assertEquals("books/my-great-book/chapters/01.txt", puts.get(0).key());
        assertEquals("books/my-great-book/chapters/02.txt", puts.get(1).key());
    }

    @Test
    void idempotency_skipsWhenConditionalCheckFails() {
        S3Event event = createS3Event(BUCKET_NAME, S3_KEY);
        Book book = createPendingBook();

        when(bookTable.getItem(any(Key.class))).thenReturn(book);
        doThrow(ConditionalCheckFailedException.builder().message("Condition not met").build())
                .when(bookTable).putItem(any(PutItemEnhancedRequest.class));

        String result = handler.handleRequest(event, context);

        assertEquals("OK", result);
        // Should not attempt S3 download
        verify(s3Client, never()).getObjectAsBytes(any(GetObjectRequest.class));
    }

    @Test
    void skipsAlreadyCompletedBook() {
        S3Event event = createS3Event(BUCKET_NAME, S3_KEY);
        Book book = createPendingBook();
        book.setProcessingStatus(ProcessingStatus.COMPLETED.name());

        when(bookTable.getItem(any(Key.class))).thenReturn(book);

        String result = handler.handleRequest(event, context);

        assertEquals("OK", result);
        verify(bookTable, never()).putItem(any(PutItemEnhancedRequest.class));
        verify(bookTable, never()).putItem(any(Book.class));
    }

    @Test
    void skipsInvalidS3Key() {
        S3Event event = createS3Event(BUCKET_NAME, "images/some-image.png");

        String result = handler.handleRequest(event, context);

        assertEquals("OK", result);
        verify(bookTable, never()).getItem(any(Key.class));
    }

    @Test
    void skipsKeyWithInvalidUuid() {
        S3Event event = createS3Event(BUCKET_NAME, "books/not-a-uuid.txt");

        String result = handler.handleRequest(event, context);

        assertEquals("OK", result);
        verify(bookTable, never()).getItem(any(Key.class));
    }

    @Test
    void skipsWhenBookNotFound() {
        S3Event event = createS3Event(BUCKET_NAME, S3_KEY);

        when(bookTable.getItem(any(Key.class))).thenReturn(null);

        String result = handler.handleRequest(event, context);

        assertEquals("OK", result);
        verify(bookTable, never()).putItem(any(PutItemEnhancedRequest.class));
    }

    @Test
    void setsFailedStatusOnParsingError() {
        S3Event event = createS3Event(BUCKET_NAME, S3_KEY);
        Book book = createPendingBook();

        when(bookTable.getItem(any(Key.class))).thenReturn(book);
        when(s3Client.getObjectAsBytes(any(GetObjectRequest.class)))
                .thenThrow(new RuntimeException("S3 download failed"));

        String result = handler.handleRequest(event, context);

        assertEquals("OK", result);
        // One conditional putItem (claim) + one putItem (FAILED)
        ArgumentCaptor<Book> bookCaptor = ArgumentCaptor.forClass(Book.class);
        verify(bookTable, times(1)).putItem(bookCaptor.capture());
        assertEquals(ProcessingStatus.FAILED.name(), bookCaptor.getValue().getProcessingStatus());
    }

    @Test
    void handlesFileWithNoChapters() {
        String fileContent = "Title: Simple Book\nAuthor: John Smith\n\nJust a plain text file with no chapter markers.\n";
        S3Event event = createS3Event(BUCKET_NAME, S3_KEY);
        Book book = createPendingBook();

        when(bookTable.getItem(any(Key.class))).thenReturn(book);
        mockS3Download(fileContent);

        handler.handleRequest(event, context);

        ArgumentCaptor<Book> bookCaptor = ArgumentCaptor.forClass(Book.class);
        verify(bookTable, times(1)).putItem(bookCaptor.capture());
        Book savedBook = bookCaptor.getValue();
        assertEquals(ProcessingStatus.COMPLETED.name(), savedBook.getProcessingStatus());
        assertEquals(1, savedBook.getChapters().size());
        assertEquals("Full Text", savedBook.getChapters().get(0).getTitle());
    }

    private Book createPendingBook() {
        Book book = new Book();
        book.setBookId(BOOK_ID);
        book.setTitle("placeholder.txt");
        book.setProcessingStatus(ProcessingStatus.PENDING_UPLOAD.name());
        book.setChapters(new ArrayList<>());
        return book;
    }

    private void mockS3Download(String content) {
        byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
        ResponseBytes<GetObjectResponse> responseBytes = ResponseBytes.fromByteArray(
                GetObjectResponse.builder().build(), bytes);
        when(s3Client.getObjectAsBytes(any(GetObjectRequest.class))).thenReturn(responseBytes);
        // Mock S3 putObject for chapter text uploads
        when(s3Client.putObject(any(PutObjectRequest.class), any(RequestBody.class)))
                .thenReturn(PutObjectResponse.builder().build());
    }

    private S3Event createS3Event(String bucket, String key) {
        S3EventNotification.S3BucketEntity bucketEntity =
                new S3EventNotification.S3BucketEntity(bucket, null, null);
        S3EventNotification.S3ObjectEntity objectEntity =
                new S3EventNotification.S3ObjectEntity(key, null, null, null, null);
        S3EventNotification.S3Entity s3Entity =
                new S3EventNotification.S3Entity(null, bucketEntity, objectEntity, null);
        S3EventNotification.S3EventNotificationRecord record =
                new S3EventNotification.S3EventNotificationRecord(
                        null, null, null, null, null, null, null, s3Entity, null);
        return new S3Event(List.of(record));
    }
}
