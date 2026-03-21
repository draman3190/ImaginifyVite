package com.imaginify.model;

import software.amazon.awssdk.enhanced.dynamodb.mapper.annotations.DynamoDbBean;
import software.amazon.awssdk.enhanced.dynamodb.mapper.annotations.DynamoDbIgnore;

import java.util.List;

@DynamoDbBean
public class Chapter {

    private int chapterNumber;
    private String title;
    private String chapterType;    // "CONTENT" for regular chapters, "TRANSITION" for part headers/dividers
    private int startOffset;
    private int textLength;
    private String text;           // Chapter text stored in S3, not DynamoDB (use @DynamoDbIgnore)
    private String summary;        // AI-generated summary of chapter content
    private List<Segment> segments; // Reading segments (2-3 page chunks) with natural pause points
    private List<ImageMetadata> images; // Legacy: direct chapter images (prefer segment-level images)

    public int getChapterNumber() {
        return chapterNumber;
    }

    public void setChapterNumber(int chapterNumber) {
        this.chapterNumber = chapterNumber;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getChapterType() {
        return chapterType;
    }

    public void setChapterType(String chapterType) {
        this.chapterType = chapterType;
    }

    public int getStartOffset() {
        return startOffset;
    }

    public void setStartOffset(int startOffset) {
        this.startOffset = startOffset;
    }

    public int getTextLength() {
        return textLength;
    }

    public void setTextLength(int textLength) {
        this.textLength = textLength;
    }

    @DynamoDbIgnore
    public String getText() {
        return text;
    }

    public void setText(String text) {
        this.text = text;
    }

    public String getSummary() {
        return summary;
    }

    public void setSummary(String summary) {
        this.summary = summary;
    }

    public List<Segment> getSegments() {
        return segments;
    }

    public void setSegments(List<Segment> segments) {
        this.segments = segments;
    }

    public List<ImageMetadata> getImages() {
        return images;
    }

    public void setImages(List<ImageMetadata> images) {
        this.images = images;
    }
}
