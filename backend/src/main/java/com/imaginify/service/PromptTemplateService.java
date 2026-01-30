package com.imaginify.service;

import com.imaginify.model.PromptContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

@Service
public class PromptTemplateService {

    private static final Logger log = LoggerFactory.getLogger(PromptTemplateService.class);
    private static final String TEMPLATE_PATH = "prompt-templates/visualization-prompt.txt";

    private final String template;

    public PromptTemplateService() throws IOException {
        ClassPathResource resource = new ClassPathResource(TEMPLATE_PATH);
        try (InputStream is = resource.getInputStream()) {
            this.template = new String(is.readAllBytes(), StandardCharsets.UTF_8);
        }
        log.info("Loaded prompt template from {}", TEMPLATE_PATH);
    }

    public String buildPrompt(PromptContext context) {
        return template
                .replace("{ART_STYLE_DESCRIPTION}", context.getArtStyleDescription())
                .replace("{BOOK_TITLE}", context.getBookTitle())
                .replace("{BOOK_AUTHORS}", String.join(", ", context.getBookAuthors()))
                .replace("{BOOK_GENRE}", String.join(", ", context.getBookGenre()))
                .replace("{BOOK_TONE}", context.getBookTone())
                .replace("{CHAPTER_NUMBER}", String.valueOf(context.getChapterNumber()))
                .replace("{CHAPTER_TITLE}", context.getChapterTitle())
                .replace("{PAGE_START}", String.valueOf(context.getPageStart()))
                .replace("{PAGE_END}", String.valueOf(context.getPageEnd()))
                .replace("{TEXT_SUMMARY}", context.getTextSummary());
    }
}
