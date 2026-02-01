package com.imaginify.service;

import com.imaginify.dto.response.BookResponse;
import com.imaginify.dto.response.BookSummaryResponse;
import com.imaginify.dto.response.PresignedDownloadUrlResponse;
import com.imaginify.dto.response.PresignedUploadUrlResponse;
import com.imaginify.exception.BookNotFoundException;
import com.imaginify.exception.BookProcessingException;
import com.imaginify.model.Book;
import com.imaginify.model.TextChapter;
import com.imaginify.model.TextMetadata;
import com.imaginify.model.ProcessingStatus;
import com.imaginify.repository.BookRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class LibraryServiceTest {

    @Mock
    private BookRepository bookRepository;

    @Mock
    private StorageService storageService;

    @Mock
    private TextParsingService textParsingService;

    private LibraryService libraryService;

    @BeforeEach
    void setUp() {
        libraryService = new LibraryService(bookRepository, storageService, textParsingService);
    }

    @Test
    void listBooks_returnsAllBooks() {
        Book book = createTestBook("id-1", "Book One");
        when(bookRepository.findAll()).thenReturn(List.of(book));

        List<BookSummaryResponse> result = libraryService.listBooks();

        assertEquals(1, result.size());
        assertEquals("Book One", result.get(0).title());
    }

    @Test
    void getBook_existingBook_returnsResponse() {
        Book book = createTestBook("id-1", "Book One");
        when(bookRepository.findById("id-1")).thenReturn(Optional.of(book));

        BookResponse result = libraryService.getBook("id-1");

        assertEquals("id-1", result.bookId());
        assertEquals("Book One", result.title());
    }

    @Test
    void getBook_nonExistentBook_throwsException() {
        when(bookRepository.findById("missing")).thenReturn(Optional.empty());

        assertThrows(BookNotFoundException.class, () -> libraryService.getBook("missing"));
    }

    @Test
    void searchBooks_matchesByTitle() {
        Book book = createTestBook("id-1", "Moby Dick");
        when(bookRepository.findAll()).thenReturn(List.of(book));

        List<BookSummaryResponse> result = libraryService.searchBooks("moby");

        assertEquals(1, result.size());
        assertEquals("Moby Dick", result.get(0).title());
    }

    @Test
    void searchBooks_matchesByAuthor() {
        Book book = createTestBook("id-1", "Some Book");
        book.setAuthors(List.of("Herman Melville"));
        when(bookRepository.findAll()).thenReturn(List.of(book));

        List<BookSummaryResponse> result = libraryService.searchBooks("melville");

        assertEquals(1, result.size());
    }

    @Test
    void searchBooks_noMatch_returnsEmpty() {
        Book book = createTestBook("id-1", "Book One");
        when(bookRepository.findAll()).thenReturn(List.of(book));

        List<BookSummaryResponse> result = libraryService.searchBooks("nonexistent");

        assertTrue(result.isEmpty());
    }

    @Test
    void deleteBook_existingBook_deletesFromDbAndS3() {
        Book book = createTestBook("id-1", "Book One");
        when(bookRepository.findById("id-1")).thenReturn(Optional.of(book));

        libraryService.deleteBook("id-1");

        verify(storageService).deleteFile("books/id-1.txt");
        verify(bookRepository).deleteById("id-1");
    }

    @Test
    void deleteBook_s3DeleteFails_stillDeletesFromDb() {
        Book book = createTestBook("id-1", "Book One");
        when(bookRepository.findById("id-1")).thenReturn(Optional.of(book));
        doThrow(new RuntimeException("S3 error")).when(storageService).deleteFile(anyString());

        libraryService.deleteBook("id-1");

        verify(bookRepository).deleteById("id-1");
    }

    @Test
    void deleteBook_nonExistentBook_throwsException() {
        when(bookRepository.findById("missing")).thenReturn(Optional.empty());

        assertThrows(BookNotFoundException.class, () -> libraryService.deleteBook("missing"));
    }

    @Test
    void initiateUpload_createsBookAndReturnsPresignedUrl() {
        when(storageService.generatePresignedUploadUrl(anyString(), anyString()))
                .thenReturn("https://s3.example.com/upload-url");
        when(storageService.getPresignedUrlExpirationMinutes()).thenReturn(15);

        PresignedUploadUrlResponse result = libraryService.initiateUpload("mybook.txt");

        assertNotNull(result.bookId());
        assertEquals("https://s3.example.com/upload-url", result.uploadUrl());
        assertTrue(result.s3Key().startsWith("books/"));
        assertTrue(result.s3Key().endsWith(".txt"));
        assertEquals(15, result.expirationMinutes());

        ArgumentCaptor<Book> bookCaptor = ArgumentCaptor.forClass(Book.class);
        verify(bookRepository).save(bookCaptor.capture());
        Book savedBook = bookCaptor.getValue();
        assertEquals("mybook.txt", savedBook.getTitle());
        assertEquals(ProcessingStatus.PENDING_UPLOAD.name(), savedBook.getProcessingStatus());
        assertNotNull(savedBook.getUploadTimestamp());
    }

    @Test
    void confirmUpload_successfulParsing_updatesBook() {
        Book book = createTestBook("id-1", "placeholder.txt");
        book.setProcessingStatus(ProcessingStatus.PENDING_UPLOAD.name());
        when(bookRepository.findById("id-1")).thenReturn(Optional.of(book));
        when(storageService.objectExists("books/id-1.txt")).thenReturn(true);
        when(storageService.downloadFile("books/id-1.txt")).thenReturn(new byte[]{1, 2, 3});

        TextMetadata metadata = new TextMetadata(
                "Parsed Title", List.of("Author Name"), "en", 5000,
                List.of(new TextChapter(1, "Chapter 1", 0, 5000)));
        when(textParsingService.parse(any())).thenReturn(metadata);

        BookResponse result = libraryService.confirmUpload("id-1");

        assertEquals("Parsed Title", result.title());
        assertEquals("Author Name", result.authors().get(0));
        assertEquals("en", result.language());
        assertEquals(ProcessingStatus.COMPLETED.name(), result.processingStatus());
        assertEquals(1, result.chapters().size());

        verify(bookRepository, times(2)).save(any(Book.class));
    }

    @Test
    void confirmUpload_fileNotInS3_throwsException() {
        Book book = createTestBook("id-1", "test.txt");
        when(bookRepository.findById("id-1")).thenReturn(Optional.of(book));
        when(storageService.objectExists("books/id-1.txt")).thenReturn(false);

        assertThrows(BookProcessingException.class, () -> libraryService.confirmUpload("id-1"));
    }

    @Test
    void confirmUpload_parsingFails_setsStatusToFailed() {
        Book book = createTestBook("id-1", "test.txt");
        when(bookRepository.findById("id-1")).thenReturn(Optional.of(book));
        when(storageService.objectExists("books/id-1.txt")).thenReturn(true);
        when(storageService.downloadFile("books/id-1.txt")).thenReturn(new byte[]{1, 2, 3});
        when(textParsingService.parse(any())).thenThrow(new BookProcessingException("Parse error"));

        assertThrows(BookProcessingException.class, () -> libraryService.confirmUpload("id-1"));

        ArgumentCaptor<Book> captor = ArgumentCaptor.forClass(Book.class);
        verify(bookRepository, atLeast(2)).save(captor.capture());
        List<Book> savedBooks = captor.getAllValues();
        Book lastSaved = savedBooks.get(savedBooks.size() - 1);
        assertEquals(ProcessingStatus.FAILED.name(), lastSaved.getProcessingStatus());
    }

    @Test
    void confirmUpload_nonExistentBook_throwsException() {
        when(bookRepository.findById("missing")).thenReturn(Optional.empty());

        assertThrows(BookNotFoundException.class, () -> libraryService.confirmUpload("missing"));
    }

    @Test
    void getDownloadUrl_existingBook_returnsPresignedUrl() {
        Book book = createTestBook("id-1", "Book One");
        when(bookRepository.findById("id-1")).thenReturn(Optional.of(book));
        when(storageService.generatePresignedDownloadUrl("books/id-1.txt"))
                .thenReturn("https://s3.example.com/download-url");
        when(storageService.getPresignedUrlExpirationMinutes()).thenReturn(15);

        PresignedDownloadUrlResponse result = libraryService.getDownloadUrl("id-1");

        assertEquals("id-1", result.bookId());
        assertEquals("https://s3.example.com/download-url", result.downloadUrl());
        assertEquals(15, result.expirationMinutes());
    }

    @Test
    void getDownloadUrl_nonExistentBook_throwsException() {
        when(bookRepository.findById("missing")).thenReturn(Optional.empty());

        assertThrows(BookNotFoundException.class, () -> libraryService.getDownloadUrl("missing"));
    }

    @Test
    void toSummary_includesProcessingStatus() {
        Book book = createTestBook("id-1", "Book One");
        book.setProcessingStatus(ProcessingStatus.COMPLETED.name());
        when(bookRepository.findAll()).thenReturn(List.of(book));

        List<BookSummaryResponse> result = libraryService.listBooks();

        assertEquals(ProcessingStatus.COMPLETED.name(), result.get(0).processingStatus());
    }

    @Test
    void toResponse_includesNewFields() {
        Book book = createTestBook("id-1", "Book One");
        book.setUploadTimestamp("2024-01-01T00:00:00Z");
        book.setProcessingStatus(ProcessingStatus.COMPLETED.name());
        book.setDescription("A great book");
        when(bookRepository.findById("id-1")).thenReturn(Optional.of(book));

        BookResponse result = libraryService.getBook("id-1");

        assertEquals("2024-01-01T00:00:00Z", result.uploadTimestamp());
        assertEquals(ProcessingStatus.COMPLETED.name(), result.processingStatus());
        assertEquals("A great book", result.description());
    }

    private Book createTestBook(String id, String title) {
        Book book = new Book();
        book.setBookId(id);
        book.setTitle(title);
        book.setAuthors(List.of("Test Author"));
        book.setChapters(new ArrayList<>());
        return book;
    }
}
