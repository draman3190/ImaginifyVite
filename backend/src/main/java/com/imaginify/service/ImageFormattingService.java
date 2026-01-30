package com.imaginify.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class ImageFormattingService {

    private static final Logger log = LoggerFactory.getLogger(ImageFormattingService.class);

    public List<byte[]> extractFromCollage(byte[] collageImage) {
        throw new UnsupportedOperationException("Collage extraction not yet implemented");
    }

    public byte[] resize(byte[] imageData, int targetWidth, int targetHeight) {
        throw new UnsupportedOperationException("Image resizing not yet implemented");
    }

    public byte[] enhance(byte[] imageData) {
        throw new UnsupportedOperationException("Image enhancement not yet implemented");
    }

    public byte[] convertFormat(byte[] imageData, String targetFormat) {
        throw new UnsupportedOperationException("Format conversion not yet implemented");
    }
}
