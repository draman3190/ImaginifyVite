package com.imaginify;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import software.amazon.awssdk.enhanced.dynamodb.DynamoDbEnhancedClient;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.secretsmanager.SecretsManagerClient;

@SpringBootTest
class ImaginifyApplicationTests {

    @MockitoBean
    private DynamoDbClient dynamoDbClient;

    @MockitoBean
    private DynamoDbEnhancedClient dynamoDbEnhancedClient;

    @MockitoBean
    private S3Client s3Client;

    @MockitoBean
    private SecretsManagerClient secretsManagerClient;

    @Test
    void contextLoads() {
    }
}
