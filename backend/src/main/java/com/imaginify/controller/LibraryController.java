package com.imaginify.controller;

import com.imaginify.dto.request.UploadBookRequest;
import com.imaginify.dto.response.BookResponse;
import com.imaginify.dto.response.BookSummaryResponse;
import com.imaginify.service.LibraryService;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/library/books")
public class LibraryController {

    private static final Logger log = LoggerFactory.getLogger(LibraryController.class);

    private final LibraryService libraryService;

    public LibraryController(LibraryService libraryService) {
        this.libraryService = libraryService;
    }

    @GetMapping
    public ResponseEntity<List<BookSummaryResponse>> listBooks() {
        return ResponseEntity.ok(libraryService.listBooks());
    }

    @GetMapping("/{bookId}")
    public ResponseEntity<BookResponse> getBook(@PathVariable String bookId) {
        return ResponseEntity.ok(libraryService.getBook(bookId));
    }

    @GetMapping("/search")
    public ResponseEntity<List<BookSummaryResponse>> searchBooks(@RequestParam String query) {
        return ResponseEntity.ok(libraryService.searchBooks(query));
    }

    @PostMapping
    public ResponseEntity<BookResponse> uploadBook(@Valid @RequestBody UploadBookRequest request) {
        log.info("Received book upload request: {}", request.title());
        BookResponse response = libraryService.createBook(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @DeleteMapping("/{bookId}")
    public ResponseEntity<Void> deleteBook(@PathVariable String bookId) {
        log.info("Received delete request for book: {}", bookId);
        libraryService.deleteBook(bookId);
        return ResponseEntity.noContent().build();
    }
}
