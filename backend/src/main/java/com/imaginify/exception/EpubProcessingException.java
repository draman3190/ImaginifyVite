package com.imaginify.exception;

public class EpubProcessingException extends RuntimeException {

    public EpubProcessingException(String message) {
        super(message);
    }

    public EpubProcessingException(String message, Throwable cause) {
        super(message, cause);
    }
}
