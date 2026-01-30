package com.imaginify.dto.request;

import jakarta.validation.constraints.NotBlank;

public record GenerateImagesRequest(
        @NotBlank(message = "bookId is required")
        String bookId
) {}
