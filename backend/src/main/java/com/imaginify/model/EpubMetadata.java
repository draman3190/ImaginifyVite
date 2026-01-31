package com.imaginify.model;

import java.util.List;

public record EpubMetadata(
        String title,
        List<String> authors,
        String language,
        String publisher,
        String publicationDate,
        String description,
        String isbn,
        List<EpubChapter> chapters
) {}
