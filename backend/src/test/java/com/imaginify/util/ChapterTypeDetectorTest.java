package com.imaginify.util;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class ChapterTypeDetectorTest {

    @Test
    void detectType_longContent_returnsContent() {
        // Any chapter over 150 chars is CONTENT regardless of title
        String result = ChapterTypeDetector.detectType("PART ONE", 200);
        assertEquals(ChapterTypeDetector.TYPE_CONTENT, result);
    }

    @Test
    void detectType_shortWithPartTitle_returnsTransition() {
        assertEquals(ChapterTypeDetector.TYPE_TRANSITION,
                ChapterTypeDetector.detectType("PART ONE", 50));
        assertEquals(ChapterTypeDetector.TYPE_TRANSITION,
                ChapterTypeDetector.detectType("Part Two", 100));
        assertEquals(ChapterTypeDetector.TYPE_TRANSITION,
                ChapterTypeDetector.detectType("PART 1", 75));
        assertEquals(ChapterTypeDetector.TYPE_TRANSITION,
                ChapterTypeDetector.detectType("Part I", 80));
        assertEquals(ChapterTypeDetector.TYPE_TRANSITION,
                ChapterTypeDetector.detectType("PART III", 50));
    }

    @Test
    void detectType_shortWithBookTitle_returnsTransition() {
        assertEquals(ChapterTypeDetector.TYPE_TRANSITION,
                ChapterTypeDetector.detectType("BOOK ONE", 50));
        assertEquals(ChapterTypeDetector.TYPE_TRANSITION,
                ChapterTypeDetector.detectType("Book Two", 100));
        assertEquals(ChapterTypeDetector.TYPE_TRANSITION,
                ChapterTypeDetector.detectType("BOOK 3", 75));
    }

    @Test
    void detectType_shortWithVolumeTitle_returnsTransition() {
        assertEquals(ChapterTypeDetector.TYPE_TRANSITION,
                ChapterTypeDetector.detectType("VOLUME I", 50));
        assertEquals(ChapterTypeDetector.TYPE_TRANSITION,
                ChapterTypeDetector.detectType("Volume 2", 100));
    }

    @Test
    void detectType_shortWithSectionTitle_returnsTransition() {
        assertEquals(ChapterTypeDetector.TYPE_TRANSITION,
                ChapterTypeDetector.detectType("SECTION 1", 50));
        assertEquals(ChapterTypeDetector.TYPE_TRANSITION,
                ChapterTypeDetector.detectType("Section One", 100));
    }

    @Test
    void detectType_shortWithActTitle_returnsTransition() {
        assertEquals(ChapterTypeDetector.TYPE_TRANSITION,
                ChapterTypeDetector.detectType("ACT I", 50));
        assertEquals(ChapterTypeDetector.TYPE_TRANSITION,
                ChapterTypeDetector.detectType("Act 3", 100));
    }

    @Test
    void detectType_shortWithKeywords_returnsTransition() {
        assertEquals(ChapterTypeDetector.TYPE_TRANSITION,
                ChapterTypeDetector.detectType("PROLOGUE", 100));
        assertEquals(ChapterTypeDetector.TYPE_TRANSITION,
                ChapterTypeDetector.detectType("Epilogue", 100));
        assertEquals(ChapterTypeDetector.TYPE_TRANSITION,
                ChapterTypeDetector.detectType("PREFACE", 50));
        assertEquals(ChapterTypeDetector.TYPE_TRANSITION,
                ChapterTypeDetector.detectType("Introduction", 100));
        assertEquals(ChapterTypeDetector.TYPE_TRANSITION,
                ChapterTypeDetector.detectType("FOREWORD", 75));
        assertEquals(ChapterTypeDetector.TYPE_TRANSITION,
                ChapterTypeDetector.detectType("Afterword", 100));
        assertEquals(ChapterTypeDetector.TYPE_TRANSITION,
                ChapterTypeDetector.detectType("PREFATORY MATTERS", 80));
        assertEquals(ChapterTypeDetector.TYPE_TRANSITION,
                ChapterTypeDetector.detectType("Interlude", 50));
    }

    @Test
    void detectType_shortWithNormalTitle_returnsContent() {
        // Short content without structural keywords is still CONTENT
        assertEquals(ChapterTypeDetector.TYPE_CONTENT,
                ChapterTypeDetector.detectType("Chapter 1", 100));
        assertEquals(ChapterTypeDetector.TYPE_CONTENT,
                ChapterTypeDetector.detectType("The Beginning", 50));
        assertEquals(ChapterTypeDetector.TYPE_CONTENT,
                ChapterTypeDetector.detectType("Into the Woods", 75));
    }

    @Test
    void detectType_nullOrBlankTitle_returnsContent() {
        assertEquals(ChapterTypeDetector.TYPE_CONTENT,
                ChapterTypeDetector.detectType(null, 50));
        assertEquals(ChapterTypeDetector.TYPE_CONTENT,
                ChapterTypeDetector.detectType("", 50));
        assertEquals(ChapterTypeDetector.TYPE_CONTENT,
                ChapterTypeDetector.detectType("   ", 50));
    }

    @Test
    void detectType_exactlyAtLimit_returnsTransitionIfMatches() {
        // At exactly 150 chars, should still detect as transition if pattern matches
        assertEquals(ChapterTypeDetector.TYPE_TRANSITION,
                ChapterTypeDetector.detectType("PART ONE", 150));
    }

    @Test
    void detectType_justOverLimit_returnsContent() {
        // At 151 chars, should be CONTENT even with matching pattern
        assertEquals(ChapterTypeDetector.TYPE_CONTENT,
                ChapterTypeDetector.detectType("PART ONE", 151));
    }

    @Test
    void detectType_partWithSubtitle_returnsTransition() {
        // Real-world examples from The Shining
        assertEquals(ChapterTypeDetector.TYPE_TRANSITION,
                ChapterTypeDetector.detectType("PART ONE PREFATORY MATTERS", 50));
        assertEquals(ChapterTypeDetector.TYPE_TRANSITION,
                ChapterTypeDetector.detectType("PART TWO Closing Day", 75));
    }
}
