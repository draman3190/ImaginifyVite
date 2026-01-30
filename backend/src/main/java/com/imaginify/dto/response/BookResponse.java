package com.imaginify.dto.response;

import com.imaginify.model.Chapter;

import java.util.List;

public record BookResponse(
        String bookId,
        String title,
        List<String> authors,
        String language,
        String publisher,
        String publicationDate,
        String isbn,
        List<String> genre,
        int pageCount,
        String epubFileUrl,
        List<Chapter> chapters
) {}
