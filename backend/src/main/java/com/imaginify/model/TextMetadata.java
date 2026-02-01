package com.imaginify.model;

import java.util.List;

public record TextMetadata(
        String title,
        List<String> authors,
        String language,
        int totalTextLength,
        List<TextChapter> chapters
) {}
