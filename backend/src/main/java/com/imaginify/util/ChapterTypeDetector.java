package com.imaginify.util;

import java.util.Set;
import java.util.regex.Pattern;

/**
 * Detects whether a chapter is actual content or a structural transition (part headers, dividers).
 * Transition chapters are short text blocks that mark sections like "PART ONE", "BOOK TWO", etc.
 */
public final class ChapterTypeDetector {

    public static final String TYPE_CONTENT = "CONTENT";
    public static final String TYPE_TRANSITION = "TRANSITION";

    // Conservative limit: transitions are very short (just a title/subtitle, maybe a quote)
    private static final int MAX_TRANSITION_LENGTH = 150;

    // Patterns that indicate structural markers when combined with short content
    // Matches: "PART ONE", "PART 1", "PART I", "BOOK TWO", "SECTION III", "ACT 2", etc.
    private static final Pattern PART_PATTERN = Pattern.compile(
            "^(PART|BOOK|VOLUME|SECTION|ACT)\\s+\\S",
            Pattern.CASE_INSENSITIVE);

    private static final Set<String> TRANSITION_KEYWORDS = Set.of(
            "PROLOGUE", "EPILOGUE", "PREFACE", "INTRODUCTION", "FOREWORD",
            "AFTERWORD", "PREFATORY", "INTERLUDE", "INTERMISSION", "CODA",
            "PRELUDE", "POSTSCRIPT", "APPENDIX"
    );

    private ChapterTypeDetector() {
        // Utility class
    }

    /**
     * Determines the chapter type based on title and content length.
     * A chapter is considered a TRANSITION if:
     * 1. The text content is very short (≤ 150 characters), AND
     * 2. The title matches a structural pattern (PART, BOOK, etc.) or contains transition keywords
     *
     * @param title      the chapter title
     * @param textLength the length of the chapter text content
     * @return TYPE_TRANSITION or TYPE_CONTENT
     */
    public static String detectType(String title, int textLength) {
        if (textLength > MAX_TRANSITION_LENGTH) {
            return TYPE_CONTENT;
        }

        if (title == null || title.isBlank()) {
            return TYPE_CONTENT;
        }

        String normalizedTitle = title.trim().toUpperCase();

        // Check for "PART ONE", "BOOK II", "VOLUME 3", etc.
        if (PART_PATTERN.matcher(normalizedTitle).find()) {
            return TYPE_TRANSITION;
        }

        // Check for transition keywords anywhere in the title
        for (String keyword : TRANSITION_KEYWORDS) {
            if (normalizedTitle.contains(keyword)) {
                return TYPE_TRANSITION;
            }
        }

        return TYPE_CONTENT;
    }
}
