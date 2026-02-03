package com.imaginify.model;

import java.util.List;

public record TextMetadata(
        String title,
        List<String> authors,
        List<String> genre,
        String language,
        int totalTextLength,
        List<TextChapter> chapters
) {}
