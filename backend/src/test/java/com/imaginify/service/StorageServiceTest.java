package com.imaginify.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;
import software.amazon.awssdk.services.s3.presigner.model.PresignedGetObjectRequest;
import software.amazon.awssdk.services.s3.presigner.model.PresignedPutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

import java.net.URL;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class StorageServiceTest {

    @Mock
    private S3Client s3Client;

    @Mock
    private S3Presigner s3Presigner;

    private StorageService storageService;

    @BeforeEach
    void setUp() {
        storageService = new StorageService(s3Client, s3Presigner, "test-bucket", 15);
    }

    @Test
    void generatePresignedUploadUrl_returnsUrl() throws Exception {
        PresignedPutObjectRequest presignedRequest = mock(PresignedPutObjectRequest.class);
        when(presignedRequest.url()).thenReturn(new URL("https://s3.amazonaws.com/test-bucket/books/abc.txt"));
        when(s3Presigner.presignPutObject(any(PutObjectPresignRequest.class))).thenReturn(presignedRequest);

        String url = storageService.generatePresignedUploadUrl("books/abc.txt", "text/plain; charset=utf-8");

        assertEquals("https://s3.amazonaws.com/test-bucket/books/abc.txt", url);
        ArgumentCaptor<PutObjectPresignRequest> captor = ArgumentCaptor.forClass(PutObjectPresignRequest.class);
        verify(s3Presigner).presignPutObject(captor.capture());
        assertEquals(15, captor.getValue().signatureDuration().toMinutes());
    }

    @Test
    void generatePresignedDownloadUrl_returnsUrl() throws Exception {
        PresignedGetObjectRequest presignedRequest = mock(PresignedGetObjectRequest.class);
        when(presignedRequest.url()).thenReturn(new URL("https://s3.amazonaws.com/test-bucket/books/abc.txt"));
        when(s3Presigner.presignGetObject(any(GetObjectPresignRequest.class))).thenReturn(presignedRequest);

        String url = storageService.generatePresignedDownloadUrl("books/abc.txt");

        assertEquals("https://s3.amazonaws.com/test-bucket/books/abc.txt", url);
        verify(s3Presigner).presignGetObject(any(GetObjectPresignRequest.class));
    }

    @Test
    void objectExists_whenObjectExists_returnsTrue() {
        when(s3Client.headObject(any(HeadObjectRequest.class)))
                .thenReturn(software.amazon.awssdk.services.s3.model.HeadObjectResponse.builder().build());

        assertTrue(storageService.objectExists("books/abc.txt"));
    }

    @Test
    void objectExists_whenObjectDoesNotExist_returnsFalse() {
        when(s3Client.headObject(any(HeadObjectRequest.class)))
                .thenThrow(NoSuchKeyException.builder().message("Not found").build());

        assertFalse(storageService.objectExists("books/abc.txt"));
    }

    @Test
    void getPresignedUrlExpirationMinutes_returnsConfiguredValue() {
        assertEquals(15, storageService.getPresignedUrlExpirationMinutes());
    }
}
