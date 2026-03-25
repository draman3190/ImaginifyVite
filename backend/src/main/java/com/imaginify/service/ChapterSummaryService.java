package com.imaginify.service;

import com.imaginify.service.client.GeminiTextClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * Generates summaries for chapter text.
 *
 * Primary: Uses Gemini AI to generate abstractive 3-5 sentence summaries.
 * Fallback: Uses extractive summarization that samples sentences from the
 * beginning, middle, and end of the chapter.
 *
 * Skips summarization for TRANSITION chapters (part headers, interludes, etc.)
 */
@Service
public class ChapterSummaryService {

    private static final Logger log = LoggerFactory.getLogger(ChapterSummaryService.class);

    private static final int MAX_SUMMARY_LENGTH = 800;
    private static final int TARGET_SENTENCE_COUNT = 5;
    private static final int MIN_SENTENCE_COUNT = 3;

    // Chapter type constants (must match ChapterTypeDetector)
    private static final String TYPE_TRANSITION = "TRANSITION";

    private static final String SUMMARIZATION_PROMPT_TEMPLATE = """
            Summarize this book chapter in exactly 3 sentences.

            Rules:
            - Write only the summary, nothing else
            - Do not include any reasoning, thinking, or explanation
            - Each sentence must be complete and end with a period
            - Focus on main events and character actions
            - Use present tense

            Chapter text:
            %s

            Summary:""";

    // Maximum characters of chapter text to send to the model
    private static final int MAX_CHAPTER_TEXT_FOR_MODEL = 15000;

    private final GeminiTextClient geminiTextClient;

    /**
     * Constructor for Spring context (no AI client, extractive only).
     */
    public ChapterSummaryService() {
        this.geminiTextClient = null;
    }

    /**
     * Constructor with Gemini client for AI-powered summarization.
     */
    public ChapterSummaryService(GeminiTextClient geminiTextClient) {
        this.geminiTextClient = geminiTextClient;
    }

    /**
     * Generate a summary for the given chapter text.
     * Uses Gemini AI if available, falls back to extractive summarization.
     *
     * @param chapterText the full chapter text
     * @return a summary string, or null if text is empty
     */
    public String generateSummary(String chapterText) {
        return generateSummary(chapterText, null);
    }

    /**
     * Generate a summary for the given chapter text, considering the chapter type.
     * TRANSITION chapters (part headers, interludes) are not summarized.
     *
     * @param chapterText the full chapter text
     * @param chapterType the chapter type (CONTENT or TRANSITION), or null
     * @return a summary string, or null if text is empty or chapter is TRANSITION
     */
    public String generateSummary(String chapterText, String chapterType) {
        if (chapterText == null || chapterText.isBlank()) {
            return null;
        }

        // Skip summarization for transition chapters
        if (TYPE_TRANSITION.equals(chapterType)) {
            log.debug("Skipping summary for TRANSITION chapter");
            return null;
        }

        // Try AI summarization first
        if (geminiTextClient != null && geminiTextClient.isConfigured()) {
            String aiSummary = generateAiSummary(chapterText);
            if (aiSummary != null && !aiSummary.isBlank()) {
                return aiSummary;
            }
            log.debug("AI summarization failed, falling back to extractive");
        }

        // Fall back to extractive summarization
        return generateExtractiveSummary(chapterText);
    }

    /**
     * Generate an AI-powered summary using Gemini.
     */
    private String generateAiSummary(String chapterText) {
        try {
            // Truncate very long chapters to stay within model context limits
            String textForModel = chapterText.length() > MAX_CHAPTER_TEXT_FOR_MODEL
                    ? chapterText.substring(0, MAX_CHAPTER_TEXT_FOR_MODEL) + "..."
                    : chapterText;

            String prompt = String.format(SUMMARIZATION_PROMPT_TEMPLATE, textForModel);
            String summary = geminiTextClient.generateText(prompt);

            if (summary != null) {
                // Clean up the response
                summary = summary.trim();

                // Remove any leading "Summary:" prefix the model might add
                if (summary.toLowerCase().startsWith("summary:")) {
                    summary = summary.substring(8).trim();
                }

                // Validate the summary doesn't contain model reasoning artifacts
                if (!isValidSummary(summary)) {
                    log.warn("AI summary rejected - contains reasoning artifacts: {}",
                            summary.substring(0, Math.min(100, summary.length())));
                    return null;
                }

                // Truncate if too long
                if (summary.length() > MAX_SUMMARY_LENGTH) {
                    summary = truncateToLength(summary, MAX_SUMMARY_LENGTH);
                }

                log.debug("Generated AI summary: {} chars", summary.length());
                return summary;
            }
        } catch (Exception e) {
            log.warn("Error generating AI summary: {}", e.getMessage());
        }
        return null;
    }

    /**
     * Generate an extractive summary by sampling representative sentences.
     */
    private String generateExtractiveSummary(String chapterText) {
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
     * Validate that a summary doesn't contain model reasoning artifacts.
     * Returns false if the summary appears to be corrupted with thinking/reasoning.
     */
    private boolean isValidSummary(String summary) {
        if (summary == null || summary.isBlank()) {
            return false;
        }

        String lower = summary.toLowerCase();

        // Check for common reasoning artifact patterns
        if (lower.contains("[subject:") || lower.contains("[verb:")) {
            return false;
        }
        if (lower.contains("let me") || lower.contains("i'll ") || lower.contains("i will")) {
            return false;
        }
        if (lower.contains("double check") || lower.contains("one more check")) {
            return false;
        }
        if (lower.contains("the prompt") || lower.contains("instructions")) {
            return false;
        }
        if (lower.startsWith("1.") || lower.startsWith("step ")) {
            return false;
        }

        // Summary should have at least one sentence ending with a period
        if (!summary.contains(".")) {
            return false;
        }

        return true;
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
