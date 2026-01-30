package com.imaginify.service.client;

import org.springframework.stereotype.Component;

@Component
public class GeminiImageGenerationClient implements AiImageGenerationClient {

    @Override
    public byte[] generateImage(String prompt) {
        throw new UnsupportedOperationException("Gemini image generation not yet implemented");
    }

    @Override
    public String getProviderName() {
        return "gemini";
    }
}
