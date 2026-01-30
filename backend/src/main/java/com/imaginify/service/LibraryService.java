package com.imaginify.service;

import com.imaginify.dto.request.UploadBookRequest;
import com.imaginify.dto.response.BookResponse;
import com.imaginify.dto.response.BookSummaryResponse;
import com.imaginify.exception.BookNotFoundException;
import com.imaginify.model.Book;
import com.imaginify.repository.BookRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class LibraryService {

    private static final Logger log = LoggerFactory.getLogger(LibraryService.class);

    private final BookRepository bookRepository;

    public LibraryService(BookRepository bookRepository) {
        this.bookRepository = bookRepository;
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
        bookRepository.deleteById(bookId);
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
                book.getPageCount());
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
                book.getChapters());
    }
}
