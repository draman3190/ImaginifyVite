package com.imaginify.controller;

import com.imaginify.dto.response.BookResponse;
import com.imaginify.dto.response.BookSummaryResponse;
import com.imaginify.dto.response.PresignedDownloadUrlResponse;
import com.imaginify.dto.response.PresignedUploadUrlResponse;
import com.imaginify.exception.BookNotFoundException;
import com.imaginify.exception.EpubProcessingException;
import com.imaginify.model.ProcessingStatus;
import com.imaginify.service.LibraryService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(LibraryController.class)
class LibraryControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private LibraryService libraryService;

    @Test
    void listBooks_returnsOk() throws Exception {
        BookSummaryResponse summary = new BookSummaryResponse(
                "id-1", "Test Book", List.of("Author"), List.of("Fiction"), 200, "COMPLETED");
        when(libraryService.listBooks()).thenReturn(List.of(summary));

        mockMvc.perform(get("/library/books"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].bookId").value("id-1"))
                .andExpect(jsonPath("$[0].processingStatus").value("COMPLETED"));
    }

    @Test
    void getBook_existingBook_returnsOk() throws Exception {
        BookResponse response = new BookResponse(
                "id-1", "Test Book", List.of("Author"), "en", "Publisher",
                "2024-01-01", "1234567890", List.of("Fiction"), 200, null,
                "2024-01-01T00:00:00Z", "COMPLETED", "A description", List.of());
        when(libraryService.getBook("id-1")).thenReturn(response);

        mockMvc.perform(get("/library/books/id-1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.bookId").value("id-1"))
                .andExpect(jsonPath("$.uploadTimestamp").value("2024-01-01T00:00:00Z"))
                .andExpect(jsonPath("$.processingStatus").value("COMPLETED"))
                .andExpect(jsonPath("$.description").value("A description"));
    }

    @Test
    void getBook_notFound_returns404() throws Exception {
        when(libraryService.getBook("missing")).thenThrow(new BookNotFoundException("missing"));

        mockMvc.perform(get("/library/books/missing"))
                .andExpect(status().isNotFound());
    }

    @Test
    void searchBooks_returnsOk() throws Exception {
        BookSummaryResponse summary = new BookSummaryResponse(
                "id-1", "Moby Dick", List.of("Melville"), List.of("Fiction"), 300, "COMPLETED");
        when(libraryService.searchBooks("moby")).thenReturn(List.of(summary));

        mockMvc.perform(get("/library/books/search").param("query", "moby"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].title").value("Moby Dick"));
    }

    @Test
    void uploadBook_validRequest_returnsCreated() throws Exception {
        BookResponse response = new BookResponse(
                "id-1", "New Book", List.of("Author"), null, null, null, null,
                null, 0, null, null, null, null, List.of());
        when(libraryService.createBook(any())).thenReturn(response);

        mockMvc.perform(post("/library/books")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title": "New Book", "authors": ["Author"]}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.title").value("New Book"));
    }

    @Test
    void deleteBook_existingBook_returnsNoContent() throws Exception {
        doNothing().when(libraryService).deleteBook("id-1");

        mockMvc.perform(delete("/library/books/id-1"))
                .andExpect(status().isNoContent());
    }

    @Test
    void getUploadUrl_returnsCreated() throws Exception {
        PresignedUploadUrlResponse response = new PresignedUploadUrlResponse(
                "id-1", "https://s3.example.com/upload", "epubs/id-1.epub", 15);
        when(libraryService.initiateUpload("mybook.epub")).thenReturn(response);

        mockMvc.perform(post("/library/books/upload-url").param("filename", "mybook.epub"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.bookId").value("id-1"))
                .andExpect(jsonPath("$.uploadUrl").value("https://s3.example.com/upload"))
                .andExpect(jsonPath("$.s3Key").value("epubs/id-1.epub"))
                .andExpect(jsonPath("$.expirationMinutes").value(15));
    }

    @Test
    void confirmUpload_success_returnsOk() throws Exception {
        BookResponse response = new BookResponse(
                "id-1", "Parsed Title", List.of("Author"), "en", null, null, null,
                null, 0, "s3://epubs/id-1.epub", "2024-01-01T00:00:00Z",
                "COMPLETED", "Parsed description", List.of());
        when(libraryService.confirmUpload("id-1")).thenReturn(response);

        mockMvc.perform(post("/library/books/id-1/confirm-upload"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Parsed Title"))
                .andExpect(jsonPath("$.processingStatus").value("COMPLETED"));
    }

    @Test
    void confirmUpload_processingError_returns422() throws Exception {
        when(libraryService.confirmUpload("id-1"))
                .thenThrow(new EpubProcessingException("Invalid EPUB"));

        mockMvc.perform(post("/library/books/id-1/confirm-upload"))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    void confirmUpload_bookNotFound_returns404() throws Exception {
        when(libraryService.confirmUpload("missing"))
                .thenThrow(new BookNotFoundException("missing"));

        mockMvc.perform(post("/library/books/missing/confirm-upload"))
                .andExpect(status().isNotFound());
    }

    @Test
    void getDownloadUrl_existingBook_returnsOk() throws Exception {
        PresignedDownloadUrlResponse response = new PresignedDownloadUrlResponse(
                "id-1", "https://s3.example.com/download", 15);
        when(libraryService.getDownloadUrl("id-1")).thenReturn(response);

        mockMvc.perform(get("/library/books/id-1/download-url"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.bookId").value("id-1"))
                .andExpect(jsonPath("$.downloadUrl").value("https://s3.example.com/download"))
                .andExpect(jsonPath("$.expirationMinutes").value(15));
    }

    @Test
    void getDownloadUrl_bookNotFound_returns404() throws Exception {
        when(libraryService.getDownloadUrl("missing"))
                .thenThrow(new BookNotFoundException("missing"));

        mockMvc.perform(get("/library/books/missing/download-url"))
                .andExpect(status().isNotFound());
    }

    private static <T> T any() {
        return org.mockito.ArgumentMatchers.any();
    }
}
