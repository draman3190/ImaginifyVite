package com.imaginify.service;

import org.springframework.stereotype.Service;

/**
 * Generates summaries for chapter text.
 *
 * Currently uses extractive summarization (first few sentences).
 * Can be enhanced with AI-based abstractive summarization later.
 */
@Service
public class ChapterSummaryService {

    private static final int MAX_SUMMARY_LENGTH = 500;
    private static final int MIN_SUMMARY_LENGTH = 100;
    private static final int TARGET_SENTENCE_COUNT = 3;

    /**
     * Generate a summary for the given chapter text.
     * Extracts the first few meaningful sentences up to the max length.
     *
     * @param chapterText the full chapter text
     * @return a summary string, or null if text is empty
     */
    public String generateSummary(String chapterText) {
        if (chapterText == null || chapterText.isBlank()) {
            return null;
        }

        String cleaned = cleanText(chapterText);
        if (cleaned.length() <= MAX_SUMMARY_LENGTH) {
            return cleaned;
        }

        return extractSentences(cleaned);
    }

    /**
     * Clean the text by normalizing whitespace.
     */
    private String cleanText(String text) {
        // Normalize whitespace
        return text.replaceAll("\\s+", " ").trim();
    }

    /**
     * Extract the first few sentences from the text.
     */
    private String extractSentences(String text) {
        StringBuilder summary = new StringBuilder();
        int position = 0;
        int sentenceCount = 0;

        while (position < text.length() && sentenceCount < TARGET_SENTENCE_COUNT) {
            int sentenceEnd = findSentenceEnd(text, position);

            if (sentenceEnd == -1) {
                // No more sentence endings found, take the rest up to max length
                int available = MAX_SUMMARY_LENGTH - summary.length();
                int remaining = text.length() - position;

                if (remaining > 0 && available > 0) {
                    if (remaining <= available) {
                        summary.append(text, position, position + remaining);
                    } else {
                        // Need to truncate
                        int cutoff = Math.min(remaining, available - 3); // Leave room for "..."
                        summary.append(text, position, position + cutoff);
                        // Trim to last word boundary
                        String current = summary.toString();
                        int lastSpace = current.lastIndexOf(' ');
                        if (lastSpace > current.length() - 30 && lastSpace > 0) {
                            summary = new StringBuilder(current.substring(0, lastSpace));
                        }
                        summary.append("...");
                    }
                }
                break;
            }

            int sentenceLength = sentenceEnd - position + 1;

            // Check if adding this sentence would exceed max length
            if (summary.length() + sentenceLength > MAX_SUMMARY_LENGTH) {
                // If we have enough content, stop here
                if (summary.length() >= MIN_SUMMARY_LENGTH) {
                    break;
                }
                // Otherwise, truncate this sentence to fit
                int available = MAX_SUMMARY_LENGTH - summary.length();
                summary.append(text, position, position + available);
                if (!summary.toString().endsWith("...")) {
                    // Trim to last word boundary and add ellipsis
                    String current = summary.toString();
                    int lastSpace = current.lastIndexOf(' ');
                    if (lastSpace > summary.length() - 20) {
                        summary = new StringBuilder(current.substring(0, lastSpace));
                    }
                    summary.append("...");
                }
                break;
            }

            summary.append(text, position, sentenceEnd + 1);
            position = sentenceEnd + 1;

            // Skip whitespace
            while (position < text.length() && Character.isWhitespace(text.charAt(position))) {
                position++;
                summary.append(' ');
            }

            // Trim trailing space
            while (summary.length() > 0 && summary.charAt(summary.length() - 1) == ' ') {
                summary.setLength(summary.length() - 1);
            }

            sentenceCount++;
        }

        String result = summary.toString().trim();

        // Clean up any double spaces
        result = result.replaceAll("\\s+", " ");

        return result.isEmpty() ? null : result;
    }

    /**
     * Find the end of a sentence starting from the given position.
     * Returns the index of the sentence-ending punctuation, or -1 if not found.
     */
    private int findSentenceEnd(String text, int start) {
        boolean inQuote = false;

        for (int i = start; i < text.length(); i++) {
            char c = text.charAt(i);

            if (c == '"' || c == '\'' || c == '"' || c == '"') {
                inQuote = !inQuote;
            }

            if ((c == '.' || c == '!' || c == '?') && !inQuote) {
                // Check it's not an abbreviation (like "Mr." or "Dr.")
                if (c == '.' && i > 0) {
                    // Look back for common abbreviations
                    String before = text.substring(Math.max(0, i - 3), i).toLowerCase();
                    if (before.endsWith("mr") || before.endsWith("ms") || before.endsWith("dr") ||
                        before.endsWith("mrs") || before.endsWith("st") || before.endsWith("vs")) {
                        continue;
                    }
                    // Check if next char is lowercase (continuation, like "e.g.")
                    if (i + 1 < text.length() && Character.isLowerCase(text.charAt(i + 1))) {
                        continue;
                    }
                }
                return i;
            }
        }

        return -1;
    }
}
