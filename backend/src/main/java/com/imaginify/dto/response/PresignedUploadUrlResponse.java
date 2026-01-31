package com.imaginify.dto.response;

public record PresignedUploadUrlResponse(
        String bookId,
        String uploadUrl,
        String s3Key,
        int expirationMinutes
) {}
