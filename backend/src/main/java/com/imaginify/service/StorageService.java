package com.imaginify.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

import java.time.Duration;

@Service
public class StorageService {

    private static final Logger log = LoggerFactory.getLogger(StorageService.class);

    private final S3Client s3Client;
    private final S3Presigner s3Presigner;
    private final String bucketName;
    private final int presignedUrlExpirationMinutes;

    public StorageService(S3Client s3Client,
                          S3Presigner s3Presigner,
                          @Value("${aws.s3.bucket-name}") String bucketName,
                          @Value("${aws.s3.presigned-url-expiration-minutes}") int presignedUrlExpirationMinutes) {
        this.s3Client = s3Client;
        this.s3Presigner = s3Presigner;
        this.bucketName = bucketName;
        this.presignedUrlExpirationMinutes = presignedUrlExpirationMinutes;
    }

    public String uploadImage(String key, byte[] imageData, String contentType) {
        log.info("Uploading image to S3: bucket={}, key={}", bucketName, key);
        s3Client.putObject(
                PutObjectRequest.builder()
                        .bucket(bucketName)
                        .key(key)
                        .contentType(contentType)
                        .build(),
                RequestBody.fromBytes(imageData));
        return "s3://" + bucketName + "/" + key;
    }

    public void uploadText(String key, String text) {
        log.info("Uploading text to S3: bucket={}, key={}, length={}", bucketName, key, text.length());
        s3Client.putObject(
                PutObjectRequest.builder()
                        .bucket(bucketName)
                        .key(key)
                        .contentType("text/plain; charset=utf-8")
                        .build(),
                RequestBody.fromString(text));
    }

    public String downloadText(String key) {
        log.info("Downloading text from S3: bucket={}, key={}", bucketName, key);
        return s3Client.getObjectAsBytes(
                GetObjectRequest.builder()
                        .bucket(bucketName)
                        .key(key)
                        .build())
                .asUtf8String();
    }

    public byte[] downloadFile(String key) {
        log.info("Downloading file from S3: bucket={}, key={}", bucketName, key);
        return s3Client.getObjectAsBytes(
                GetObjectRequest.builder()
                        .bucket(bucketName)
                        .key(key)
                        .build())
                .asByteArray();
    }

    public void deleteFile(String key) {
        log.info("Deleting file from S3: bucket={}, key={}", bucketName, key);
        s3Client.deleteObject(
                DeleteObjectRequest.builder()
                        .bucket(bucketName)
                        .key(key)
                        .build());
    }

    public String generatePresignedUploadUrl(String key, String contentType) {
        log.info("Generating presigned upload URL: bucket={}, key={}", bucketName, key);
        PutObjectRequest putObjectRequest = PutObjectRequest.builder()
                .bucket(bucketName)
                .key(key)
                .contentType(contentType)
                .build();

        PutObjectPresignRequest presignRequest = PutObjectPresignRequest.builder()
                .signatureDuration(Duration.ofMinutes(presignedUrlExpirationMinutes))
                .putObjectRequest(putObjectRequest)
                .build();

        return s3Presigner.presignPutObject(presignRequest).url().toString();
    }

    public String generatePresignedDownloadUrl(String key) {
        log.info("Generating presigned download URL: bucket={}, key={}", bucketName, key);
        GetObjectRequest getObjectRequest = GetObjectRequest.builder()
                .bucket(bucketName)
                .key(key)
                .build();

        GetObjectPresignRequest presignRequest = GetObjectPresignRequest.builder()
                .signatureDuration(Duration.ofMinutes(presignedUrlExpirationMinutes))
                .getObjectRequest(getObjectRequest)
                .build();

        return s3Presigner.presignGetObject(presignRequest).url().toString();
    }

    public boolean objectExists(String key) {
        try {
            s3Client.headObject(HeadObjectRequest.builder()
                    .bucket(bucketName)
                    .key(key)
                    .build());
            return true;
        } catch (NoSuchKeyException e) {
            return false;
        }
    }

    public int getPresignedUrlExpirationMinutes() {
        return presignedUrlExpirationMinutes;
    }
}
