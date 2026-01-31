package com.imaginify.dto.response;

public record PresignedDownloadUrlResponse(
        String bookId,
        String downloadUrl,
        int expirationMinutes
) {}
