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
    void generateSummary_longText_returnsFirstFewSentences() {
        String text = "Jack Torrance thought: Officious little prick. " +
                "Ullman stood five-five, and when he moved, it was with the prissy speed. " +
                "The part in his hair was exact. " +
                "His dark suit was sober but comforting. " +
                "I am a man you can bring your problems to. " +
                "This sentence should not appear in the summary.";

        String summary = summaryService.generateSummary(text);

        assertNotNull(summary);
        assertTrue(summary.length() <= 500);
        assertTrue(summary.contains("Jack Torrance thought"));
        // Should have first few sentences
        assertTrue(summary.contains("Ullman stood five-five"));
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
        String text = "Mr. Smith went to the store. Dr. Jones was already there. " +
                "They discussed the matter at length.";

        String summary = summaryService.generateSummary(text);

        assertNotNull(summary);
        // Should not split on "Mr." or "Dr."
        assertTrue(summary.contains("Mr. Smith"));
        assertTrue(summary.contains("Dr. Jones"));
    }

    @Test
    void generateSummary_handlesQuotedText() {
        String text = "She said \"Hello! How are you?\" and smiled. Then she walked away. " +
                "He stood there confused.";

        String summary = summaryService.generateSummary(text);

        assertNotNull(summary);
        // Should not split inside quotes
        assertTrue(summary.contains("Hello! How are you?"));
    }

    @Test
    void generateSummary_normalizesWhitespace() {
        String text = "This   has   extra    spaces.\nAnd\nnewlines\ttoo.\tMore text here.";

        String summary = summaryService.generateSummary(text);

        assertNotNull(summary);
        assertFalse(summary.contains("  ")); // No double spaces
        assertFalse(summary.contains("\n")); // No newlines
    }

    @Test
    void generateSummary_veryLongSingleSentence_truncates() {
        StringBuilder longSentence = new StringBuilder("This is a very long sentence that keeps going and going");
        while (longSentence.length() < 600) {
            longSentence.append(" and going");
        }

        String summary = summaryService.generateSummary(longSentence.toString());

        assertNotNull(summary);
        assertTrue(summary.length() <= 500);
        assertTrue(summary.endsWith("..."));
    }
}
