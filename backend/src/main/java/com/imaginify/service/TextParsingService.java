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

@Service
public class TextParsingService {

    private static final Logger log = LoggerFactory.getLogger(TextParsingService.class);
    private static final int METADATA_SCAN_LINES = 100;

    private static final Pattern TITLE_PATTERN = Pattern.compile(
            "^Title:\\s*(.+)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern AUTHOR_PATTERN = Pattern.compile(
            "^(?:Author|By):\\s*(.+)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern LANGUAGE_PATTERN = Pattern.compile(
            "^Language:\\s*(.+)$", Pattern.CASE_INSENSITIVE);

    // Matches lines like "Chapter 1", "Chapter 1: Title", "CHAPTER ONE", "Chapter IV", "CHAPTER IV: Title"
    static final Pattern CHAPTER_PATTERN = Pattern.compile(
            "^\\s*(?i:chapter)\\s+([\\dIVXLCDMivxlcdm]+)(?:\\s*[:\\-—.]+\\s*(.+))?\\s*$");

    // Number-word patterns for chapter detection
    private static final Pattern CHAPTER_WORD_NUMBER_PATTERN = Pattern.compile(
            "^\\s*(?i:chapter)\\s+(?i:one|two|three|four|five|six|seven|eight|nine|ten|" +
                    "eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|" +
                    "thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)(?:[\\s-](?i:one|two|three|four|five|" +
                    "six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|" +
                    "eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred))*" +
                    "(?:\\s*[:\\-—.]+\\s*(.+))?\\s*$");

    public TextMetadata parse(byte[] fileBytes) {
        try {
            String text = new String(fileBytes, StandardCharsets.UTF_8);
            String[] lines = text.split("\\r?\\n", -1);

            String title = null;
            List<String> authors = new ArrayList<>();
            String language = null;

            int scanLimit = Math.min(lines.length, METADATA_SCAN_LINES);
            for (int i = 0; i < scanLimit; i++) {
                String line = lines[i];

                Matcher titleMatcher = TITLE_PATTERN.matcher(line);
                if (titleMatcher.matches() && title == null) {
                    title = titleMatcher.group(1).trim();
                    continue;
                }

                Matcher authorMatcher = AUTHOR_PATTERN.matcher(line);
                if (authorMatcher.matches()) {
                    authors.add(authorMatcher.group(1).trim());
                    continue;
                }

                Matcher languageMatcher = LANGUAGE_PATTERN.matcher(line);
                if (languageMatcher.matches() && language == null) {
                    language = languageMatcher.group(1).trim();
                }
            }

            // Fallback: use first non-blank line as title
            if (title == null) {
                for (String line : lines) {
                    if (!line.isBlank()) {
                        title = line.trim();
                        break;
                    }
                }
            }

            List<TextChapter> chapters = detectChapters(text, lines);

            log.info("Parsed text file: title={}, authors={}, chapters={}, length={}",
                    title, authors, chapters.size(), text.length());
            return new TextMetadata(title, authors, language, text.length(), chapters);
        } catch (BookProcessingException e) {
            throw e;
        } catch (Exception e) {
            throw new BookProcessingException("Failed to parse text file", e);
        }
    }

    private List<TextChapter> detectChapters(String text, String[] lines) {
        List<ChapterBreak> breaks = new ArrayList<>();
        int offset = 0;

        for (int i = 0; i < lines.length; i++) {
            String line = lines[i];
            ChapterBreak chapterBreak = matchChapterLine(line, offset);
            if (chapterBreak != null) {
                breaks.add(chapterBreak);
            }
            offset += line.length() + 1; // +1 for the newline
        }

        if (breaks.isEmpty()) {
            // No chapters detected — treat entire file as one chapter
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
        return chapters;
    }

    ChapterBreak matchChapterLine(String line, int offset) {
        Matcher matcher = CHAPTER_PATTERN.matcher(line);
        if (matcher.matches()) {
            String numberPart = matcher.group(1);
            String titlePart = matcher.group(2);
            String chapterTitle = buildChapterTitle(numberPart, titlePart);
            return new ChapterBreak(chapterTitle, offset);
        }

        Matcher wordMatcher = CHAPTER_WORD_NUMBER_PATTERN.matcher(line);
        if (wordMatcher.matches()) {
            String titlePart = wordMatcher.group(1);
            // Extract the word number from the line for the title
            String chapterLabel = line.trim();
            if (titlePart != null) {
                // Remove the subtitle portion, keep just "Chapter <Word>"
                int colonIdx = chapterLabel.indexOf(':');
                if (colonIdx < 0) colonIdx = chapterLabel.indexOf('-');
                if (colonIdx < 0) colonIdx = chapterLabel.indexOf('\u2014');
                if (colonIdx < 0) colonIdx = chapterLabel.indexOf('.');
                String prefix = (colonIdx > 0) ? chapterLabel.substring(0, colonIdx).trim() : chapterLabel;
                return new ChapterBreak(prefix + ": " + titlePart.trim(), offset);
            }
            return new ChapterBreak(chapterLabel, offset);
        }

        return null;
    }

    private String buildChapterTitle(String numberPart, String titlePart) {
        String base = "Chapter " + numberPart;
        if (titlePart != null && !titlePart.isBlank()) {
            return base + ": " + titlePart.trim();
        }
        return base;
    }

    record ChapterBreak(String title, int offset) {}
}
