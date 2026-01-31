package com.imaginify.service;

import com.imaginify.exception.EpubProcessingException;
import com.imaginify.model.EpubChapter;
import com.imaginify.model.EpubMetadata;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.StringReader;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@Service
public class EpubParsingService {

    private static final Logger log = LoggerFactory.getLogger(EpubParsingService.class);
    private static final Pattern HTML_TAG_PATTERN = Pattern.compile("<[^>]+>");
    private static final Pattern HEADING_PATTERN = Pattern.compile(
            "<(h[1-3])[^>]*>(.*?)</\\1>", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    private static final Pattern TITLE_PATTERN = Pattern.compile(
            "<title[^>]*>(.*?)</title>", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);

    public EpubMetadata parse(byte[] epubBytes) {
        try {
            Map<String, byte[]> entries = readZipEntries(epubBytes);
            String opfPath = findOpfPath(entries);
            byte[] opfBytes = entries.get(opfPath);
            if (opfBytes == null) {
                throw new EpubProcessingException("OPF file not found at path: " + opfPath);
            }

            String opfDir = opfPath.contains("/") ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : "";
            Document opfDoc = parseXml(opfBytes);

            String title = getDcElement(opfDoc, "title");
            List<String> authors = getDcElements(opfDoc, "creator");
            String language = getDcElement(opfDoc, "language");
            String publisher = getDcElement(opfDoc, "publisher");
            String publicationDate = getDcElement(opfDoc, "date");
            String description = getDcElement(opfDoc, "description");
            String isbn = extractIsbn(opfDoc);

            List<EpubChapter> chapters = parseChapters(opfDoc, opfDir, entries);

            log.info("Parsed EPUB: title={}, authors={}, chapters={}", title, authors, chapters.size());
            return new EpubMetadata(title, authors, language, publisher, publicationDate, description, isbn, chapters);
        } catch (EpubProcessingException e) {
            throw e;
        } catch (Exception e) {
            throw new EpubProcessingException("Failed to parse EPUB file", e);
        }
    }

    private Map<String, byte[]> readZipEntries(byte[] zipBytes) {
        Map<String, byte[]> entries = new HashMap<>();
        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(zipBytes))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                if (!entry.isDirectory()) {
                    ByteArrayOutputStream baos = new ByteArrayOutputStream();
                    byte[] buffer = new byte[4096];
                    int bytesRead;
                    while ((bytesRead = zis.read(buffer)) != -1) {
                        baos.write(buffer, 0, bytesRead);
                    }
                    entries.put(entry.getName(), baos.toByteArray());
                }
                zis.closeEntry();
            }
        } catch (Exception e) {
            throw new EpubProcessingException("Failed to read EPUB ZIP entries", e);
        }
        return entries;
    }

    private String findOpfPath(Map<String, byte[]> entries) {
        byte[] containerBytes = entries.get("META-INF/container.xml");
        if (containerBytes == null) {
            throw new EpubProcessingException("META-INF/container.xml not found in EPUB");
        }

        Document containerDoc = parseXml(containerBytes);
        NodeList rootfiles = containerDoc.getElementsByTagName("rootfile");
        if (rootfiles.getLength() == 0) {
            throw new EpubProcessingException("No rootfile element found in container.xml");
        }

        String fullPath = ((Element) rootfiles.item(0)).getAttribute("full-path");
        if (fullPath == null || fullPath.isBlank()) {
            throw new EpubProcessingException("rootfile full-path attribute is missing");
        }
        return fullPath;
    }

    private List<EpubChapter> parseChapters(Document opfDoc, String opfDir, Map<String, byte[]> entries) {
        // Build manifest id->href map
        Map<String, String> manifestItems = new LinkedHashMap<>();
        NodeList items = opfDoc.getElementsByTagName("item");
        for (int i = 0; i < items.getLength(); i++) {
            Element item = (Element) items.item(i);
            manifestItems.put(item.getAttribute("id"), item.getAttribute("href"));
        }

        // Read spine order
        List<String> spineItemRefs = new ArrayList<>();
        NodeList itemRefs = opfDoc.getElementsByTagName("itemref");
        for (int i = 0; i < itemRefs.getLength(); i++) {
            Element itemRef = (Element) itemRefs.item(i);
            spineItemRefs.add(itemRef.getAttribute("idref"));
        }

        List<EpubChapter> chapters = new ArrayList<>();
        int chapterNumber = 1;
        for (String idref : spineItemRefs) {
            String href = manifestItems.get(idref);
            if (href == null) continue;

            String fullHref = opfDir + href;
            byte[] content = entries.get(fullHref);
            if (content == null) continue;

            String textContent = stripHtml(new String(content));
            if (textContent.isBlank()) continue;

            String chapterTitle = extractChapterTitle(new String(content));
            if (chapterTitle == null) {
                chapterTitle = "Chapter " + chapterNumber;
            }

            chapters.add(new EpubChapter(chapterNumber, chapterTitle, textContent.length()));
            chapterNumber++;
        }
        return chapters;
    }

    String extractChapterTitle(String htmlContent) {
        Matcher headingMatcher = HEADING_PATTERN.matcher(htmlContent);
        if (headingMatcher.find()) {
            String title = stripHtml(headingMatcher.group(2)).trim();
            if (!title.isBlank()) {
                return title;
            }
        }
        Matcher titleMatcher = TITLE_PATTERN.matcher(htmlContent);
        if (titleMatcher.find()) {
            String title = stripHtml(titleMatcher.group(1)).trim();
            if (!title.isBlank()) {
                return title;
            }
        }
        return null;
    }

    private String extractIsbn(Document opfDoc) {
        NodeList identifiers = opfDoc.getElementsByTagNameNS("http://purl.org/dc/elements/1.1/", "identifier");
        if (identifiers.getLength() == 0) {
            identifiers = opfDoc.getElementsByTagName("dc:identifier");
        }
        for (int i = 0; i < identifiers.getLength(); i++) {
            Element el = (Element) identifiers.item(i);
            String scheme = el.getAttribute("opf:scheme");
            String content = el.getTextContent().trim();
            if ("ISBN".equalsIgnoreCase(scheme) || content.startsWith("urn:isbn:") || content.matches("^(97[89])?\\d{9}[\\dXx]$")) {
                return content.startsWith("urn:isbn:") ? content.substring(9) : content;
            }
        }
        return null;
    }

    private String getDcElement(Document doc, String localName) {
        NodeList nodes = doc.getElementsByTagNameNS("http://purl.org/dc/elements/1.1/", localName);
        if (nodes.getLength() == 0) {
            nodes = doc.getElementsByTagName("dc:" + localName);
        }
        if (nodes.getLength() > 0) {
            String value = nodes.item(0).getTextContent().trim();
            return value.isEmpty() ? null : value;
        }
        return null;
    }

    private List<String> getDcElements(Document doc, String localName) {
        NodeList nodes = doc.getElementsByTagNameNS("http://purl.org/dc/elements/1.1/", localName);
        if (nodes.getLength() == 0) {
            nodes = doc.getElementsByTagName("dc:" + localName);
        }
        List<String> values = new ArrayList<>();
        for (int i = 0; i < nodes.getLength(); i++) {
            String value = nodes.item(i).getTextContent().trim();
            if (!value.isEmpty()) {
                values.add(value);
            }
        }
        return values;
    }

    private Document parseXml(byte[] xmlBytes) {
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            // XXE prevention
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
            factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            DocumentBuilder builder = factory.newDocumentBuilder();
            // Suppress error output for malformed XML
            builder.setErrorHandler(null);
            return builder.parse(new ByteArrayInputStream(xmlBytes));
        } catch (Exception e) {
            throw new EpubProcessingException("Failed to parse XML content", e);
        }
    }

    static String stripHtml(String html) {
        return HTML_TAG_PATTERN.matcher(html).replaceAll("").trim();
    }
}
