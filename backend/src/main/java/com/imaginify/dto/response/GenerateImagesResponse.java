package com.imaginify.dto.response;

public record GenerateImagesResponse(
        String bookId,
        String status,
        String message
) {}
