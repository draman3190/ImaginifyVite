package com.imaginify.exception;

public class BookNotFoundException extends RuntimeException {

    public BookNotFoundException(String bookId) {
        super("Book not found: " + bookId);
    }
}
