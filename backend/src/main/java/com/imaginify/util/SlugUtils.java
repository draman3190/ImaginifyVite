package com.imaginify.util;

import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Utility for generating URL-friendly slugs from text.
 */
public final class SlugUtils {

    private static final Pattern NON_LATIN = Pattern.compile("[^\\w-]");
    private static final Pattern WHITESPACE = Pattern.compile("[\\s]+");
    private static final Pattern MULTIPLE_DASHES = Pattern.compile("-{2,}");

    private SlugUtils() {
        // Utility class
    }

    /**
     * Generate a URL-friendly slug from the given text.
     *
     * Examples:
     * - "The Shining" -> "the-shining"
     * - "Harry Potter & the Sorcerer's Stone" -> "harry-potter-the-sorcerers-stone"
     * - "1984" -> "1984"
     *
     * @param text the text to slugify
     * @return a lowercase, hyphen-separated slug
     */
    public static String slugify(String text) {
        if (text == null || text.isBlank()) {
            return "untitled";
        }

        String slug = text;

        // Normalize unicode characters (e.g., é -> e)
        slug = Normalizer.normalize(slug, Normalizer.Form.NFD);
        slug = slug.replaceAll("\\p{InCombiningDiacriticalMarks}+", "");

        // Convert to lowercase
        slug = slug.toLowerCase(Locale.ENGLISH);

        // Replace common symbols with words or remove them
        slug = slug.replace("&", "and");
        slug = slug.replace("@", "at");

        // Replace whitespace with dashes
        slug = WHITESPACE.matcher(slug).replaceAll("-");

        // Remove non-latin characters (keep alphanumeric and dashes)
        slug = NON_LATIN.matcher(slug).replaceAll("");

        // Collapse multiple dashes into one
        slug = MULTIPLE_DASHES.matcher(slug).replaceAll("-");

        // Trim leading/trailing dashes
        slug = slug.replaceAll("^-+|-+$", "");

        // Limit length
        if (slug.length() > 50) {
            slug = slug.substring(0, 50);
            // Don't cut off in the middle of a word
            int lastDash = slug.lastIndexOf('-');
            if (lastDash > 30) {
                slug = slug.substring(0, lastDash);
            }
        }

        return slug.isEmpty() ? "untitled" : slug;
    }
}
