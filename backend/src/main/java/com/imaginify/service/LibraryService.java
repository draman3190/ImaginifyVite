package com.imaginify.service;

import com.imaginify.dto.request.UploadBookRequest;
import com.imaginify.dto.response.BookResponse;
import com.imaginify.dto.response.BookSummaryResponse;
import com.imaginify.dto.response.ChapterContentResponse;
import com.imaginify.dto.response.PresignedDownloadUrlResponse;
import com.imaginify.dto.response.PresignedUploadUrlResponse;
import com.imaginify.exception.BookNotFoundException;
import com.imaginify.exception.BookProcessingException;
import com.imaginify.model.Book;
import com.imaginify.model.Chapter;
import com.imaginify.model.TextChapter;
import com.imaginify.model.TextMetadata;
import com.imaginify.model.ImageStatus;
import com.imaginify.model.ProcessingStatus;
import com.imaginify.repository.BookRepository;
import com.imaginify.util.ChapterTypeDetector;
import com.imaginify.util.SlugUtils;
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
    private static final String BOOK_KEY_PREFIX = "books/";
    private static final String BOOK_CONTENT_TYPE = "text/plain; charset=utf-8";

    private final BookRepository bookRepository;
    private final StorageService storageService;
    private final TextParsingService textParsingService;
    private final ChapterSummaryService chapterSummaryService;

    public LibraryService(BookRepository bookRepository, StorageService storageService,
                          TextParsingService textParsingService, ChapterSummaryService chapterSummaryService) {
        this.bookRepository = bookRepository;
        this.storageService = storageService;
        this.textParsingService = textParsingService;
        this.chapterSummaryService = chapterSummaryService;
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
        Book book = bookRepository.findById(bookId)
                .orElseThrow(() -> new BookNotFoundException(bookId));
        log.info("Deleting book: id={}, slug={}, status={}", bookId, book.getSlug(), book.getProcessingStatus());

        // Always try to delete the original UUID-based upload file
        // This stops any in-progress Lambda processing
        try {
            String originalKey = BOOK_KEY_PREFIX + bookId + ".txt";
            storageService.deleteFile(originalKey);
            log.info("Deleted original upload file from S3: key={}", originalKey);
        } catch (Exception e) {
            log.debug("Original upload file not found (may have been moved): bookId={}", bookId);
        }

        // Delete slug-based book file and chapter files from S3
        if (book.getSlug() != null) {
            try {
                // Delete the main book file
                String bookKey = String.format("books/%s/book.txt", book.getSlug());
                storageService.deleteFile(bookKey);
                log.info("Deleted book file from S3: key={}", bookKey);

                // Delete chapter files
                if (book.getChapters() != null) {
                    for (Chapter chapter : book.getChapters()) {
                        String chapterKey = String.format("books/%s/chapters/%02d.txt",
                                book.getSlug(), chapter.getChapterNumber());
                        try {
                            storageService.deleteFile(chapterKey);
                        } catch (Exception e) {
                            log.warn("Failed to delete chapter file: key={}", chapterKey);
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("Failed to delete book files from S3: slug={}, error={}", book.getSlug(), e.getMessage());
            }
        }

        bookRepository.deleteById(bookId);
    }

    public PresignedUploadUrlResponse initiateUpload(String filename) {
        String bookId = UUID.randomUUID().toString();
        String s3Key = BOOK_KEY_PREFIX + bookId + ".txt";

        Book book = new Book();
        book.setBookId(bookId);
        book.setTitle(filename);
        book.setProcessingStatus(ProcessingStatus.PENDING_UPLOAD.name());
        book.setImageStatus(ImageStatus.NOT_STARTED.name());
        book.setUploadTimestamp(Instant.now().toString());
        book.setChapters(new ArrayList<>());

        bookRepository.save(book);
        log.info("Initiated upload: bookId={}, s3Key={}", bookId, s3Key);

        String uploadUrl = storageService.generatePresignedUploadUrl(s3Key, BOOK_CONTENT_TYPE);
        return new PresignedUploadUrlResponse(bookId, uploadUrl, s3Key,
                storageService.getPresignedUrlExpirationMinutes());
    }

    public BookResponse confirmUpload(String bookId) {
        Book book = bookRepository.findById(bookId)
                .orElseThrow(() -> new BookNotFoundException(bookId));

        String s3Key = BOOK_KEY_PREFIX + bookId + ".txt";
        if (!storageService.objectExists(s3Key)) {
            throw new BookProcessingException("Book file not found in S3. Upload may not have completed.");
        }

        book.setProcessingStatus(ProcessingStatus.PROCESSING.name());
        bookRepository.save(book);

        try {
            byte[] fileBytes = storageService.downloadFile(s3Key);
            String fullText = new String(fileBytes, java.nio.charset.StandardCharsets.UTF_8);
            TextMetadata metadata = textParsingService.parse(fileBytes);

            if (metadata.title() != null) {
                book.setTitle(metadata.title());
            }
            book.setAuthors(metadata.authors().isEmpty() ? book.getAuthors() : metadata.authors());
            if (metadata.genre() != null && !metadata.genre().isEmpty()) {
                book.setGenre(metadata.genre());
            }
            book.setLanguage(metadata.language());

            // Generate slug from title for S3 paths
            String slug = SlugUtils.slugify(book.getTitle());
            book.setSlug(slug);

            // Move book file to slug-based path
            String newBookKey = String.format("books/%s/book.txt", slug);
            storageService.moveFile(s3Key, newBookKey);
            book.setFileUrl("s3://" + newBookKey);

            List<Chapter> chapters = new ArrayList<>();
            for (TextChapter tc : metadata.chapters()) {
                Chapter chapter = new Chapter();
                chapter.setChapterNumber(tc.chapterNumber());
                chapter.setTitle(tc.title());
                chapter.setStartOffset(tc.startOffset());
                chapter.setTextLength(tc.textLength());

                // Detect chapter type (CONTENT vs TRANSITION for part headers/dividers)
                chapter.setChapterType(ChapterTypeDetector.detectType(tc.title(), tc.textLength()));

                // Extract chapter text
                int endOffset = Math.min(tc.startOffset() + tc.textLength(), fullText.length());
                String chapterText = fullText.substring(tc.startOffset(), endOffset);

                // Upload chapter text to S3 (not stored in DynamoDB due to 400KB limit)
                String chapterTextKey = String.format("books/%s/chapters/%02d.txt", slug, tc.chapterNumber());
                storageService.uploadText(chapterTextKey, chapterText);

                // Generate chapter summary (stored in DynamoDB)
                chapter.setSummary(chapterSummaryService.generateSummary(chapterText));

                chapters.add(chapter);
            }
            book.setChapters(chapters);

            book.setProcessingStatus(ProcessingStatus.COMPLETED.name());
            bookRepository.save(book);
            log.info("Book processing completed: bookId={}, title={}, chapters={}",
                    bookId, book.getTitle(), chapters.size());
            return toResponse(book);
        } catch (BookProcessingException e) {
            book.setProcessingStatus(ProcessingStatus.FAILED.name());
            bookRepository.save(book);
            throw e;
        } catch (Exception e) {
            book.setProcessingStatus(ProcessingStatus.FAILED.name());
            bookRepository.save(book);
            throw new BookProcessingException("Failed to process book: " + e.getMessage(), e);
        }
    }

    public PresignedDownloadUrlResponse getDownloadUrl(String bookId) {
        Book book = bookRepository.findById(bookId)
                .orElseThrow(() -> new BookNotFoundException(bookId));

        // Use slug-based path: books/{slug}/book.txt
        String s3Key = String.format("books/%s/book.txt", book.getSlug());
        String downloadUrl = storageService.generatePresignedDownloadUrl(s3Key);
        return new PresignedDownloadUrlResponse(bookId, downloadUrl,
                storageService.getPresignedUrlExpirationMinutes());
    }

    /**
     * Retrieve chapter text from S3.
     * Chapter text is stored separately in S3 due to DynamoDB's 400KB item size limit.
     */
    public String getChapterText(String bookId, int chapterNumber) {
        Book book = bookRepository.findById(bookId)
                .orElseThrow(() -> new BookNotFoundException(bookId));

        String chapterKey = String.format("books/%s/chapters/%02d.txt", book.getSlug(), chapterNumber);
        return storageService.downloadText(chapterKey);
    }

    /**
     * Retrieve chapter content with navigation metadata for e-reader.
     */
    public ChapterContentResponse getChapterContent(String bookId, int chapterNumber) {
        Book book = bookRepository.findById(bookId)
                .orElseThrow(() -> new BookNotFoundException(bookId));

        List<Chapter> chapters = book.getChapters();
        if (chapters == null || chapters.isEmpty()) {
            throw new BookProcessingException("Book has no chapters");
        }

        int totalChapters = chapters.size();
        if (chapterNumber < 1 || chapterNumber > totalChapters) {
            throw new BookProcessingException(
                    String.format("Chapter %d not found. Book has %d chapters.", chapterNumber, totalChapters));
        }

        Chapter chapter = chapters.stream()
                .filter(ch -> ch.getChapterNumber() == chapterNumber)
                .findFirst()
                .orElseThrow(() -> new BookProcessingException("Chapter " + chapterNumber + " not found"));

        String chapterKey = String.format("books/%s/chapters/%02d.txt", book.getSlug(), chapterNumber);
        String content = storageService.downloadText(chapterKey);

        // Convert S3 URLs to presigned download URLs for images
        List<ChapterContentResponse.ImageResponse> images = new ArrayList<>();
        if (chapter.getImages() != null) {
            for (var img : chapter.getImages()) {
                String s3Url = img.getUrl();
                if (s3Url != null && s3Url.startsWith("s3://")) {
                    // Extract key from s3://bucket/key format
                    String key = s3Url.substring(s3Url.indexOf('/', 5) + 1);
                    String presignedUrl = storageService.generatePresignedDownloadUrl(key);
                    images.add(new ChapterContentResponse.ImageResponse(
                            img.getId(),
                            presignedUrl,
                            img.getWidth(),
                            img.getHeight()
                    ));
                }
            }
        }

        return new ChapterContentResponse(
                bookId,
                chapterNumber,
                chapter.getTitle(),
                chapter.getChapterType(),
                content,
                chapter.getTextLength(),
                totalChapters,
                chapterNumber > 1,
                chapterNumber < totalChapters,
                images
        );
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
        int totalChapters = 0;
        int processedChapters = 0;

        if (book.getChapters() != null) {
            totalChapters = book.getChapters().size();
            processedChapters = (int) book.getChapters().stream()
                    .filter(ch -> ch.getSummary() != null && !ch.getSummary().isBlank())
                    .count();
        }

        return new BookSummaryResponse(
                book.getBookId(),
                book.getTitle(),
                book.getAuthors(),
                book.getGenre(),
                book.getPageCount(),
                book.getProcessingStatus(),
                totalChapters,
                processedChapters,
                book.getUploadTimestamp(),
                book.getImageStatus());
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
                book.getFileUrl(),
                book.getUploadTimestamp(),
                book.getProcessingStatus(),
                book.getDescription(),
                book.getChapters());
    }
}
