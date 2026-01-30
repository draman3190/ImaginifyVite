package com.imaginify.service;

import com.imaginify.dto.response.GenerateImagesResponse;
import com.imaginify.exception.BookNotFoundException;
import com.imaginify.exception.ImageGenerationException;
import com.imaginify.model.Book;
import com.imaginify.model.Chapter;
import com.imaginify.model.ImageMetadata;
import com.imaginify.model.PromptContext;
import com.imaginify.model.QualityScore;
import com.imaginify.repository.BookRepository;
import com.imaginify.service.client.AiImageGenerationClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class ImageGenerationOrchestrationService {

    private static final Logger log = LoggerFactory.getLogger(ImageGenerationOrchestrationService.class);

    private final BookRepository bookRepository;
    private final PromptTemplateService promptTemplateService;
    private final AiImageGenerationClient imageGenerationClient;
    private final QualityAssuranceService qualityAssuranceService;
    private final ImageFormattingService imageFormattingService;
    private final StorageService storageService;

    public ImageGenerationOrchestrationService(
            BookRepository bookRepository,
            PromptTemplateService promptTemplateService,
            List<AiImageGenerationClient> imageGenerationClients,
            QualityAssuranceService qualityAssuranceService,
            ImageFormattingService imageFormattingService,
            StorageService storageService) {
        this.bookRepository = bookRepository;
        this.promptTemplateService = promptTemplateService;
        this.imageGenerationClient = imageGenerationClients.getFirst();
        this.qualityAssuranceService = qualityAssuranceService;
        this.imageFormattingService = imageFormattingService;
        this.storageService = storageService;
    }

    public GenerateImagesResponse generateImagesForBook(String bookId) {
        log.info("Starting image generation pipeline for book: {}", bookId);

        Book book = bookRepository.findById(bookId)
                .orElseThrow(() -> new BookNotFoundException(bookId));

        List<Chapter> chapters = book.getChapters();
        if (chapters == null || chapters.isEmpty()) {
            throw new ImageGenerationException("Book has no chapters to generate images for: " + bookId);
        }

        for (Chapter chapter : chapters) {
            processChapter(book, chapter);
        }

        bookRepository.save(book);
        log.info("Completed image generation pipeline for book: {}", bookId);

        return new GenerateImagesResponse(bookId, "COMPLETED",
                "Image generation completed for " + chapters.size() + " chapters");
    }

    private void processChapter(Book book, Chapter chapter) {
        log.info("Processing chapter {} - {}", chapter.getChapterNumber(), chapter.getTitle());

        PromptContext context = buildPromptContext(book, chapter);
        String prompt = promptTemplateService.buildPrompt(context);

        byte[] collageImage = generateWithRetries(prompt);

        List<byte[]> extractedImages = imageFormattingService.extractFromCollage(collageImage);

        List<ImageMetadata> imageMetadataList = new ArrayList<>();
        for (int i = 0; i < extractedImages.size(); i++) {
            byte[] processed = imageFormattingService.enhance(extractedImages.get(i));
            processed = imageFormattingService.convertFormat(processed, "png");

            String key = String.format("books/%s/chapters/%d/img_%03d.png",
                    book.getBookId(), chapter.getChapterNumber(), i + 1);
            String url = storageService.uploadImage(key, processed, "image/png");

            ImageMetadata metadata = new ImageMetadata();
            metadata.setId(UUID.randomUUID().toString());
            metadata.setUrl(url);
            metadata.setProvider(imageGenerationClient.getProviderName());
            metadata.setWidth(1024);
            metadata.setHeight(1024);
            metadata.setFormat("png");
            metadata.setCreatedAt(Instant.now());
            metadata.setType("CHAPTER");
            imageMetadataList.add(metadata);
        }

        chapter.setImages(imageMetadataList);
    }

    private byte[] generateWithRetries(String prompt) {
        int maxAttempts = qualityAssuranceService.getMaxRetries() + 1;
        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            log.info("Image generation attempt {}/{}", attempt, maxAttempts);
            byte[] imageData = imageGenerationClient.generateImage(prompt);
            QualityScore score = qualityAssuranceService.validateGeneratedImage(imageData, prompt);

            if (score.isPassed()) {
                log.info("Image passed quality assurance on attempt {}", attempt);
                return imageData;
            }
            log.warn("Image failed quality assurance on attempt {}: {}", attempt, score.getFeedback());
        }

        log.error("Image generation failed quality assurance after {} attempts", maxAttempts);
        throw new ImageGenerationException(
                "Failed to generate image meeting quality standards after " + maxAttempts + " attempts");
    }

    private PromptContext buildPromptContext(Book book, Chapter chapter) {
        PromptContext context = new PromptContext();
        context.setBookTitle(book.getTitle());
        context.setBookAuthors(book.getAuthors());
        context.setBookGenre(book.getGenre());
        context.setBookTone("");
        context.setArtStyleDescription("");
        context.setChapterNumber(chapter.getChapterNumber());
        context.setChapterTitle(chapter.getTitle());
        context.setPageStart(chapter.getStartOffset());
        context.setPageEnd(chapter.getStartOffset() + chapter.getTextLength());
        context.setTextSummary("");
        return context;
    }
}
