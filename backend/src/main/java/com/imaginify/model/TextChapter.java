package com.imaginify.model;

public record TextChapter(
        int chapterNumber,
        String title,
        int startOffset,
        int textLength
) {}
