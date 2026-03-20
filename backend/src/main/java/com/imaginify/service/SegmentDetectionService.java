package com.imaginify.service;

import com.imaginify.model.Segment;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Detects natural reading segments within chapter text.
 *
 * Strategy:
 * 1. Look for explicit section breaks (*, -, blank lines)
 * 2. If no breaks or segments too long, split at paragraph boundaries
 *    targeting ~2500 chars (roughly 2-3 pages)
 * 3. Future: LLM-based natural pause detection for better break points
 */
@Service
public class SegmentDetectionService {

    private static final Logger log = LoggerFactory.getLogger(SegmentDetectionService.class);

    // Target segment size: ~2500 chars ≈ 2-3 pages on a Kindle-sized screen
    private static final int TARGET_SEGMENT_SIZE = 2500;
    private static final int MIN_SEGMENT_SIZE = 1500;  // Don't create tiny segments
    private static final int MAX_SEGMENT_SIZE = 5000;  // Force split if too long

    // Explicit section break patterns
    private static final Pattern SECTION_BREAK_PATTERN = Pattern.compile(
            "(?m)^\\s*(?:[*]{3,}|[-]{3,}|[~]{3,}|[=]{3,})\\s*$|(?:\\n\\s*){3,}");

    // Paragraph boundary (two+ newlines)
    private static final Pattern PARAGRAPH_PATTERN = Pattern.compile("\\n\\s*\\n");

    /**
     * Detect segments within chapter text.
     *
     * @param chapterText The full text of the chapter
     * @return List of segments with text and offsets
     */
    public List<Segment> detectSegments(String chapterText) {
        if (chapterText == null || chapterText.isBlank()) {
            return List.of();
        }

        // First, try to find explicit section breaks
        List<Integer> breakPoints = findExplicitBreaks(chapterText);

        if (!breakPoints.isEmpty()) {
            List<Segment> segments = createSegmentsFromBreaks(chapterText, breakPoints);
            // Check if any segment is too long and needs further splitting
            segments = splitLongSegments(segments);
            log.info("Detected {} segments using explicit breaks", segments.size());
            return segments;
        }

        // No explicit breaks — split at paragraph boundaries targeting 2-3 pages
        List<Segment> segments = splitAtParagraphBoundaries(chapterText);
        log.info("Detected {} segments using paragraph boundaries", segments.size());
        return segments;
    }

    /**
     * Find explicit section breaks in the text.
     */
    private List<Integer> findExplicitBreaks(String text) {
        List<Integer> breaks = new ArrayList<>();
        Matcher matcher = SECTION_BREAK_PATTERN.matcher(text);

        while (matcher.find()) {
            breaks.add(matcher.start());
        }

        return breaks;
    }

    /**
     * Create segments from explicit break points.
     */
    private List<Segment> createSegmentsFromBreaks(String text, List<Integer> breakPoints) {
        List<Segment> segments = new ArrayList<>();
        int segmentNumber = 1;
        int startOffset = 0;

        for (int breakPoint : breakPoints) {
            if (breakPoint > startOffset + MIN_SEGMENT_SIZE) {
                Segment segment = createSegment(segmentNumber++, text, startOffset, breakPoint);
                segments.add(segment);

                // Skip past the break marker to find the start of next segment
                startOffset = findNextContentStart(text, breakPoint);
            }
        }

        // Add final segment
        if (startOffset < text.length()) {
            Segment segment = createSegment(segmentNumber, text, startOffset, text.length());
            segments.add(segment);
        }

        return segments;
    }

    /**
     * Split text at paragraph boundaries, targeting ~2500 chars per segment.
     */
    private List<Segment> splitAtParagraphBoundaries(String text) {
        List<Segment> segments = new ArrayList<>();
        List<Integer> paragraphBreaks = new ArrayList<>();

        // Find all paragraph boundaries
        Matcher matcher = PARAGRAPH_PATTERN.matcher(text);
        while (matcher.find()) {
            paragraphBreaks.add(matcher.end());
        }

        if (paragraphBreaks.isEmpty()) {
            // No paragraph breaks — treat as single segment
            Segment segment = createSegment(1, text, 0, text.length());
            segments.add(segment);
            return segments;
        }

        int segmentNumber = 1;
        int startOffset = 0;
        int accumulatedLength = 0;

        for (int paragraphEnd : paragraphBreaks) {
            int paragraphLength = paragraphEnd - startOffset - accumulatedLength;
            accumulatedLength = paragraphEnd - startOffset;

            // If we've accumulated enough text, create a segment
            if (accumulatedLength >= TARGET_SEGMENT_SIZE) {
                Segment segment = createSegment(segmentNumber++, text, startOffset, paragraphEnd);
                segments.add(segment);
                startOffset = paragraphEnd;
                accumulatedLength = 0;
            }
        }

        // Add final segment if there's remaining content
        if (startOffset < text.length()) {
            String remaining = text.substring(startOffset).trim();
            if (!remaining.isEmpty()) {
                // If remaining is tiny, merge with previous segment
                if (remaining.length() < MIN_SEGMENT_SIZE && !segments.isEmpty()) {
                    Segment lastSegment = segments.remove(segments.size() - 1);
                    Segment merged = createSegment(lastSegment.getSegmentNumber(), text,
                            lastSegment.getStartOffset(), text.length());
                    segments.add(merged);
                } else {
                    Segment segment = createSegment(segmentNumber, text, startOffset, text.length());
                    segments.add(segment);
                }
            }
        }

        return segments;
    }

    /**
     * Split any segments that exceed MAX_SEGMENT_SIZE.
     */
    private List<Segment> splitLongSegments(List<Segment> segments) {
        List<Segment> result = new ArrayList<>();
        int segmentNumber = 1;

        for (Segment segment : segments) {
            if (segment.getText().length() > MAX_SEGMENT_SIZE) {
                // Re-split this segment at paragraph boundaries
                List<Segment> subSegments = splitAtParagraphBoundaries(segment.getText());
                for (Segment sub : subSegments) {
                    // Adjust offsets relative to original chapter
                    sub.setSegmentNumber(segmentNumber++);
                    sub.setStartOffset(segment.getStartOffset() + sub.getStartOffset());
                    sub.setEndOffset(segment.getStartOffset() + sub.getEndOffset());
                    result.add(sub);
                }
            } else {
                segment.setSegmentNumber(segmentNumber++);
                result.add(segment);
            }
        }

        return result;
    }

    /**
     * Create a segment with text and end marker.
     */
    private Segment createSegment(int segmentNumber, String fullText, int startOffset, int endOffset) {
        Segment segment = new Segment();
        segment.setSegmentNumber(segmentNumber);
        segment.setStartOffset(startOffset);
        segment.setEndOffset(endOffset);

        String segmentText = fullText.substring(startOffset, endOffset).trim();
        segment.setText(segmentText);

        // Extract last sentence as end marker for reader reference
        String endMarker = extractLastSentence(segmentText);
        segment.setEndMarker(endMarker);

        return segment;
    }

    /**
     * Find where actual content starts after a break marker.
     */
    private int findNextContentStart(String text, int breakPoint) {
        int i = breakPoint;
        while (i < text.length() && (Character.isWhitespace(text.charAt(i))
                || text.charAt(i) == '*' || text.charAt(i) == '-' || text.charAt(i) == '~')) {
            i++;
        }
        return i;
    }

    /**
     * Extract the last sentence from text as an end marker.
     */
    private String extractLastSentence(String text) {
        if (text == null || text.isBlank()) {
            return "";
        }

        // Find last sentence-ending punctuation
        String trimmed = text.trim();
        int lastPeriod = trimmed.lastIndexOf('.');
        int lastQuestion = trimmed.lastIndexOf('?');
        int lastExclaim = trimmed.lastIndexOf('!');
        int lastQuote = trimmed.lastIndexOf('"');

        // Handle cases like: He said, "Hello."
        int lastEnd = Math.max(Math.max(lastPeriod, lastQuestion), lastExclaim);
        if (lastQuote > lastEnd && lastQuote == trimmed.length() - 1) {
            lastEnd = lastQuote;
        }

        if (lastEnd <= 0) {
            // No sentence ending found, return last 100 chars
            return trimmed.length() > 100 ? "..." + trimmed.substring(trimmed.length() - 100) : trimmed;
        }

        // Find the start of this sentence (previous sentence end + 1)
        int sentenceStart = lastEnd;
        for (int i = lastEnd - 1; i >= 0; i--) {
            char c = trimmed.charAt(i);
            if (c == '.' || c == '?' || c == '!') {
                sentenceStart = i + 1;
                break;
            }
            if (i == 0) {
                sentenceStart = 0;
            }
        }

        String lastSentence = trimmed.substring(sentenceStart, lastEnd + 1).trim();

        // If too long, truncate with ellipsis
        if (lastSentence.length() > 150) {
            lastSentence = "..." + lastSentence.substring(lastSentence.length() - 147);
        }

        return lastSentence;
    }
}
