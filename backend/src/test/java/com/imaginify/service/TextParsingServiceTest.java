package com.imaginify.service;

import com.imaginify.exception.BookProcessingException;
import com.imaginify.model.TextMetadata;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.*;

class TextParsingServiceTest {

    private TextParsingService textParsingService;

    @BeforeEach
    void setUp() {
        textParsingService = new TextParsingService();
    }

    @Test
    void parse_withMetadataHeaders_extractsTitleAuthorLanguage() {
        String text = """
                Title: The Great Adventure
                Author: Jane Smith
                Language: en

                This is the body of the book.
                """;

        TextMetadata metadata = textParsingService.parse(text.getBytes(StandardCharsets.UTF_8));

        assertEquals("The Great Adventure", metadata.title());
        assertEquals(1, metadata.authors().size());
        assertEquals("Jane Smith", metadata.authors().get(0));
        assertEquals("en", metadata.language());
    }

    @Test
    void parse_withByPrefix_extractsAuthor() {
        String text = """
                Title: My Book
                By: John Doe

                Content here.
                """;

        TextMetadata metadata = textParsingService.parse(text.getBytes(StandardCharsets.UTF_8));

        assertEquals("John Doe", metadata.authors().get(0));
    }

    @Test
    void parse_byOnOwnLineWithBlanks_extractsAuthor() {
        // Stephen King style: BY on own line, blank lines, then author name
        String text = """
                THE SHINING


                BY


                STEPHEN KING


                Chapter 1: The Beginning
                Content here.
                """;

        TextMetadata metadata = textParsingService.parse(text.getBytes(StandardCharsets.UTF_8));

        assertEquals("THE SHINING", metadata.title());
        assertEquals(1, metadata.authors().size());
        assertEquals("STEPHEN KING", metadata.authors().get(0));
    }

    @Test
    void parse_titleByAuthorOnSameLine_extractsBoth() {
        String text = """
                The Great Gatsby by F. Scott Fitzgerald

                Chapter 1
                In my younger and more vulnerable years...
                """;

        TextMetadata metadata = textParsingService.parse(text.getBytes(StandardCharsets.UTF_8));

        assertEquals("The Great Gatsby", metadata.title());
        assertEquals(1, metadata.authors().size());
        assertEquals("F. Scott Fitzgerald", metadata.authors().get(0));
    }

    @Test
    void parse_aNovelByAuthor_extractsAuthor() {
        String text = """
                MYSTIC RIVER

                A Novel by Dennis Lehane

                Chapter 1
                Content here.
                """;

        TextMetadata metadata = textParsingService.parse(text.getBytes(StandardCharsets.UTF_8));

        assertEquals("MYSTIC RIVER", metadata.title());
        assertEquals(1, metadata.authors().size());
        assertEquals("Dennis Lehane", metadata.authors().get(0));
    }

    @Test
    void parse_byAuthorOnOwnLine_extractsAuthor() {
        String text = """
                1984

                by George Orwell

                Chapter 1
                It was a bright cold day in April...
                """;

        TextMetadata metadata = textParsingService.parse(text.getBytes(StandardCharsets.UTF_8));

        assertEquals("1984", metadata.title());
        assertEquals(1, metadata.authors().size());
        assertEquals("George Orwell", metadata.authors().get(0));
    }

    @Test
    void parse_writtenByLabel_extractsAuthor() {
        String text = """
                Title: The Catcher in the Rye
                Written by: J. D. Salinger

                Content here.
                """;

        TextMetadata metadata = textParsingService.parse(text.getBytes(StandardCharsets.UTF_8));

        assertEquals("The Catcher in the Rye", metadata.title());
        assertEquals(1, metadata.authors().size());
        assertEquals("J. D. Salinger", metadata.authors().get(0));
    }

    @Test
    void parse_authorFollowingTitlePositionally_extractsAuthor() {
        // Common format: title, blank line, author name (no "by")
        String text = """
                TO KILL A MOCKINGBIRD

                Harper Lee


                Chapter 1
                When he was nearly thirteen...
                """;

        TextMetadata metadata = textParsingService.parse(text.getBytes(StandardCharsets.UTF_8));

        assertEquals("TO KILL A MOCKINGBIRD", metadata.title());
        assertEquals(1, metadata.authors().size());
        assertEquals("Harper Lee", metadata.authors().get(0));
    }

    @Test
    void parse_doesNotMistakeContentForAuthor() {
        // Make sure we don't pick up random content as author
        String text = """
                Short Stories

                This is a collection of stories from various sources.
                Each story has its own unique charm.

                Chapter 1: The First Tale
                Once upon a time...
                """;

        TextMetadata metadata = textParsingService.parse(text.getBytes(StandardCharsets.UTF_8));

        assertEquals("Short Stories", metadata.title());
        // Should NOT pick up "This is a collection..." as author
        assertTrue(metadata.authors().isEmpty());
    }

    @Test
    void parse_multipleAuthors_extractsAll() {
        String text = """
                Title: Collaborative Work
                Author: First Author
                Author: Second Author

                Content here.
                """;

        TextMetadata metadata = textParsingService.parse(text.getBytes(StandardCharsets.UTF_8));

        assertEquals(2, metadata.authors().size());
        assertEquals("First Author", metadata.authors().get(0));
        assertEquals("Second Author", metadata.authors().get(1));
    }

    @Test
    void parse_noMetadata_usesFirstLineAsTitle() {
        String text = """
                My Untitled Book

                This is a book with no metadata headers.
                """;

        TextMetadata metadata = textParsingService.parse(text.getBytes(StandardCharsets.UTF_8));

        assertEquals("My Untitled Book", metadata.title());
        assertTrue(metadata.authors().isEmpty());
        assertNull(metadata.language());
    }

    @Test
    void parse_withArabicChapters_detectsChapters() {
        String text = """
                Title: Test Book

                Chapter 1: The Beginning
                This is the first chapter content.

                Chapter 2: The Middle
                This is the second chapter content.

                Chapter 3: The End
                This is the third chapter content.
                """;

        TextMetadata metadata = textParsingService.parse(text.getBytes(StandardCharsets.UTF_8));

        assertEquals(3, metadata.chapters().size());
        assertEquals("Chapter 1: The Beginning", metadata.chapters().get(0).title());
        assertEquals("Chapter 2: The Middle", metadata.chapters().get(1).title());
        assertEquals("Chapter 3: The End", metadata.chapters().get(2).title());
        assertEquals(1, metadata.chapters().get(0).chapterNumber());
        assertEquals(2, metadata.chapters().get(1).chapterNumber());
        assertEquals(3, metadata.chapters().get(2).chapterNumber());
    }

    @Test
    void parse_withRomanNumeralChapters_detectsChapters() {
        String text = """
                Title: Roman Book

                Chapter I
                First chapter content.

                Chapter II
                Second chapter content.

                Chapter III: The Discovery
                Third chapter content.
                """;

        TextMetadata metadata = textParsingService.parse(text.getBytes(StandardCharsets.UTF_8));

        assertEquals(3, metadata.chapters().size());
        assertEquals("Chapter I", metadata.chapters().get(0).title());
        assertEquals("Chapter II", metadata.chapters().get(1).title());
        assertEquals("Chapter III: The Discovery", metadata.chapters().get(2).title());
    }

    @Test
    void parse_withWordNumberChapters_detectsChapters() {
        String text = """
                Title: Word Number Book

                Chapter One
                First chapter content.

                Chapter Two: The Return
                Second chapter content.
                """;

        TextMetadata metadata = textParsingService.parse(text.getBytes(StandardCharsets.UTF_8));

        assertEquals(2, metadata.chapters().size());
        assertEquals("Chapter One", metadata.chapters().get(0).title());
        assertEquals("Chapter Two: The Return", metadata.chapters().get(1).title());
    }

    @Test
    void parse_uppercaseChapter_detectsChapter() {
        String text = """
                Title: Uppercase Book

                CHAPTER 1
                First chapter content.

                CHAPTER 2: THE SEQUEL
                Second chapter content.
                """;

        TextMetadata metadata = textParsingService.parse(text.getBytes(StandardCharsets.UTF_8));

        assertEquals(2, metadata.chapters().size());
        assertEquals("Chapter 1", metadata.chapters().get(0).title());
        assertEquals("Chapter 2: THE SEQUEL", metadata.chapters().get(1).title());
    }

    @Test
    void parse_noChapters_treatAsOneChapter() {
        String text = """
                Title: Short Story
                Author: Anonymous

                This is a short story without any chapter markers.
                It just has continuous text flowing from start to end.
                """;

        TextMetadata metadata = textParsingService.parse(text.getBytes(StandardCharsets.UTF_8));

        assertEquals(1, metadata.chapters().size());
        assertEquals("Full Text", metadata.chapters().get(0).title());
        assertEquals(0, metadata.chapters().get(0).startOffset());
        assertEquals(metadata.totalTextLength(), metadata.chapters().get(0).textLength());
    }

    @Test
    void parse_gutenbergStyle_extractsMetadata() {
        String text = """
                Title: Pride and Prejudice
                Author: Jane Austen
                Language: English

                *** START OF THE PROJECT GUTENBERG EBOOK ***

                Chapter 1

                It is a truth universally acknowledged, that a single man in possession
                of a good fortune, must be in want of a wife.

                Chapter 2

                Mr. Bennet was among the earliest of those who waited on Mr. Bingley.
                """;

        TextMetadata metadata = textParsingService.parse(text.getBytes(StandardCharsets.UTF_8));

        assertEquals("Pride and Prejudice", metadata.title());
        assertEquals("Jane Austen", metadata.authors().get(0));
        assertEquals("English", metadata.language());
        assertEquals(2, metadata.chapters().size());
    }

    @Test
    void parse_emptyFile_returnsEmptyMetadata() {
        TextMetadata metadata = textParsingService.parse(new byte[0]);

        assertNull(metadata.title());
        assertTrue(metadata.authors().isEmpty());
        assertNull(metadata.language());
        assertEquals(1, metadata.chapters().size());
        assertEquals("Full Text", metadata.chapters().get(0).title());
    }

    @Test
    void parse_chapterStartOffsets_areCorrect() {
        String text = "Chapter 1: First\nSome content here.\n\nChapter 2: Second\nMore content.";

        TextMetadata metadata = textParsingService.parse(text.getBytes(StandardCharsets.UTF_8));

        assertEquals(2, metadata.chapters().size());
        assertEquals(0, metadata.chapters().get(0).startOffset());
        assertTrue(metadata.chapters().get(1).startOffset() > 0);
        // Second chapter starts where first chapter content ends
        int secondStart = metadata.chapters().get(1).startOffset();
        assertEquals(text.length() - secondStart, metadata.chapters().get(1).textLength());
    }

    @Test
    void parse_chapterTextLengths_coverEntireText() {
        String text = """
                Chapter 1: First
                Some content.

                Chapter 2: Second
                More content.

                Chapter 3: Third
                Final content.
                """;

        TextMetadata metadata = textParsingService.parse(text.getBytes(StandardCharsets.UTF_8));

        int totalFromChapters = metadata.chapters().stream()
                .mapToInt(ch -> ch.textLength())
                .sum();
        assertEquals(metadata.totalTextLength(), totalFromChapters);
    }

    @Test
    void matchChapterLine_arabicNumber_matches() {
        assertNotNull(matchChapterWithContext("Chapter 5"));
        assertNotNull(matchChapterWithContext("Chapter 12: The Return"));
        assertNotNull(matchChapterWithContext("CHAPTER 3"));
    }

    @Test
    void matchChapterLine_romanNumeral_matches() {
        assertNotNull(matchChapterWithContext("Chapter IV"));
        assertNotNull(matchChapterWithContext("Chapter XIV: Discovery"));
        assertNotNull(matchChapterWithContext("CHAPTER XII"));
    }

    @Test
    void matchChapterLine_nonChapterLine_doesNotMatch() {
        assertNull(matchChapterWithContext("This is just a regular line"));
        assertNull(matchChapterWithContext("The chapter was interesting"));
        assertNull(matchChapterWithContext(""));
    }

    @Test
    void matchChapterLine_stephenKingStyle_matches() {
        assertNotNull(matchChapterWithContext("<< 1 >> JOB INTERVIEW"));
        assertNotNull(matchChapterWithContext("<< 2 >> BOULDER"));
        assertNotNull(matchChapterWithContext("<< 57 >> EXIT"));
        assertNotNull(matchChapterWithContext("<< 7 >>"));
    }

    @Test
    void parse_stephenKingStyleWithTitleOnNextLine_extractsTitle() {
        String text = """
                << 7 >>

                IN ANOTHER BEDROOM

                Danny awoke with the booming still loud in his ears.
                """;

        TextMetadata metadata = textParsingService.parse(text.getBytes(StandardCharsets.UTF_8));

        assertEquals(1, metadata.chapters().size());
        assertEquals("Chapter 7: IN ANOTHER BEDROOM", metadata.chapters().get(0).title());
    }

    @Test
    void parse_partWithSubtitleAfterDecorativeLine_extractsSubtitle() {
        String text = """
                P A R T O N E
                - - - - - - - - - - - - - -
                PREFATORY MATTERS
                - - - - - - - - - - - - - -

                << 1 >> JOB INTERVIEW

                Jack Torrance thought: Officious little prick.
                """;

        TextMetadata metadata = textParsingService.parse(text.getBytes(StandardCharsets.UTF_8));

        assertEquals(2, metadata.chapters().size());
        assertEquals("Part ONE: PREFATORY MATTERS", metadata.chapters().get(0).title());
        assertEquals("Chapter 1: JOB INTERVIEW", metadata.chapters().get(1).title());
    }

    @Test
    void parse_mixedChapterFormats_extractsAllTitles() {
        String text = """
                P A R T T W O
                - - - - - - - - - - -
                Closing Day
                - - - - - - - - - - -

                << 8 >>

                A VIEW OF THE OVERLOOK

                The hotel was beautiful in the afternoon sun.

                << 9 >> CHECKING IT OUT

                Watson led them through the basement.
                """;

        TextMetadata metadata = textParsingService.parse(text.getBytes(StandardCharsets.UTF_8));

        assertEquals(3, metadata.chapters().size());
        assertEquals("Part TWO: Closing Day", metadata.chapters().get(0).title());
        assertEquals("Chapter 8: A VIEW OF THE OVERLOOK", metadata.chapters().get(1).title());
        assertEquals("Chapter 9: CHECKING IT OUT", metadata.chapters().get(2).title());
    }

    @Test
    void matchChapterLine_partWithSpacedLetters_matches() {
        assertNotNull(matchChapterWithContext("P A R T O N E"));
        assertNotNull(matchChapterWithContext("P A R T T W O"));
    }

    /**
     * Helper to test chapter matching with proper context (blank lines around it)
     */
    private Object matchChapterWithContext(String chapterLine) {
        String[] lines = {"", chapterLine, ""};
        return textParsingService.matchChapterLine(chapterLine, 0, 1, lines);
    }
}
