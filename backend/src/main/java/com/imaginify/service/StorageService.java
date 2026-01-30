package com.imaginify.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

@Service
public class StorageService {

    private static final Logger log = LoggerFactory.getLogger(StorageService.class);

    private final S3Client s3Client;
    private final String bucketName;

    public StorageService(S3Client s3Client, @Value("${aws.s3.bucket-name}") String bucketName) {
        this.s3Client = s3Client;
        this.bucketName = bucketName;
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
}
