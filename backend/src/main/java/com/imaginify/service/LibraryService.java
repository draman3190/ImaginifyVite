package com.imaginify.service;

import com.imaginify.dto.request.UploadBookRequest;
import com.imaginify.dto.response.BookResponse;
import com.imaginify.dto.response.BookSummaryResponse;
import com.imaginify.dto.response.PresignedDownloadUrlResponse;
import com.imaginify.dto.response.PresignedUploadUrlResponse;
import com.imaginify.exception.BookNotFoundException;
import com.imaginify.exception.EpubProcessingException;
import com.imaginify.model.Book;
import com.imaginify.model.Chapter;
import com.imaginify.model.EpubChapter;
import com.imaginify.model.EpubMetadata;
import com.imaginify.model.ProcessingStatus;
import com.imaginify.repository.BookRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class LibraryService {

    private static final Logger log = LoggerFactory.getLogger(LibraryService.class);
    private static final String EPUB_KEY_PREFIX = "epubs/";
    private static final String EPUB_CONTENT_TYPE = "application/epub+zip";

    private final BookRepository bookRepository;
    private final StorageService storageService;
    private final EpubParsingService epubParsingService;

    public LibraryService(BookRepository bookRepository, StorageService storageService,
                          EpubParsingService epubParsingService) {
        this.bookRepository = bookRepository;
        this.storageService = storageService;
        this.epubParsingService = epubParsingService;
    }

    public List<BookSummaryResponse> listBooks() {
        return bookRepository.findAll().stream()
                .map(this::toSummary)
                .toList();
    }

    public BookResponse getBook(String bookId) {
        Book book = bookRepository.findById(bookId)
                .orElseThrow(() -> new BookNotFoundException(bookId));
        return toResponse(book);
    }

    public List<BookSummaryResponse> searchBooks(String query) {
        String lowerQuery = query.toLowerCase();
        return bookRepository.findAll().stream()
                .filter(book -> matchesQuery(book, lowerQuery))
                .map(this::toSummary)
                .toList();
    }

    public BookResponse createBook(UploadBookRequest request) {
        Book book = new Book();
        book.setBookId(UUID.randomUUID().toString());
        book.setTitle(request.title());
        book.setAuthors(request.authors());
        book.setLanguage(request.language());
        book.setPublisher(request.publisher());
        book.setPublicationDate(request.publicationDate());
        book.setIsbn(request.isbn());
        book.setGenre(request.genre());
        book.setChapters(new ArrayList<>());

        log.info("Creating book: id={}, title={}", book.getBookId(), book.getTitle());
        bookRepository.save(book);
        return toResponse(book);
    }

    public void deleteBook(String bookId) {
        bookRepository.findById(bookId)
                .orElseThrow(() -> new BookNotFoundException(bookId));
        log.info("Deleting book: id={}", bookId);

        String epubKey = EPUB_KEY_PREFIX + bookId + ".epub";
        try {
            storageService.deleteFile(epubKey);
            log.info("Deleted EPUB from S3: key={}", epubKey);
        } catch (Exception e) {
            log.warn("Failed to delete EPUB from S3 (may not exist): key={}, error={}", epubKey, e.getMessage());
        }

        bookRepository.deleteById(bookId);
    }

    public PresignedUploadUrlResponse initiateUpload(String filename) {
        String bookId = UUID.randomUUID().toString();
        String s3Key = EPUB_KEY_PREFIX + bookId + ".epub";

        Book book = new Book();
        book.setBookId(bookId);
        book.setTitle(filename);
        book.setProcessingStatus(ProcessingStatus.PENDING_UPLOAD.name());
        book.setUploadTimestamp(Instant.now().toString());
        book.setChapters(new ArrayList<>());

        bookRepository.save(book);
        log.info("Initiated upload: bookId={}, s3Key={}", bookId, s3Key);

        String uploadUrl = storageService.generatePresignedUploadUrl(s3Key, EPUB_CONTENT_TYPE);
        return new PresignedUploadUrlResponse(bookId, uploadUrl, s3Key,
                storageService.getPresignedUrlExpirationMinutes());
    }

    public BookResponse confirmUpload(String bookId) {
        Book book = bookRepository.findById(bookId)
                .orElseThrow(() -> new BookNotFoundException(bookId));

        String s3Key = EPUB_KEY_PREFIX + bookId + ".epub";
        if (!storageService.objectExists(s3Key)) {
            throw new EpubProcessingException("EPUB file not found in S3. Upload may not have completed.");
        }

        book.setProcessingStatus(ProcessingStatus.PROCESSING.name());
        bookRepository.save(book);

        try {
            byte[] epubBytes = storageService.downloadFile(s3Key);
            EpubMetadata metadata = epubParsingService.parse(epubBytes);

            if (metadata.title() != null) {
                book.setTitle(metadata.title());
            }
            book.setAuthors(metadata.authors().isEmpty() ? book.getAuthors() : metadata.authors());
            book.setLanguage(metadata.language());
            book.setPublisher(metadata.publisher());
            book.setPublicationDate(metadata.publicationDate());
            book.setDescription(metadata.description());
            book.setIsbn(metadata.isbn());
            book.setEpubFileUrl("s3://" + s3Key);

            List<Chapter> chapters = new ArrayList<>();
            for (EpubChapter ec : metadata.chapters()) {
                Chapter chapter = new Chapter();
                chapter.setChapterNumber(ec.chapterNumber());
                chapter.setTitle(ec.title());
                chapter.setTextLength(ec.textLength());
                chapters.add(chapter);
            }
            book.setChapters(chapters);

            book.setProcessingStatus(ProcessingStatus.COMPLETED.name());
            bookRepository.save(book);
            log.info("EPUB processing completed: bookId={}, title={}", bookId, book.getTitle());
            return toResponse(book);
        } catch (EpubProcessingException e) {
            book.setProcessingStatus(ProcessingStatus.FAILED.name());
            bookRepository.save(book);
            throw e;
        } catch (Exception e) {
            book.setProcessingStatus(ProcessingStatus.FAILED.name());
            bookRepository.save(book);
            throw new EpubProcessingException("Failed to process EPUB: " + e.getMessage(), e);
        }
    }

    public PresignedDownloadUrlResponse getDownloadUrl(String bookId) {
        bookRepository.findById(bookId)
                .orElseThrow(() -> new BookNotFoundException(bookId));

        String s3Key = EPUB_KEY_PREFIX + bookId + ".epub";
        String downloadUrl = storageService.generatePresignedDownloadUrl(s3Key);
        return new PresignedDownloadUrlResponse(bookId, downloadUrl,
                storageService.getPresignedUrlExpirationMinutes());
    }

    private boolean matchesQuery(Book book, String query) {
        if (book.getTitle() != null && book.getTitle().toLowerCase().contains(query)) {
            return true;
        }
        if (book.getAuthors() != null) {
            return book.getAuthors().stream()
                    .anyMatch(author -> author.toLowerCase().contains(query));
        }
        return false;
    }

    private BookSummaryResponse toSummary(Book book) {
        return new BookSummaryResponse(
                book.getBookId(),
                book.getTitle(),
                book.getAuthors(),
                book.getGenre(),
                book.getPageCount(),
                book.getProcessingStatus());
    }

    private BookResponse toResponse(Book book) {
        return new BookResponse(
                book.getBookId(),
                book.getTitle(),
                book.getAuthors(),
                book.getLanguage(),
                book.getPublisher(),
                book.getPublicationDate(),
                book.getIsbn(),
                book.getGenre(),
                book.getPageCount(),
                book.getEpubFileUrl(),
                book.getUploadTimestamp(),
                book.getProcessingStatus(),
                book.getDescription(),
                book.getChapters());
    }
}
