package com.imaginify.util;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class SlugUtilsTest {

    @Test
    void slugify_simpleTitle_returnsLowercaseHyphenated() {
        assertEquals("the-shining", SlugUtils.slugify("The Shining"));
    }

    @Test
    void slugify_titleWithSpecialChars_removesSpecialChars() {
        assertEquals("harry-potter-and-the-sorcerers-stone",
                SlugUtils.slugify("Harry Potter & the Sorcerer's Stone"));
    }

    @Test
    void slugify_numberOnlyTitle_returnsNumber() {
        assertEquals("1984", SlugUtils.slugify("1984"));
    }

    @Test
    void slugify_unicodeChars_normalizesToAscii() {
        assertEquals("cafe-resume", SlugUtils.slugify("Café Résumé"));
    }

    @Test
    void slugify_multipleSpaces_collapsesToSingleDash() {
        assertEquals("a-tale-of-two-cities", SlugUtils.slugify("A   Tale   of   Two   Cities"));
    }

    @Test
    void slugify_nullOrBlank_returnsUntitled() {
        assertEquals("untitled", SlugUtils.slugify(null));
        assertEquals("untitled", SlugUtils.slugify(""));
        assertEquals("untitled", SlugUtils.slugify("   "));
    }

    @Test
    void slugify_veryLongTitle_truncates() {
        String longTitle = "This is a very long book title that goes on and on and on and should be truncated to fifty characters or less";
        String slug = SlugUtils.slugify(longTitle);

        assertTrue(slug.length() <= 50);
        assertFalse(slug.endsWith("-")); // Should not end with a dash
    }

    @Test
    void slugify_leadingTrailingSpaces_trimmed() {
        assertEquals("trimmed-title", SlugUtils.slugify("  Trimmed Title  "));
    }

    @Test
    void slugify_atSymbol_convertedToAt() {
        assertEquals("meet-at-noon", SlugUtils.slugify("Meet @ Noon"));
    }
}
