package com.imaginify.model;

import java.util.List;

public class PromptContext {

    private String bookTitle;
    private List<String> bookAuthors;
    private List<String> bookGenre;
    private String bookTone;
    private String artStyleDescription;
    private int chapterNumber;
    private String chapterTitle;
    private int pageStart;
    private int pageEnd;
    private String textSummary;

    public String getBookTitle() {
        return bookTitle;
    }

    public void setBookTitle(String bookTitle) {
        this.bookTitle = bookTitle;
    }

    public List<String> getBookAuthors() {
        return bookAuthors;
    }

    public void setBookAuthors(List<String> bookAuthors) {
        this.bookAuthors = bookAuthors;
    }

    public List<String> getBookGenre() {
        return bookGenre;
    }

    public void setBookGenre(List<String> bookGenre) {
        this.bookGenre = bookGenre;
    }

    public String getBookTone() {
        return bookTone;
    }

    public void setBookTone(String bookTone) {
        this.bookTone = bookTone;
    }

    public String getArtStyleDescription() {
        return artStyleDescription;
    }

    public void setArtStyleDescription(String artStyleDescription) {
        this.artStyleDescription = artStyleDescription;
    }

    public int getChapterNumber() {
        return chapterNumber;
    }

    public void setChapterNumber(int chapterNumber) {
        this.chapterNumber = chapterNumber;
    }

    public String getChapterTitle() {
        return chapterTitle;
    }

    public void setChapterTitle(String chapterTitle) {
        this.chapterTitle = chapterTitle;
    }

    public int getPageStart() {
        return pageStart;
    }

    public void setPageStart(int pageStart) {
        this.pageStart = pageStart;
    }

    public int getPageEnd() {
        return pageEnd;
    }

    public void setPageEnd(int pageEnd) {
        this.pageEnd = pageEnd;
    }

    public String getTextSummary() {
        return textSummary;
    }

    public void setTextSummary(String textSummary) {
        this.textSummary = textSummary;
    }
}
