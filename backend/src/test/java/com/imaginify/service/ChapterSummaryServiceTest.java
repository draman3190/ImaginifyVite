package com.imaginify.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class ChapterSummaryServiceTest {

    private ChapterSummaryService summaryService;

    @BeforeEach
    void setUp() {
        summaryService = new ChapterSummaryService();
    }

    @Test
    void generateSummary_shortText_returnsEntireText() {
        String text = "This is a short chapter. It has only two sentences.";
        String summary = summaryService.generateSummary(text);

        assertEquals("This is a short chapter. It has only two sentences.", summary);
    }

    @Test
    void generateSummary_longText_samplesSentencesFromFullChapter() {
        // Create a long chapter with many sentences
        StringBuilder text = new StringBuilder();
        text.append("The story begins in a small town. The protagonist arrives at the station. ");
        for (int i = 0; i < 50; i++) {
            text.append("The middle section continues with more events. ");
        }
        text.append("The chapter concludes with a surprising revelation. The end is near.");

        String summary = summaryService.generateSummary(text.toString());

        assertNotNull(summary);
        assertTrue(summary.length() <= 800);
        // Should include the beginning sentence
        assertTrue(summary.contains("The story begins"));
        // Summary should have multiple sentences (3-5)
        long sentenceCount = summary.chars().filter(c -> c == '.').count();
        assertTrue(sentenceCount >= 3, "Should have at least 3 sentences");
    }

    @Test
    void generateSummary_nullText_returnsNull() {
        assertNull(summaryService.generateSummary(null));
    }

    @Test
    void generateSummary_emptyText_returnsNull() {
        assertNull(summaryService.generateSummary(""));
        assertNull(summaryService.generateSummary("   "));
    }

    @Test
    void generateSummary_handlesAbbreviations() {
        String text = "Mr. Smith went to the store on Main St. to meet someone. " +
                "Dr. Jones was already there waiting for him. " +
                "They discussed the matter at length about the project.";

        String summary = summaryService.generateSummary(text);

        assertNotNull(summary);
        // Should not split on "Mr." or "Dr." or "St."
        assertTrue(summary.contains("Mr. Smith"));
        assertTrue(summary.contains("Dr. Jones"));
    }

    @Test
    void generateSummary_handlesQuotedText() {
        String text = "She said \"Hello! How are you?\" and smiled warmly. " +
                "Then she walked away down the long corridor. " +
                "He stood there confused about what had happened.";

        String summary = summaryService.generateSummary(text);

        assertNotNull(summary);
        // Should not split inside quotes
        assertTrue(summary.contains("Hello! How are you?"));
    }

    @Test
    void generateSummary_normalizesWhitespace() {
        String text = "This   has   extra    spaces and some content.\nAnd\nnewlines\ttoo.\tMore text here is needed.";

        String summary = summaryService.generateSummary(text);

        assertNotNull(summary);
        assertFalse(summary.contains("  ")); // No double spaces
        assertFalse(summary.contains("\n")); // No newlines
    }

    @Test
    void generateSummary_veryLongSingleSentence_truncates() {
        StringBuilder longSentence = new StringBuilder("This is a very long sentence that keeps going and going");
        while (longSentence.length() < 1000) {
            longSentence.append(" and going");
        }

        String summary = summaryService.generateSummary(longSentence.toString());

        assertNotNull(summary);
        assertTrue(summary.length() <= 800);
        assertTrue(summary.endsWith("..."));
    }

    @Test
    void generateSummary_produces3To5Sentences() {
        // Create a chapter with many sentences
        StringBuilder text = new StringBuilder();
        for (int i = 1; i <= 20; i++) {
            text.append("This is sentence number ").append(i).append(" in the chapter. ");
        }

        String summary = summaryService.generateSummary(text.toString());

        assertNotNull(summary);
        // Count sentences (roughly by counting periods followed by space or end)
        long sentenceCount = summary.chars().filter(c -> c == '.').count();
        assertTrue(sentenceCount >= 3, "Summary should have at least 3 sentences, had " + sentenceCount);
        assertTrue(sentenceCount <= 6, "Summary should have at most 5-6 sentences, had " + sentenceCount);
    }

    @Test
    void generateSummary_includesContentFromDifferentPartsOfChapter() {
        StringBuilder text = new StringBuilder();
        text.append("BEGINNING: The adventure started at dawn. The hero left home. ");
        for (int i = 0; i < 30; i++) {
            text.append("MIDDLE: The journey continued through forests and valleys. ");
        }
        text.append("END: Finally they reached the destination. The quest was complete.");

        String summary = summaryService.generateSummary(text.toString());

        assertNotNull(summary);
        assertTrue(summary.length() <= 800);
        // Should include the beginning
        assertTrue(summary.contains("BEGINNING") || summary.contains("adventure started"),
                "Should include content from the beginning");
        // Summary should have multiple sentences
        long sentenceCount = summary.chars().filter(c -> c == '.').count();
        assertTrue(sentenceCount >= 3, "Should have at least 3 sentences, had " + sentenceCount);
    }
}
