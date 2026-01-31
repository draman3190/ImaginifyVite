package com.imaginify.service;

import com.imaginify.exception.EpubProcessingException;
import com.imaginify.model.EpubMetadata;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.junit.jupiter.api.Assertions.*;

class EpubParsingServiceTest {

    private EpubParsingService epubParsingService;

    @BeforeEach
    void setUp() {
        epubParsingService = new EpubParsingService();
    }

    @Test
    void parse_validEpub_extractsMetadata() throws Exception {
        byte[] epub = createTestEpub(
                "Test Book Title",
                "Jane Author",
                "en",
                "Test Publisher",
                "2024-01-15",
                "A test description",
                "978-0-123456-78-9",
                "<h1>Chapter One</h1><p>This is the first chapter content.</p>",
                "<h2>Chapter Two</h2><p>This is the second chapter content.</p>"
        );

        EpubMetadata metadata = epubParsingService.parse(epub);

        assertEquals("Test Book Title", metadata.title());
        assertEquals(1, metadata.authors().size());
        assertEquals("Jane Author", metadata.authors().get(0));
        assertEquals("en", metadata.language());
        assertEquals("Test Publisher", metadata.publisher());
        assertEquals("2024-01-15", metadata.publicationDate());
        assertEquals("A test description", metadata.description());
        assertEquals("978-0-123456-78-9", metadata.isbn());
        assertEquals(2, metadata.chapters().size());
        assertEquals("Chapter One", metadata.chapters().get(0).title());
        assertEquals("Chapter Two", metadata.chapters().get(1).title());
        assertEquals(1, metadata.chapters().get(0).chapterNumber());
        assertEquals(2, metadata.chapters().get(1).chapterNumber());
        assertTrue(metadata.chapters().get(0).textLength() > 0);
    }

    @Test
    void parse_noContainerXml_throwsException() throws Exception {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (ZipOutputStream zos = new ZipOutputStream(baos)) {
            addZipEntry(zos, "mimetype", "application/epub+zip");
        }

        assertThrows(EpubProcessingException.class, () -> epubParsingService.parse(baos.toByteArray()));
    }

    @Test
    void parse_missingOpfFile_throwsException() throws Exception {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (ZipOutputStream zos = new ZipOutputStream(baos)) {
            addZipEntry(zos, "mimetype", "application/epub+zip");
            addZipEntry(zos, "META-INF/container.xml", containerXml("OEBPS/content.opf"));
        }

        assertThrows(EpubProcessingException.class, () -> epubParsingService.parse(baos.toByteArray()));
    }

    @Test
    void parse_noChapterContent_returnsEmptyChapters() throws Exception {
        byte[] epub = createTestEpubNoChapters("Empty Book", "Author");

        EpubMetadata metadata = epubParsingService.parse(epub);

        assertEquals("Empty Book", metadata.title());
        assertTrue(metadata.chapters().isEmpty());
    }

    @Test
    void parse_multipleAuthors_extractsAll() throws Exception {
        byte[] epub = createTestEpubMultipleAuthors("Collab Book", "Author One", "Author Two");

        EpubMetadata metadata = epubParsingService.parse(epub);

        assertEquals(2, metadata.authors().size());
        assertEquals("Author One", metadata.authors().get(0));
        assertEquals("Author Two", metadata.authors().get(1));
    }

    @Test
    void extractChapterTitle_withH1_returnsTitle() {
        String html = "<html><body><h1>My Chapter</h1><p>Content here</p></body></html>";
        assertEquals("My Chapter", epubParsingService.extractChapterTitle(html));
    }

    @Test
    void extractChapterTitle_withH2_returnsTitle() {
        String html = "<html><body><h2>Second Level Title</h2><p>Content</p></body></html>";
        assertEquals("Second Level Title", epubParsingService.extractChapterTitle(html));
    }

    @Test
    void extractChapterTitle_noHeading_returnsNull() {
        String html = "<html><body><p>No heading here</p></body></html>";
        assertNull(epubParsingService.extractChapterTitle(html));
    }

    @Test
    void stripHtml_removesAllTags() {
        assertEquals("Hello World", EpubParsingService.stripHtml("<p>Hello <b>World</b></p>"));
    }

    @Test
    void parse_invalidZip_throwsException() {
        byte[] notAZip = "this is not a zip file".getBytes(StandardCharsets.UTF_8);
        assertThrows(EpubProcessingException.class, () -> epubParsingService.parse(notAZip));
    }

    // --- Helper methods to build in-memory EPUB ZIP files ---

    private byte[] createTestEpub(String title, String author, String language,
                                  String publisher, String date, String description,
                                  String isbn, String... chapterHtmlBodies) throws Exception {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (ZipOutputStream zos = new ZipOutputStream(baos)) {
            addZipEntry(zos, "mimetype", "application/epub+zip");
            addZipEntry(zos, "META-INF/container.xml", containerXml("OEBPS/content.opf"));

            StringBuilder manifest = new StringBuilder();
            StringBuilder spine = new StringBuilder();
            for (int i = 0; i < chapterHtmlBodies.length; i++) {
                String id = "chapter" + (i + 1);
                String href = "chapter" + (i + 1) + ".xhtml";
                manifest.append(String.format("    <item id=\"%s\" href=\"%s\" media-type=\"application/xhtml+xml\"/>\n", id, href));
                spine.append(String.format("    <itemref idref=\"%s\"/>\n", id));
                addZipEntry(zos, "OEBPS/" + href, wrapXhtml(chapterHtmlBodies[i]));
            }

            String opf = opfXml(title, author, language, publisher, date, description, isbn,
                    manifest.toString(), spine.toString());
            addZipEntry(zos, "OEBPS/content.opf", opf);
        }
        return baos.toByteArray();
    }

    private byte[] createTestEpubNoChapters(String title, String author) throws Exception {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (ZipOutputStream zos = new ZipOutputStream(baos)) {
            addZipEntry(zos, "mimetype", "application/epub+zip");
            addZipEntry(zos, "META-INF/container.xml", containerXml("OEBPS/content.opf"));
            String opf = opfXml(title, author, "en", null, null, null, null, "", "");
            addZipEntry(zos, "OEBPS/content.opf", opf);
        }
        return baos.toByteArray();
    }

    private byte[] createTestEpubMultipleAuthors(String title, String... authors) throws Exception {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (ZipOutputStream zos = new ZipOutputStream(baos)) {
            addZipEntry(zos, "mimetype", "application/epub+zip");
            addZipEntry(zos, "META-INF/container.xml", containerXml("OEBPS/content.opf"));

            StringBuilder creatorsXml = new StringBuilder();
            for (String a : authors) {
                creatorsXml.append(String.format("    <dc:creator>%s</dc:creator>\n", a));
            }

            String opf = """
                    <?xml version="1.0" encoding="UTF-8"?>
                    <package xmlns="http://www.idpf.org/2007/opf" version="3.0">
                      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
                        <dc:title>%s</dc:title>
                    %s  </metadata>
                      <manifest/>
                      <spine/>
                    </package>
                    """.formatted(title, creatorsXml.toString());
            addZipEntry(zos, "OEBPS/content.opf", opf);
        }
        return baos.toByteArray();
    }

    private void addZipEntry(ZipOutputStream zos, String name, String content) throws Exception {
        zos.putNextEntry(new ZipEntry(name));
        zos.write(content.getBytes(StandardCharsets.UTF_8));
        zos.closeEntry();
    }

    private String containerXml(String opfPath) {
        return """
                <?xml version="1.0" encoding="UTF-8"?>
                <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
                  <rootfiles>
                    <rootfile full-path="%s" media-type="application/oebps-package+xml"/>
                  </rootfiles>
                </container>
                """.formatted(opfPath);
    }

    private String opfXml(String title, String author, String language, String publisher,
                          String date, String description, String isbn,
                          String manifestItems, String spineItems) {
        StringBuilder metadata = new StringBuilder();
        metadata.append(String.format("    <dc:title>%s</dc:title>\n", title));
        metadata.append(String.format("    <dc:creator>%s</dc:creator>\n", author));
        if (language != null) metadata.append(String.format("    <dc:language>%s</dc:language>\n", language));
        if (publisher != null) metadata.append(String.format("    <dc:publisher>%s</dc:publisher>\n", publisher));
        if (date != null) metadata.append(String.format("    <dc:date>%s</dc:date>\n", date));
        if (description != null) metadata.append(String.format("    <dc:description>%s</dc:description>\n", description));
        if (isbn != null) metadata.append(String.format("    <dc:identifier opf:scheme=\"ISBN\">%s</dc:identifier>\n", isbn));

        return """
                <?xml version="1.0" encoding="UTF-8"?>
                <package xmlns="http://www.idpf.org/2007/opf" xmlns:opf="http://www.idpf.org/2007/opf" version="3.0">
                  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
                %s  </metadata>
                  <manifest>
                %s  </manifest>
                  <spine>
                %s  </spine>
                </package>
                """.formatted(metadata.toString(), manifestItems, spineItems);
    }

    private String wrapXhtml(String body) {
        return """
                <?xml version="1.0" encoding="UTF-8"?>
                <html xmlns="http://www.w3.org/1999/xhtml">
                <head><title>Chapter</title></head>
                <body>
                %s
                </body>
                </html>
                """.formatted(body);
    }
}
