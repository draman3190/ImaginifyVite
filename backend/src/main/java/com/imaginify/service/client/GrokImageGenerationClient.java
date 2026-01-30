package com.imaginify.service.client;

import org.springframework.stereotype.Component;

@Component
public class GrokImageGenerationClient implements AiImageGenerationClient {

    @Override
    public byte[] generateImage(String prompt) {
        throw new UnsupportedOperationException("Grok image generation not yet implemented");
    }

    @Override
    public String getProviderName() {
        return "grok";
    }
}
