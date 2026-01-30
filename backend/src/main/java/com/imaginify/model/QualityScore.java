package com.imaginify.model;

import java.util.Map;

public class QualityScore {

    private boolean passed;
    private double overallScore;
    private Map<String, Integer> criteriaScores;
    private String feedback;

    public boolean isPassed() {
        return passed;
    }

    public void setPassed(boolean passed) {
        this.passed = passed;
    }

    public double getOverallScore() {
        return overallScore;
    }

    public void setOverallScore(double overallScore) {
        this.overallScore = overallScore;
    }

    public Map<String, Integer> getCriteriaScores() {
        return criteriaScores;
    }

    public void setCriteriaScores(Map<String, Integer> criteriaScores) {
        this.criteriaScores = criteriaScores;
    }

    public String getFeedback() {
        return feedback;
    }

    public void setFeedback(String feedback) {
        this.feedback = feedback;
    }
}
