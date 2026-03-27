package com.imaginify.service;

import com.imaginify.model.PromptContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

@Service
public class PromptTemplateService {

    private static final Logger log = LoggerFactory.getLogger(PromptTemplateService.class);
    private static final String TEMPLATE_PATH = "prompt-templates/visualization-prompt.txt";

    private static final String DEFAULT_TEMPLATE = """
            Generate a collage of 10 illustrations for a book chapter.

            Art Style: {ART_STYLE_DESCRIPTION}

            Book Information:
            - Title: {BOOK_TITLE}
            - Authors: {BOOK_AUTHORS}
            - Genre: {BOOK_GENRE}
            - Tone: {BOOK_TONE}

            Chapter Information:
            - Chapter Number: {CHAPTER_NUMBER}
            - Chapter Title: {CHAPTER_TITLE}

            Chapter Summary:
            {TEXT_SUMMARY}

            Requirements:
            - Create 10 distinct illustrations arranged in a 2x5 or 5x2 grid
            - Each illustration should depict a key scene or moment from the chapter
            - Maintain consistent character appearances across illustrations
            - Match the book's tone and genre
            - Use the specified art style
            - No text or words in the images
            - No modern objects unless the story is set in modern times
            """;

    private final String template;

    /**
     * Default constructor for Lambda handler (no Spring context).
     * Uses embedded default template.
     */
    public PromptTemplateService() {
        this.template = DEFAULT_TEMPLATE;
        log.info("Using default embedded prompt template");
    }

    /**
     * Constructor that loads template from classpath (Spring context).
     */
    public PromptTemplateService(boolean loadFromClasspath) throws IOException {
        if (loadFromClasspath) {
            ClassPathResource resource = new ClassPathResource(TEMPLATE_PATH);
            try (InputStream is = resource.getInputStream()) {
                this.template = new String(is.readAllBytes(), StandardCharsets.UTF_8);
            }
            log.info("Loaded prompt template from {}", TEMPLATE_PATH);
        } else {
            this.template = DEFAULT_TEMPLATE;
        }
    }

    public String buildPrompt(PromptContext context) {
        return template
                .replace("{ART_STYLE_DESCRIPTION}", nullSafe(context.getArtStyleDescription()))
                .replace("{BOOK_TITLE}", nullSafe(context.getBookTitle()))
                .replace("{BOOK_AUTHORS}", context.getBookAuthors() != null ? String.join(", ", context.getBookAuthors()) : "Unknown")
                .replace("{BOOK_GENRE}", context.getBookGenre() != null ? String.join(", ", context.getBookGenre()) : "Fiction")
                .replace("{BOOK_TONE}", nullSafe(context.getBookTone()))
                .replace("{CHAPTER_NUMBER}", String.valueOf(context.getChapterNumber()))
                .replace("{CHAPTER_TITLE}", nullSafe(context.getChapterTitle()))
                .replace("{PAGE_START}", String.valueOf(context.getPageStart()))
                .replace("{PAGE_END}", String.valueOf(context.getPageEnd()))
                .replace("{TEXT_SUMMARY}", nullSafe(context.getTextSummary()));
    }

    /**
     * Simplified prompt builder for Lambda handler.
     */
    public String buildVisualizationPrompt(String bookTitle, List<String> authors, List<String> genre,
                                            String tone, String artStyle, int chapterNumber,
                                            String chapterTitle, String summary) {
        return template
                .replace("{ART_STYLE_DESCRIPTION}", nullSafe(artStyle, "illustration style"))
                .replace("{BOOK_TITLE}", nullSafe(bookTitle))
                .replace("{BOOK_AUTHORS}", authors != null ? String.join(", ", authors) : "Unknown")
                .replace("{BOOK_GENRE}", genre != null ? String.join(", ", genre) : "Fiction")
                .replace("{BOOK_TONE}", nullSafe(tone, "neutral"))
                .replace("{CHAPTER_NUMBER}", String.valueOf(chapterNumber))
                .replace("{CHAPTER_TITLE}", nullSafe(chapterTitle))
                .replace("{PAGE_START}", "")
                .replace("{PAGE_END}", "")
                .replace("{TEXT_SUMMARY}", nullSafe(summary));
    }

    private String nullSafe(String value) {
        return value != null ? value : "";
    }

    private String nullSafe(String value, String defaultValue) {
        return value != null && !value.isBlank() ? value : defaultValue;
    }
}
