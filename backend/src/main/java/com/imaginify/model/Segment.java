package com.imaginify.model;

import software.amazon.awssdk.enhanced.dynamodb.mapper.annotations.DynamoDbBean;

import java.util.List;

/**
 * Represents a reading segment within a chapter - a natural 2-3 page chunk
 * that ends at a pause point (explicit break or AI-detected natural pause).
 * Each segment can have one or more generated images associated with it.
 */
@DynamoDbBean
public class Segment {

    private int segmentNumber;
    private int startOffset;      // Offset within the chapter text
    private int endOffset;        // End offset within the chapter text
    private String text;          // The segment's text content
    private String endMarker;     // Last sentence of segment (for reader reference)
    private List<ImageMetadata> images;

    public int getSegmentNumber() {
        return segmentNumber;
    }

    public void setSegmentNumber(int segmentNumber) {
        this.segmentNumber = segmentNumber;
    }

    public int getStartOffset() {
        return startOffset;
    }

    public void setStartOffset(int startOffset) {
        this.startOffset = startOffset;
    }

    public int getEndOffset() {
        return endOffset;
    }

    public void setEndOffset(int endOffset) {
        this.endOffset = endOffset;
    }

    public String getText() {
        return text;
    }

    public void setText(String text) {
        this.text = text;
    }

    public String getEndMarker() {
        return endMarker;
    }

    public void setEndMarker(String endMarker) {
        this.endMarker = endMarker;
    }

    public List<ImageMetadata> getImages() {
        return images;
    }

    public void setImages(List<ImageMetadata> images) {
        this.images = images;
    }
}
