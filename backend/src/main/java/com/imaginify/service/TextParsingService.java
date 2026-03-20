package com.imaginify.service;

import com.imaginify.exception.BookProcessingException;
import com.imaginify.model.TextChapter;
import com.imaginify.model.TextMetadata;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Parses text files to extract book metadata and chapter structure.
 *
 * Supports multiple chapter formats:
 * - "Chapter 1", "Chapter 1: Title", "CHAPTER ONE", "Chapter IV"
 * - "--- CHAPTER 1: Title ---" (decorated)
 * - "<< 1 >> Title" (bracket style, e.g., Stephen King)
 * - "PART ONE", "P A R T O N E" (spaced letters)
 * - "1.", "1 -", "I.", "I -" (simple numbered)
 * - "Section 1", "Book 1", "Act 1"
 */
@Service
public class TextParsingService {

    private static final Logger log = LoggerFactory.getLogger(TextParsingService.class);
    private static final int METADATA_SCAN_LINES = 100;

    // Metadata patterns - explicit labels (highest confidence)
    private static final Pattern TITLE_PATTERN = Pattern.compile(
            "^Title:\\s*(.+)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern AUTHOR_LABEL_PATTERN = Pattern.compile(
            "^(?:Author|Written by|By):\\s*(.+)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern LANGUAGE_PATTERN = Pattern.compile(
            "^Language:\\s*(.+)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern GENRE_PATTERN = Pattern.compile(
            "^Genre:\\s*(.+)$", Pattern.CASE_INSENSITIVE);

    // Author patterns - inline formats (medium confidence)
    // Name component: handles "Stephen", "F.", "O'Brien", "Mary-Jane"
    private static final String NAME_PART = "[A-Z][a-zA-Z'\\-]*\\.?";
    private static final String NAME_PATTERN_STR = NAME_PART + "(?:\\s+" + NAME_PART + "){0,4}";

    // "by Stephen King", "by STEPHEN KING", "by F. Scott Fitzgerald"
    private static final Pattern INLINE_BY_PATTERN = Pattern.compile(
            "^by\\s+(" + NAME_PATTERN_STR + ")$", Pattern.CASE_INSENSITIVE);
    // "A Novel by Stephen King", "A Thriller by John Grisham"
    private static final Pattern GENRE_BY_PATTERN = Pattern.compile(
            "^An?\\s+\\w+\\s+by\\s+(.+)$", Pattern.CASE_INSENSITIVE);
    // "Title by Author" on same line
    private static final Pattern TITLE_BY_AUTHOR_PATTERN = Pattern.compile(
            "^(.+?)\\s+by\\s+(" + NAME_PATTERN_STR + ")$", Pattern.CASE_INSENSITIVE);

    // Name detection heuristics - for detecting standalone author names
    // Handles: "Stephen King", "F. Scott Fitzgerald", "J. R. R. Tolkien", "O'Brien"
    private static final Pattern LIKELY_NAME_PATTERN = Pattern.compile(
            "^" + NAME_PATTERN_STR + "$");
    // Names that are clearly names (First Last or First Middle Last format)
    private static final Pattern STRONG_NAME_PATTERN = Pattern.compile(
            "^[A-Z][a-z]+(?:\\s+[A-Z]\\.?)?\\s+[A-Z][a-z]+$");
    // ALL CAPS name pattern: "STEPHEN KING"
    private static final Pattern CAPS_NAME_PATTERN = Pattern.compile(
            "^[A-Z][A-Z'\\-\\.]*(?:\\s+[A-Z][A-Z'\\-\\.]*){0,4}$");

    // Patterns that need lookahead for title on next line
    private static final Pattern STEPHEN_KING_CHAPTER = Pattern.compile(
            "^\\s*<<\\s*(\\d+)\\s*>>(?:\\s+(.+))?\\s*$");
    private static final Pattern SPACED_PART = Pattern.compile(
            "^\\s*P\\s+A\\s+R\\s+T\\s+(.+)$", Pattern.CASE_INSENSITIVE);

    // Decorative line pattern (dashes, equals, asterisks, etc.)
    private static final Pattern DECORATIVE_LINE = Pattern.compile(
            "^[\\s\\-=*~#_]+$");

    // Chapter detection patterns (ordered by specificity)
    private static final List<ChapterPattern> CHAPTER_PATTERNS = List.of(
            // << 1 >> TITLE or << 1 >> (Stephen King style) - handled specially with lookahead
            new ChapterPattern(
                    STEPHEN_KING_CHAPTER,
                    (m, line) -> {
                        String num = m.group(1);
                        String title = m.group(2);
                        return title != null && !title.isBlank()
                                ? "Chapter " + num + ": " + title.trim()
                                : "Chapter " + num; // Will be enhanced by lookahead
                    }
            ),
            // P A R T O N E or P A R T T W O (spaced letters for PART) - handled specially with lookahead
            new ChapterPattern(
                    SPACED_PART,
                    (m, line) -> "Part " + collapseSpacedLetters(m.group(1).trim()) // Will be enhanced by lookahead
            ),
            // PART ONE, PART 1, PART I, Part One: Title
            new ChapterPattern(
                    Pattern.compile("^\\s*PART\\s+([\\dIVXLCDMivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)(?:\\s*[:\\-—]+\\s*(.+))?\\s*$", Pattern.CASE_INSENSITIVE),
                    (m, line) -> {
                        String num = m.group(1);
                        String title = m.group(2);
                        return title != null && !title.isBlank()
                                ? "Part " + capitalize(num) + ": " + title.trim()
                                : "Part " + capitalize(num);
                    }
            ),
            // Chapter 1, Chapter 1: Title, CHAPTER ONE, Chapter IV, --- CHAPTER 1: Title ---
            new ChapterPattern(
                    Pattern.compile("^[\\s\\-*=~#]*(?:chapter)\\s+([\\dIVXLCDMivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty)(?:\\s*[:\\-—.]+\\s*(.+?))?[\\s\\-*=~#]*$", Pattern.CASE_INSENSITIVE),
                    (m, line) -> {
                        String num = m.group(1);
                        String title = m.group(2);
                        return title != null && !title.isBlank()
                                ? "Chapter " + capitalize(num) + ": " + title.trim()
                                : "Chapter " + capitalize(num);
                    }
            ),
            // Section 1, Section 1: Title
            new ChapterPattern(
                    Pattern.compile("^\\s*(?:section|book|act|volume)\\s+([\\dIVXLCDMivxlcdm]+)(?:\\s*[:\\-—.]+\\s*(.+))?\\s*$", Pattern.CASE_INSENSITIVE),
                    (m, line) -> {
                        String prefix = line.trim().split("\\s+")[0];
                        String num = m.group(1);
                        String title = m.group(2);
                        return title != null && !title.isBlank()
                                ? capitalize(prefix) + " " + num + ": " + title.trim()
                                : capitalize(prefix) + " " + num;
                    }
            ),
            // Prologue, Epilogue, Introduction, Preface, Foreword, Afterword
            new ChapterPattern(
                    Pattern.compile("^\\s*(prologue|epilogue|introduction|preface|foreword|afterword)(?:\\s*[:\\-—.]+\\s*(.+))?\\s*$", Pattern.CASE_INSENSITIVE),
                    (m, line) -> {
                        String type = capitalize(m.group(1));
                        String title = m.group(2);
                        return title != null && !title.isBlank()
                                ? type + ": " + title.trim()
                                : type;
                    }
            )
    );

    public TextMetadata parse(byte[] fileBytes) {
        try {
            String text = new String(fileBytes, StandardCharsets.UTF_8);
            String[] lines = text.split("\\r?\\n", -1);

            String title = null;
            List<String> authors = new ArrayList<>();
            List<String> genre = new ArrayList<>();
            String language = null;

            int scanLimit = Math.min(lines.length, METADATA_SCAN_LINES);
            int titleLineIndex = -1;
            boolean foundByKeyword = false;

            // First pass: look for explicit labeled metadata (highest confidence)
            for (int i = 0; i < scanLimit; i++) {
                String line = lines[i].trim();
                if (line.isEmpty()) continue;

                // "Title: X"
                Matcher titleMatcher = TITLE_PATTERN.matcher(line);
                if (titleMatcher.matches() && title == null) {
                    title = titleMatcher.group(1).trim();
                    titleLineIndex = i;
                    continue;
                }

                // "Author: X", "By: X", "Written by: X"
                Matcher authorMatcher = AUTHOR_LABEL_PATTERN.matcher(line);
                if (authorMatcher.matches()) {
                    authors.add(authorMatcher.group(1).trim());
                    continue;
                }

                // "Genre: X"
                Matcher genreMatcher = GENRE_PATTERN.matcher(line);
                if (genreMatcher.matches()) {
                    for (String g : genreMatcher.group(1).split(",")) {
                        genre.add(g.trim());
                    }
                    continue;
                }

                // "Language: X"
                Matcher languageMatcher = LANGUAGE_PATTERN.matcher(line);
                if (languageMatcher.matches() && language == null) {
                    language = languageMatcher.group(1).trim();
                }
            }

            // Second pass: look for inline and positional patterns if author not found
            if (authors.isEmpty()) {
                for (int i = 0; i < scanLimit; i++) {
                    String line = lines[i].trim();
                    if (line.isEmpty()) continue;

                    // "A Novel by Author", "A Thriller by Author" - extract author only
                    // This must come before TITLE_BY_AUTHOR to avoid "A Novel" becoming title
                    Matcher genreBy = GENRE_BY_PATTERN.matcher(line);
                    if (genreBy.matches()) {
                        authors.add(genreBy.group(1).trim());
                        break;
                    }

                    // "Title by Author" on same line (only if title not yet found)
                    if (title == null) {
                        Matcher titleByAuthor = TITLE_BY_AUTHOR_PATTERN.matcher(line);
                        if (titleByAuthor.matches() && looksLikeName(titleByAuthor.group(2))) {
                            title = titleByAuthor.group(1).trim();
                            authors.add(titleByAuthor.group(2).trim());
                            titleLineIndex = i;
                            break;
                        }
                    }

                    // "by Author Name" on its own line
                    Matcher inlineBy = INLINE_BY_PATTERN.matcher(line);
                    if (inlineBy.matches() && looksLikeName(inlineBy.group(1))) {
                        authors.add(inlineBy.group(1).trim());
                        break;
                    }

                    // "BY" or "by" on its own line - mark for next name
                    if (line.equalsIgnoreCase("BY")) {
                        foundByKeyword = true;
                        continue;
                    }

                    // After "BY", look for author name (allow blank lines in between)
                    if (foundByKeyword && looksLikeName(line)) {
                        authors.add(line);
                        foundByKeyword = false;
                        break;
                    }

                    // Reset foundByKeyword if we hit a non-name, non-blank line
                    if (foundByKeyword && !line.isEmpty() && !looksLikeName(line)) {
                        foundByKeyword = false;
                    }
                }
            }

            // Fallback: use first significant non-blank line as title
            if (title == null) {
                for (int i = 0; i < Math.min(lines.length, 50); i++) {
                    String line = lines[i].trim();
                    if (!line.isEmpty() && line.length() > 2 && !line.equalsIgnoreCase("by")) {
                        // Skip obvious non-title lines
                        if (looksLikeContent(line)) continue;
                        title = line;
                        titleLineIndex = i;
                        break;
                    }
                }
            }

            // Third pass: positional heuristics - author often follows title closely
            if (authors.isEmpty() && title != null && titleLineIndex >= 0) {
                // Look within 10 lines after title for a name-like line
                for (int i = titleLineIndex + 1; i < Math.min(titleLineIndex + 10, scanLimit); i++) {
                    String line = lines[i].trim();
                    if (line.isEmpty()) continue;
                    if (line.equalsIgnoreCase("by")) continue; // Skip standalone "by"

                    // Check if line looks like a standalone name
                    if (looksLikeStandaloneName(line)) {
                        authors.add(line);
                        break;
                    }

                    // If we hit something that looks like content, stop searching
                    if (line.length() > 60 || looksLikeContent(line)) {
                        break;
                    }
                }
            }

            List<TextChapter> chapters = detectChapters(text, lines);

            log.info("Parsed text file: title={}, authors={}, genre={}, chapters={}, length={}",
                    title, authors, genre, chapters.size(), text.length());
            return new TextMetadata(title, authors, genre, language, text.length(), chapters);
        } catch (BookProcessingException e) {
            throw e;
        } catch (Exception e) {
            throw new BookProcessingException("Failed to parse text file", e);
        }
    }

    /**
     * Check if a string looks like a person's name.
     */
    private boolean looksLikeName(String s) {
        if (s == null || s.length() < 3 || s.length() > 50) return false;
        // Must have at least one space (first and last name) or be a single recognizable name
        String trimmed = s.trim();
        // ALL CAPS name
        if (CAPS_NAME_PATTERN.matcher(trimmed).matches()) return true;
        // Mixed case name
        if (LIKELY_NAME_PATTERN.matcher(trimmed).matches()) return true;
        return false;
    }

    /**
     * Check if a string looks like a standalone author name (stricter check).
     * Used for positional detection where we're less certain.
     */
    private boolean looksLikeStandaloneName(String s) {
        if (s == null || s.length() < 5 || s.length() > 40) return false;
        String trimmed = s.trim();
        // Prefer names with clear first/last structure
        if (STRONG_NAME_PATTERN.matcher(trimmed).matches()) return true;
        // ALL CAPS with spaces (like "STEPHEN KING")
        if (CAPS_NAME_PATTERN.matcher(trimmed).matches() && trimmed.contains(" ")) return true;
        return false;
    }

    /**
     * Check if a line looks like book content rather than metadata.
     */
    private boolean looksLikeContent(String line) {
        if (line == null) return false;
        // Content lines are usually longer
        if (line.length() > 80) return true;
        // Contains sentence-ending punctuation followed by space and more text
        if (line.matches(".*[.!?]\\s+[A-Z].*")) return true;
        // Starts with lowercase (continuation)
        if (Character.isLowerCase(line.charAt(0))) return true;
        return false;
    }

    private List<TextChapter> detectChapters(String text, String[] lines) {
        List<ChapterBreak> breaks = new ArrayList<>();
        int offset = 0;

        for (int i = 0; i < lines.length; i++) {
            String line = lines[i];
            ChapterBreak chapterBreak = matchChapterLine(line, offset, i, lines);
            if (chapterBreak != null) {
                breaks.add(chapterBreak);
            }
            offset += line.length() + 1; // +1 for the newline
        }

        if (breaks.isEmpty()) {
            // No chapters detected — treat entire file as one chapter
            log.warn("No chapter breaks detected, treating entire file as single chapter");
            TextChapter singleChapter = new TextChapter(1, "Full Text", 0, text.length());
            return List.of(singleChapter);
        }

        List<TextChapter> chapters = new ArrayList<>();
        for (int i = 0; i < breaks.size(); i++) {
            ChapterBreak current = breaks.get(i);
            int startOffset = current.offset();
            int endOffset = (i + 1 < breaks.size()) ? breaks.get(i + 1).offset() : text.length();
            int textLength = endOffset - startOffset;

            chapters.add(new TextChapter(i + 1, current.title(), startOffset, textLength));
        }

        log.info("Detected {} chapter breaks", chapters.size());
        return chapters;
    }

    /**
     * Try to match a line against all known chapter patterns.
     */
    ChapterBreak matchChapterLine(String line, int offset, int lineIndex, String[] lines) {
        String trimmed = line.trim();

        // Skip empty lines
        if (trimmed.isEmpty()) {
            return null;
        }

        // Try each pattern
        for (ChapterPattern cp : CHAPTER_PATTERNS) {
            Matcher matcher = cp.pattern.matcher(trimmed);
            if (matcher.matches()) {
                // Additional validation: chapter lines are usually short and surrounded by blank lines
                if (isLikelyChapterHeading(trimmed, lineIndex, lines)) {
                    String title = cp.titleExtractor.extract(matcher, trimmed);

                    // Look ahead for title if pattern didn't capture one
                    title = enhanceTitleWithLookahead(title, matcher, cp.pattern, lineIndex, lines);

                    return new ChapterBreak(title, offset);
                }
            }
        }

        return null;
    }

    /**
     * Enhance chapter title by looking ahead to subsequent lines if the title is missing or incomplete.
     * Handles cases like:
     *   << 7 >>
     *   IN ANOTHER BEDROOM
     * Or:
     *   P A R T O N E
     *   - - - - - - - -
     *   PREFATORY MATTERS
     */
    private String enhanceTitleWithLookahead(String baseTitle, Matcher matcher, Pattern pattern,
                                              int lineIndex, String[] lines) {
        // Check if this pattern needs lookahead (no inline title captured)
        boolean needsLookahead = false;
        String chapterPrefix = "";

        if (pattern == STEPHEN_KING_CHAPTER) {
            String inlineTitle = matcher.group(2);
            if (inlineTitle == null || inlineTitle.isBlank()) {
                needsLookahead = true;
                chapterPrefix = "Chapter " + matcher.group(1);
            }
        } else if (pattern == SPACED_PART) {
            // Part markers always benefit from looking for a subtitle
            needsLookahead = true;
            chapterPrefix = baseTitle; // e.g., "Part ONE"
        }

        if (!needsLookahead) {
            return baseTitle;
        }

        // Look ahead up to 5 lines for a title
        String foundTitle = null;
        for (int i = lineIndex + 1; i < Math.min(lineIndex + 6, lines.length); i++) {
            String nextLine = lines[i].trim();

            // Skip empty lines
            if (nextLine.isEmpty()) {
                continue;
            }

            // Skip decorative lines (dashes, equals, etc.)
            if (DECORATIVE_LINE.matcher(nextLine).matches()) {
                continue;
            }

            // Skip lines that look like another chapter marker
            if (looksLikeChapterMarker(nextLine)) {
                break;
            }

            // Found a potential title line
            if (looksLikeTitle(nextLine)) {
                foundTitle = nextLine;
                break;
            }

            // If we hit content, stop looking
            if (looksLikeContent(nextLine)) {
                break;
            }
        }

        if (foundTitle != null) {
            return chapterPrefix + ": " + foundTitle;
        }

        return baseTitle;
    }

    /**
     * Check if a line looks like a chapter/part marker.
     */
    private boolean looksLikeChapterMarker(String line) {
        // Stephen King style
        if (line.matches("^\\s*<<\\s*\\d+\\s*>>.*$")) return true;
        // PART marker
        if (line.matches("(?i)^\\s*P\\s+A\\s+R\\s+T\\s+.*$")) return true;
        if (line.matches("(?i)^\\s*PART\\s+.*$")) return true;
        // Chapter marker
        if (line.matches("(?i)^\\s*CHAPTER\\s+.*$")) return true;
        return false;
    }

    /**
     * Check if a line looks like a chapter/section title.
     * Titles are typically short, possibly ALL CAPS or Title Case.
     */
    private boolean looksLikeTitle(String line) {
        if (line == null || line.isEmpty()) return false;
        // Titles are typically short
        if (line.length() > 60) return false;
        // Should start with a letter
        if (!Character.isLetter(line.charAt(0))) return false;
        // Shouldn't look like regular prose
        if (looksLikeContent(line)) return false;
        return true;
    }

    /**
     * Validates that a potential chapter heading looks legitimate.
     * Chapter headings are typically:
     * - Relatively short (< 100 chars)
     * - Preceded or followed by blank lines
     * - Not part of regular paragraph text
     */
    private boolean isLikelyChapterHeading(String line, int lineIndex, String[] lines) {
        // Chapter headings are usually short
        if (line.length() > 100) {
            return false;
        }

        // Check for blank line before or after (with some tolerance for start/end of file)
        boolean blankBefore = lineIndex == 0 ||
                              (lineIndex > 0 && lines[lineIndex - 1].trim().isEmpty()) ||
                              (lineIndex > 1 && lines[lineIndex - 2].trim().isEmpty());
        boolean blankAfter = lineIndex >= lines.length - 1 ||
                             (lineIndex < lines.length - 1 && lines[lineIndex + 1].trim().isEmpty()) ||
                             (lineIndex < lines.length - 2 && lines[lineIndex + 2].trim().isEmpty());

        return blankBefore || blankAfter;
    }

    /**
     * Collapse spaced letters like "O N E" into "ONE"
     */
    private static String collapseSpacedLetters(String spaced) {
        return spaced.replaceAll("\\s+", "");
    }

    /**
     * Normalize chapter/part number - keep roman numerals uppercase, capitalize words
     */
    private static String capitalize(String s) {
        if (s == null || s.isEmpty()) return s;
        // Check if it's a roman numeral (only I, V, X, L, C, D, M characters)
        if (s.matches("^[IVXLCDMivxlcdm]+$")) {
            return s.toUpperCase();
        }
        // Otherwise capitalize first letter
        return s.substring(0, 1).toUpperCase() + s.substring(1).toLowerCase();
    }

    record ChapterBreak(String title, int offset) {}

    @FunctionalInterface
    interface TitleExtractor {
        String extract(Matcher matcher, String line);
    }

    record ChapterPattern(Pattern pattern, TitleExtractor titleExtractor) {}
}
