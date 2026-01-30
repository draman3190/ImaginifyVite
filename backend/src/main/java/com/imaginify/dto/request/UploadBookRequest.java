package com.imaginify.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;

import java.util.List;

public record UploadBookRequest(
        @NotBlank(message = "title is required")
        String title,

        @NotEmpty(message = "at least one author is required")
        List<String> authors,

        String language,
        String publisher,
        String publicationDate,
        String isbn,
        List<String> genre
) {}
