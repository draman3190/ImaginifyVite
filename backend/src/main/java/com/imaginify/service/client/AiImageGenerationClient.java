package com.imaginify.service.client;

public interface AiImageGenerationClient {

    byte[] generateImage(String prompt);

    String getProviderName();
}
