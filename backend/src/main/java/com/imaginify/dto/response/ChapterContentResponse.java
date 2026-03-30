package com.imaginify.dto.response;

public record ChapterContentResponse(
        String bookId,
        int chapterNumber,
        String title,
        String chapterType,
        String content,
        int textLength,
        int totalChapters,
        boolean hasPrevious,
        boolean hasNext
) {}
