package com.imaginify.service;

import com.imaginify.model.QualityScore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Random;

import static org.junit.jupiter.api.Assertions.*;

class QualityAssuranceServiceTest {

    private QualityAssuranceService qa;

    @BeforeEach
    void setUp() {
        qa = new QualityAssuranceService();
    }

    @Nested
    @DisplayName("Layer 1: Hard Constraints")
    class Layer1HardConstraints {

        @Test
        @DisplayName("Rejects null image data")
        void rejectsNullData() {
            QualityScore result = qa.validateGeneratedImage(null, "test prompt");

            assertFalse(result.isPassed());
            assertEquals(0.0, result.getOverallScore());
            assertTrue(result.getFeedback().contains("missing"));
        }

        @Test
        @DisplayName("Rejects empty image data")
        void rejectsEmptyData() {
            QualityScore result = qa.validateGeneratedImage(new byte[0], "test prompt");

            assertFalse(result.isPassed());
            assertEquals(0.0, result.getOverallScore());
        }

        @Test
        @DisplayName("Rejects image smaller than 1KB")
        void rejectsTooSmall() {
            byte[] smallData = new byte[500];
            QualityScore result = qa.validateGeneratedImage(smallData, "test prompt");

            assertFalse(result.isPassed());
            assertTrue(result.getFeedback().contains("too small"));
        }

        @Test
        @DisplayName("Rejects unrecognized image format")
        void rejectsInvalidFormat() {
            byte[] randomData = new byte[2000];
            new Random().nextBytes(randomData);

            QualityScore result = qa.validateGeneratedImage(randomData, "test prompt");

            assertFalse(result.isPassed());
            assertTrue(result.getFeedback().contains("Unrecognized"));
        }

        @Test
        @DisplayName("Recognizes PNG format but may fail structure check")
        void recognizesPngFormat() {
            byte[] pngData = createFakePng(2000);

            QualityScore result = qa.validateGeneratedImage(pngData, "test prompt");

            // Fake PNG passes Layer 1 (format detection) but passes/fails Layer 2 based on structure
            // For PNG, we just check size > 100, so this should pass
            assertTrue(result.isPassed(), "PNG should pass: " + result.getFeedback());
        }

        @Test
        @DisplayName("Recognizes JPEG format and validates structure")
        void recognizesJpegFormat() {
            byte[] jpegData = createValidJpeg(2000);

            QualityScore result = qa.validateGeneratedImage(jpegData, "test prompt");

            // Valid JPEG with proper FF D9 ending should pass
            assertTrue(result.isPassed(), "Valid JPEG should pass: " + result.getFeedback());
        }

        @Test
        @DisplayName("Recognizes GIF format and validates trailer")
        void recognizesGifFormat() {
            byte[] gifData = createFakeGif(2000);

            QualityScore result = qa.validateGeneratedImage(gifData, "test prompt");

            // GIF with 0x3B trailer should pass
            assertTrue(result.isPassed(), "Valid GIF should pass: " + result.getFeedback());
        }

        @Test
        @DisplayName("Recognizes WebP format")
        void recognizesWebpFormat() {
            byte[] webpData = createFakeWebp(2000);

            QualityScore result = qa.validateGeneratedImage(webpData, "test prompt");

            // WebP just checks RIFF...WEBP header and size > 100
            assertTrue(result.isPassed(), "WebP should pass: " + result.getFeedback());
        }
    }

    @Nested
    @DisplayName("Layer 2: Visual Scoring")
    class Layer2VisualScoring {

        @Test
        @DisplayName("Rejects JPEG with invalid ending")
        void rejectsCorruptedJpeg() {
            byte[] badJpeg = new byte[2000];
            // Valid JPEG header
            badJpeg[0] = (byte) 0xFF;
            badJpeg[1] = (byte) 0xD8;
            badJpeg[2] = (byte) 0xFF;
            // But no valid ending (should end with FF D9)

            QualityScore result = qa.validateGeneratedImage(badJpeg, "test prompt");

            assertFalse(result.isPassed());
            assertTrue(result.getFeedback().contains("corrupted"));
        }

        @Test
        @DisplayName("Accepts JPEG with valid structure")
        void acceptsValidJpegStructure() {
            byte[] validJpeg = createValidJpeg(5000);

            QualityScore result = qa.validateGeneratedImage(validJpeg, "test prompt");

            assertTrue(result.isPassed());
            assertTrue(result.getOverallScore() > 0.8);
        }
    }

    @Nested
    @DisplayName("Real Image Tests")
    class RealImageTests {

        @Test
        @DisplayName("Accepts real PNG from web")
        void acceptsRealPng() throws IOException, InterruptedException {
            // Use httpbin.org which is reliable for testing
            byte[] realPng = downloadImage("https://httpbin.org/image/png");

            if (realPng == null) {
                System.out.println("Skipping - could not download test image");
                return;
            }

            QualityScore result = qa.validateGeneratedImage(realPng, "a pig icon");

            assertTrue(result.isPassed(), "Real PNG should pass: " + result.getFeedback());
            System.out.println("Real PNG (" + realPng.length + " bytes): " + result.getFeedback());
        }

        @Test
        @DisplayName("Accepts real JPEG from web")
        void acceptsRealJpeg() throws IOException, InterruptedException {
            // Use httpbin.org which is reliable for testing
            byte[] realJpeg = downloadImage("https://httpbin.org/image/jpeg");

            if (realJpeg == null) {
                System.out.println("Skipping - could not download test image");
                return;
            }

            QualityScore result = qa.validateGeneratedImage(realJpeg, "a sample image");

            assertTrue(result.isPassed(), "Real JPEG should pass: " + result.getFeedback());
            System.out.println("Real JPEG (" + realJpeg.length + " bytes): " + result.getFeedback());
        }
    }

    // Helper methods to create test images

    private byte[] createFakePng(int size) {
        byte[] data = new byte[size];
        // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
        data[0] = (byte) 0x89;
        data[1] = (byte) 0x50;
        data[2] = (byte) 0x4E;
        data[3] = (byte) 0x47;
        data[4] = (byte) 0x0D;
        data[5] = (byte) 0x0A;
        data[6] = (byte) 0x1A;
        data[7] = (byte) 0x0A;
        return data;
    }

    private byte[] createValidJpeg(int size) {
        byte[] data = new byte[size];
        // JPEG header: FF D8 FF
        data[0] = (byte) 0xFF;
        data[1] = (byte) 0xD8;
        data[2] = (byte) 0xFF;
        // JPEG ending: FF D9
        data[size - 2] = (byte) 0xFF;
        data[size - 1] = (byte) 0xD9;
        return data;
    }

    private byte[] createFakeGif(int size) {
        byte[] data = new byte[size];
        // GIF header: 47 49 46 38 (GIF8)
        data[0] = (byte) 0x47;
        data[1] = (byte) 0x49;
        data[2] = (byte) 0x46;
        data[3] = (byte) 0x38;
        // GIF trailer: 3B
        data[size - 1] = (byte) 0x3B;
        return data;
    }

    private byte[] createFakeWebp(int size) {
        byte[] data = new byte[size];
        // WebP: RIFF....WEBP
        data[0] = (byte) 0x52; // R
        data[1] = (byte) 0x49; // I
        data[2] = (byte) 0x46; // F
        data[3] = (byte) 0x46; // F
        // bytes 4-7: file size (skip)
        data[8] = (byte) 0x57;  // W
        data[9] = (byte) 0x45;  // E
        data[10] = (byte) 0x42; // B
        data[11] = (byte) 0x50; // P
        return data;
    }

    private byte[] downloadImage(String urlString) {
        try {
            HttpClient client = HttpClient.newHttpClient();
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(urlString))
                    .build();
            HttpResponse<byte[]> response = client.send(request, HttpResponse.BodyHandlers.ofByteArray());
            if (response.statusCode() == 200) {
                return response.body();
            }
        } catch (Exception e) {
            System.err.println("Failed to download: " + e.getMessage());
        }
        return null;
    }
}
