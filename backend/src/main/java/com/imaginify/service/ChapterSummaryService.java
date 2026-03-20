package com.imaginify.service;

import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * Generates summaries for chapter text.
 *
 * Uses extractive summarization that samples sentences from the beginning,
 * middle, and end of the chapter to provide a comprehensive overview.
 * Produces 3-5 sentences that represent the full chapter content.
 */
@Service
public class ChapterSummaryService {

    private static final int MAX_SUMMARY_LENGTH = 800;
    private static final int TARGET_SENTENCE_COUNT = 5;
    private static final int MIN_SENTENCE_COUNT = 3;

    /**
     * Generate a summary for the given chapter text.
     * Scans the full chapter and extracts representative sentences from
     * beginning, middle, and end to create a 3-5 sentence summary.
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

        // Parse all sentences
        List<String> sentences = extractAllSentences(cleaned);
        if (sentences.isEmpty()) {
            return truncateToLength(cleaned, MAX_SUMMARY_LENGTH);
        }

        if (sentences.size() <= TARGET_SENTENCE_COUNT) {
            String joined = String.join(" ", sentences);
            return joined.length() <= MAX_SUMMARY_LENGTH ? joined : truncateToLength(joined, MAX_SUMMARY_LENGTH);
        }

        // Sample sentences from beginning, middle, and end
        List<String> selected = selectRepresentativeSentences(sentences);
        return formatSummary(selected);
    }

    /**
     * Clean the text by normalizing whitespace.
     */
    private String cleanText(String text) {
        return text.replaceAll("\\s+", " ").trim();
    }

    /**
     * Extract all sentences from the text.
     */
    private List<String> extractAllSentences(String text) {
        List<String> sentences = new ArrayList<>();
        int position = 0;

        while (position < text.length()) {
            int sentenceEnd = findSentenceEnd(text, position);

            if (sentenceEnd == -1) {
                // No more sentence endings, take remaining text if substantial
                String remaining = text.substring(position).trim();
                if (remaining.length() > 20) {
                    sentences.add(remaining);
                }
                break;
            }

            String sentence = text.substring(position, sentenceEnd + 1).trim();
            if (isValidSentence(sentence)) {
                sentences.add(sentence);
            }

            position = sentenceEnd + 1;
            // Skip whitespace
            while (position < text.length() && Character.isWhitespace(text.charAt(position))) {
                position++;
            }
        }

        return sentences;
    }

    /**
     * Check if a sentence is valid for inclusion (not too short, not just dialogue tags, etc.)
     */
    private boolean isValidSentence(String sentence) {
        if (sentence.length() < 15) {
            return false;
        }
        // Skip sentences that are just dialogue tags
        String lower = sentence.toLowerCase();
        if (lower.matches("^(he|she|they|it)\\s+(said|asked|replied|answered|whispered|shouted)\\.?$")) {
            return false;
        }
        return true;
    }

    /**
     * Select representative sentences from beginning, middle, and end of chapter.
     */
    private List<String> selectRepresentativeSentences(List<String> sentences) {
        List<String> selected = new ArrayList<>();
        int total = sentences.size();

        // Strategy: Take 2 from beginning, 1-2 from middle, 1-2 from end
        // Adjust based on chapter length

        // Beginning (first 10% of chapter) - take 2 sentences
        int beginEnd = Math.max(1, total / 10);
        selected.add(sentences.get(0)); // First sentence
        if (beginEnd > 1 && sentences.size() > 2) {
            selected.add(sentences.get(Math.min(1, beginEnd - 1)));
        }

        // Middle (40-60% of chapter) - take 1-2 sentences
        int midStart = (int) (total * 0.4);
        int midEnd = (int) (total * 0.6);
        if (midStart < total && midStart != midEnd) {
            // Find the most interesting sentence in the middle section
            String midSentence = findBestSentence(sentences, midStart, midEnd);
            if (midSentence != null && !selected.contains(midSentence)) {
                selected.add(midSentence);
            }
        }

        // End (last 15% of chapter) - take 1-2 sentences
        int endStart = (int) (total * 0.85);
        if (endStart < total - 1) {
            // Take a sentence from near the end (but not the very last which might be a cliffhanger tag)
            int endIdx = Math.max(endStart, total - 3);
            String endSentence = sentences.get(endIdx);
            if (!selected.contains(endSentence)) {
                selected.add(endSentence);
            }
        }

        // Take the final sentence if we have room and it's substantial
        if (selected.size() < TARGET_SENTENCE_COUNT) {
            String lastSentence = sentences.get(total - 1);
            if (!selected.contains(lastSentence) && lastSentence.length() > 30) {
                selected.add(lastSentence);
            }
        }

        // Ensure we have at least MIN_SENTENCE_COUNT sentences
        while (selected.size() < MIN_SENTENCE_COUNT && selected.size() < sentences.size()) {
            // Add more from the middle
            int idx = (int) (total * 0.3 + selected.size());
            if (idx < total && !selected.contains(sentences.get(idx))) {
                selected.add(sentences.get(idx));
            } else {
                break;
            }
        }

        return selected;
    }

    /**
     * Find the best (most descriptive) sentence in a range.
     * Prefers longer sentences that aren't pure dialogue.
     */
    private String findBestSentence(List<String> sentences, int start, int end) {
        String best = null;
        int bestScore = 0;

        for (int i = start; i < end && i < sentences.size(); i++) {
            String sentence = sentences.get(i);
            int score = scoreSentence(sentence);
            if (score > bestScore) {
                bestScore = score;
                best = sentence;
            }
        }

        return best;
    }

    /**
     * Score a sentence for "summary worthiness".
     * Higher scores for longer, more descriptive sentences.
     */
    private int scoreSentence(String sentence) {
        int score = sentence.length();

        // Penalize sentences that are mostly dialogue
        long quoteCount = sentence.chars().filter(c -> c == '"' || c == '"' || c == '"').count();
        if (quoteCount > 2) {
            score -= 50;
        }

        // Prefer sentences with descriptive words
        String lower = sentence.toLowerCase();
        if (lower.contains("suddenly") || lower.contains("realized") ||
            lower.contains("discovered") || lower.contains("revealed")) {
            score += 20;
        }

        // Prefer sentences that set scene
        if (lower.contains("the ") && (lower.contains("was") || lower.contains("were"))) {
            score += 10;
        }

        return score;
    }

    /**
     * Format the selected sentences into a cohesive summary.
     */
    private String formatSummary(List<String> sentences) {
        StringBuilder summary = new StringBuilder();

        for (String sentence : sentences) {
            if (summary.length() > 0) {
                summary.append(" ");
            }
            summary.append(sentence);

            // Stop if we're approaching max length
            if (summary.length() > MAX_SUMMARY_LENGTH - 100) {
                break;
            }
        }

        String result = summary.toString().trim();

        // Truncate if still too long
        if (result.length() > MAX_SUMMARY_LENGTH) {
            result = truncateToLength(result, MAX_SUMMARY_LENGTH);
        }

        return result;
    }

    /**
     * Truncate text to a maximum length, cutting at word boundary.
     */
    private String truncateToLength(String text, int maxLength) {
        if (text.length() <= maxLength) {
            return text;
        }

        int cutoff = maxLength - 3;
        String truncated = text.substring(0, cutoff);

        // Find last word boundary
        int lastSpace = truncated.lastIndexOf(' ');
        if (lastSpace > cutoff - 50) {
            truncated = truncated.substring(0, lastSpace);
        }

        return truncated + "...";
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
                // Check it's not an abbreviation
                if (c == '.' && i > 0) {
                    String before = text.substring(Math.max(0, i - 3), i).toLowerCase();
                    if (before.endsWith("mr") || before.endsWith("ms") || before.endsWith("dr") ||
                        before.endsWith("mrs") || before.endsWith("st") || before.endsWith("vs") ||
                        before.endsWith("etc") || before.endsWith("inc") || before.endsWith("jr")) {
                        continue;
                    }
                    // Check if next char is lowercase (like "e.g." or "i.e.")
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
