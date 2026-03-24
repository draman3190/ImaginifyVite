package com.imaginify.dto.response;

import java.util.List;

public record BookSummaryResponse(
        String bookId,
        String title,
        List<String> authors,
        List<String> genre,
        int pageCount,
        String processingStatus,
        int totalChapters,
        int processedChapters,
        String uploadTimestamp
) {}
