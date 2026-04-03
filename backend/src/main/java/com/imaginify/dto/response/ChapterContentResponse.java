package com.imaginify.dto.response;

import java.util.List;

public record ChapterContentResponse(
        String bookId,
        int chapterNumber,
        String title,
        String chapterType,
        String content,
        int textLength,
        int totalChapters,
        boolean hasPrevious,
        boolean hasNext,
        List<ImageResponse> images
) {
    public record ImageResponse(
            String id,
            String url,
            int width,
            int height
    ) {}
}
