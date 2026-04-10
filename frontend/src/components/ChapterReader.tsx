import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { fetchBookDetail, fetchChapterContent } from '../api/readerApi';
import type { BookDetail, ChapterContent, ChapterSummary, ChapterImage } from '../types/book';

interface ChapterReaderProps {
  bookId: string;
  initialChapter: number;
  onBack: () => void;
}

// Fullscreen API helpers
function requestFullscreen(element: HTMLElement) {
  if (element.requestFullscreen) {
    element.requestFullscreen();
  } else if ((element as any).webkitRequestFullscreen) {
    (element as any).webkitRequestFullscreen();
  } else if ((element as any).msRequestFullscreen) {
    (element as any).msRequestFullscreen();
  }
}

function exitFullscreen() {
  if (document.exitFullscreen) {
    document.exitFullscreen();
  } else if ((document as any).webkitExitFullscreen) {
    (document as any).webkitExitFullscreen();
  } else if ((document as any).msExitFullscreen) {
    (document as any).msExitFullscreen();
  }
}

function isFullscreenActive(): boolean {
  return !!(
    document.fullscreenElement ||
    (document as any).webkitFullscreenElement ||
    (document as any).msFullscreenElement
  );
}

const WORDS_PER_PAGE = 300;

function splitIntoPages(text: string): string[] {
  const paragraphs = text.split(/\n\n+/);
  const pages: string[] = [];
  let currentPage = '';
  let currentWordCount = 0;

  for (const paragraph of paragraphs) {
    const paragraphWords = paragraph.trim().split(/\s+/).filter(Boolean);
    const paragraphWordCount = paragraphWords.length;

    if (currentWordCount + paragraphWordCount <= WORDS_PER_PAGE) {
      currentPage += (currentPage ? '\n\n' : '') + paragraph.trim();
      currentWordCount += paragraphWordCount;
    } else if (currentWordCount === 0) {
      const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
      for (const sentence of sentences) {
        const sentenceWords = sentence.trim().split(/\s+/).filter(Boolean);
        const sentenceWordCount = sentenceWords.length;

        if (currentWordCount + sentenceWordCount <= WORDS_PER_PAGE) {
          currentPage += (currentPage ? ' ' : '') + sentence.trim();
          currentWordCount += sentenceWordCount;
        } else {
          if (currentPage) {
            pages.push(currentPage);
          }
          currentPage = sentence.trim();
          currentWordCount = sentenceWordCount;
        }
      }
    } else {
      pages.push(currentPage);
      currentPage = paragraph.trim();
      currentWordCount = paragraphWordCount;
    }
  }

  if (currentPage) {
    pages.push(currentPage);
  }

  return pages.length > 0 ? pages : [''];
}

// Dictionary types
interface DictionaryDefinition {
  definition: string;
  example?: string;
}

interface DictionaryMeaning {
  partOfSpeech: string;
  definitions: DictionaryDefinition[];
}

interface DictionaryEntry {
  word: string;
  phonetic?: string;
  meanings: DictionaryMeaning[];
}

interface DictionaryPopupState {
  word: string;
  x: number;
  y: number;
  loading: boolean;
  error: string | null;
  entry: DictionaryEntry | null;
}

// Highlight types
interface TextHighlight {
  id: string;
  bookId: string;
  chapterNumber: number;
  pageIndex: number;
  text: string;
  startOffset: number;
  endOffset: number;
  color: string;
  borderColor: string;
  note?: string;
  createdAt: string;
}

interface SelectionToolbarState {
  x: number;
  y: number;
  text: string;
  startOffset: number;
  endOffset: number;
}

// Note editor state for adding/editing notes on highlights
interface NoteEditorState {
  highlightId: string;
  x: number;
  y: number;
  note: string;
  isNew: boolean; // true when adding note during highlight creation
}

// Soothing highlight colors that blend with the dark theme
const HIGHLIGHT_COLORS = [
  { name: 'Lavender', color: 'rgba(167, 139, 250, 0.35)', border: 'rgba(167, 139, 250, 0.5)' },  // Soft purple
  { name: 'Sage', color: 'rgba(134, 239, 172, 0.30)', border: 'rgba(134, 239, 172, 0.45)' },     // Soft green
  { name: 'Rose', color: 'rgba(251, 182, 206, 0.32)', border: 'rgba(251, 182, 206, 0.48)' },     // Soft pink
  { name: 'Sky', color: 'rgba(125, 211, 252, 0.30)', border: 'rgba(125, 211, 252, 0.45)' },      // Soft blue
  { name: 'Amber', color: 'rgba(252, 211, 77, 0.28)', border: 'rgba(252, 211, 77, 0.42)' },      // Soft yellow
];

// localStorage helpers for highlights
function getStoredHighlights(bookId: string): TextHighlight[] {
  try {
    const data = localStorage.getItem(`imaginify-highlights-${bookId}`);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveHighlights(bookId: string, highlights: TextHighlight[]) {
  try {
    localStorage.setItem(`imaginify-highlights-${bookId}`, JSON.stringify(highlights));
  } catch {
    // Ignore storage errors
  }
}

// Render text with highlight markers (for DOM lookup, overlays rendered separately)
function renderTextWithHighlights(
  text: string,
  highlights: TextHighlight[],
  chapterNumber: number,
  pageIndex: number
): React.ReactNode {
  // Filter highlights for this chapter and page
  const pageHighlights = highlights.filter(
    h => h.chapterNumber === chapterNumber && h.pageIndex === pageIndex
  ).sort((a, b) => a.startOffset - b.startOffset);

  if (pageHighlights.length === 0) {
    return text;
  }

  const result: React.ReactNode[] = [];
  let lastEnd = 0;

  pageHighlights.forEach((highlight, index) => {
    // Add text before this highlight
    if (highlight.startOffset > lastEnd) {
      result.push(text.slice(lastEnd, highlight.startOffset));
    }

    // Add marked span for highlight (overlay renders the visual bubble)
    result.push(
      <span
        key={`highlight-${index}`}
        data-highlight-id={highlight.id}
        className="highlight-marker"
      >
        {text.slice(highlight.startOffset, highlight.endOffset)}
      </span>
    );

    lastEnd = highlight.endOffset;
  });

  // Add remaining text
  if (lastEnd < text.length) {
    result.push(text.slice(lastEnd));
  }

  return result;
}

export function ChapterReader({ bookId, initialChapter, onBack }: ChapterReaderProps) {
  const [book, setBook] = useState<BookDetail | null>(null);
  const [chapter, setChapter] = useState<ChapterContent | null>(null);
  const [currentChapter, setCurrentChapter] = useState(initialChapter);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState('Loading chapter...');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showChapterDropdown, setShowChapterDropdown] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Dictionary popup state
  const [dictionaryPopup, setDictionaryPopup] = useState<DictionaryPopupState | null>(null);

  // Persistent text highlights
  const [highlights, setHighlights] = useState<TextHighlight[]>([]);

  // Selection toolbar state (appears when text is selected)
  const [selectionToolbar, setSelectionToolbar] = useState<SelectionToolbarState | null>(null);

  // Selection highlight bubble state - array for multi-line selections
  const [selectionBubbles, setSelectionBubbles] = useState<Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>>([]);

  // Persistent highlight bubble state - rendered as overlays like selection bubbles
  const [highlightBubbles, setHighlightBubbles] = useState<Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
    borderColor: string;
    hasNote: boolean;
    note?: string;
    highlightText?: string;
    isLast: boolean; // true for last bubble of each highlight
  }>>([]);

  // Track which highlight is being hovered (for showing icon)
  const [hoveredHighlightId, setHoveredHighlightId] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable hover handlers to prevent flickering between multi-line highlight bubbles
  const handleHighlightMouseEnter = useCallback((highlightId: string) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHoveredHighlightId(highlightId);
  }, []);

  const handleHighlightMouseLeave = useCallback(() => {
    // Small delay before removing hover state to handle gaps between bubbles
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredHighlightId(null);
    }, 100);
  }, []);

  // Highlight toolbar state - appears when clicking on a highlight
  const [highlightToolbar, setHighlightToolbar] = useState<{
    highlightId: string;
    x: number;
    y: number;
    color: string;
    borderColor: string;
    hasNote: boolean;
    note?: string;
    highlightText: string;
  } | null>(null);

  // Note editor state for adding/editing notes on highlights
  const [noteEditor, setNoteEditor] = useState<NoteEditorState | null>(null);

  // Track if selection is in progress (purple) vs completed (yellow)
  const [isSelecting, setIsSelecting] = useState(false);

  // Fullscreen UI auto-hide state
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const CONTROLS_HIDE_DELAY = 2000; // 2 seconds of idle before hiding

  // Container ref for fullscreen
  const containerRef = useRef<HTMLDivElement>(null);
  const readingAreaRef = useRef<HTMLDivElement>(null);

  // Ref for selection timeout to persist across re-renders
  const selectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ref for detecting double-clicks to skip purple "selecting" state
  const lastMouseDownTimeRef = useRef<number>(0);

  // Ref to track selection text on mousedown (to detect dismiss clicks vs new selections)
  const selectionOnMouseDownRef = useRef<string>('');

  // Ref to track mouse position on mousedown (to detect drag vs click)
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);

  // Prevent duplicate chapter loads
  const loadingChapterRef = useRef<number | null>(null);

  // Prefetch cache for next/previous chapters
  const prefetchCacheRef = useRef<Map<number, ChapterContent>>(new Map());

  const pages = useMemo(() => {
    if (!chapter?.content) return [''];
    return splitIntoPages(chapter.content);
  }, [chapter?.content]);

  const totalPages = pages.length;

  // Calculate actual progress
  const actualProgress = chapter
    ? ((currentChapter - 1) / chapter.totalChapters) * 100 +
      ((currentPage + 1) / totalPages / chapter.totalChapters) * 100
    : 0;

  const loadBook = useCallback(async () => {
    try {
      const bookData = await fetchBookDetail(bookId);
      setBook(bookData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load book');
    }
  }, [bookId]);

  // Load highlights from localStorage when book changes
  useEffect(() => {
    setHighlights(getStoredHighlights(bookId));
  }, [bookId]);

  // Calculate highlight bubbles from DOM markers
  useEffect(() => {
    const calculateHighlightBubbles = () => {
      const readingArea = readingAreaRef.current;
      if (!readingArea) return;

      const markers = readingArea.querySelectorAll('.highlight-marker');
      const tempBubbles: Array<{
        id: string;
        x: number;
        y: number;
        width: number;
        height: number;
        color: string;
        borderColor: string;
        hasNote: boolean;
        note?: string;
        highlightText?: string;
      }> = [];

      const containerRect = readingArea.getBoundingClientRect();

      markers.forEach((marker) => {
        const highlightId = marker.getAttribute('data-highlight-id');
        if (!highlightId) return;

        const highlight = highlights.find(h => h.id === highlightId);
        if (!highlight) return;

        const range = document.createRange();
        range.selectNodeContents(marker);
        const rects = range.getClientRects();

        for (let i = 0; i < rects.length; i++) {
          const rect = rects[i];
          // Filter out whitespace/newline artifacts at line breaks
          // These are typically < 15px wide and appear at line endings
          if (rect.width > 15 && rect.height > 0) {
            tempBubbles.push({
              id: highlightId,
              x: rect.left - containerRect.left + readingArea.scrollLeft,
              y: rect.top - containerRect.top + readingArea.scrollTop,
              width: rect.width,
              height: rect.height,
              color: highlight.color,
              borderColor: highlight.borderColor || highlight.color,
              hasNote: !!highlight.note,
              note: highlight.note,
              highlightText: highlight.text,
            });
          }
        }
      });

      // Mark the last bubble for each highlight ID
      const bubbles = tempBubbles.map((bubble, index) => {
        const isLastForId = tempBubbles.findIndex((b, i) => i > index && b.id === bubble.id) === -1;
        return { ...bubble, isLast: isLastForId };
      });

      setHighlightBubbles(bubbles);
    };

    // Calculate after render
    const timeoutId = setTimeout(calculateHighlightBubbles, 50);
    return () => clearTimeout(timeoutId);
  }, [highlights, currentPage, currentChapter, chapter]);

  // Apply a highlight to the selected text
  const applyHighlight = useCallback((colorIndex: number) => {
    if (!selectionToolbar) return;

    const colorConfig = HIGHLIGHT_COLORS[colorIndex];

    // Trim trailing whitespace from the selection
    const originalText = selectionToolbar.text;
    const trimmedText = originalText.trimEnd();
    const trimmedLength = originalText.length - trimmedText.length;
    const adjustedEndOffset = selectionToolbar.endOffset - trimmedLength;

    // Don't create highlight if trimmed text is empty
    if (!trimmedText) return;

    const newHighlight: TextHighlight = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      bookId,
      chapterNumber: currentChapter,
      pageIndex: currentPage,
      text: trimmedText,
      startOffset: selectionToolbar.startOffset,
      endOffset: adjustedEndOffset,
      color: colorConfig.color,
      borderColor: colorConfig.border,
      createdAt: new Date().toISOString(),
    };

    const updatedHighlights = [...highlights, newHighlight];
    setHighlights(updatedHighlights);
    saveHighlights(bookId, updatedHighlights);

    // Clear selection and toolbar
    setSelectionToolbar(null);
    setSelectionBubbles([]);
    window.getSelection()?.removeAllRanges();
  }, [selectionToolbar, bookId, currentChapter, currentPage, highlights]);

  // Remove a highlight
  const removeHighlight = useCallback((highlightId: string) => {
    const updatedHighlights = highlights.filter(h => h.id !== highlightId);
    setHighlights(updatedHighlights);
    saveHighlights(bookId, updatedHighlights);
  }, [highlights, bookId]);

  // Close selection toolbar
  const closeSelectionToolbar = useCallback(() => {
    setSelectionToolbar(null);
    setSelectionBubbles([]);
    window.getSelection()?.removeAllRanges();
  }, []);

  // Save note to an existing highlight
  const saveNoteToHighlight = useCallback((highlightId: string, note: string) => {
    const updatedHighlights = highlights.map(h =>
      h.id === highlightId ? { ...h, note: note.trim() || undefined } : h
    );
    setHighlights(updatedHighlights);
    saveHighlights(bookId, updatedHighlights);
    setNoteEditor(null);
    setHighlightToolbar(null);
  }, [highlights, bookId]);

  // Open highlight toolbar when clicking on a highlight
  const openHighlightToolbar = useCallback((
    highlightId: string,
    x: number,
    y: number,
    color: string,
    borderColor: string,
    hasNote: boolean,
    note: string | undefined,
    highlightText: string
  ) => {
    setHighlightToolbar({
      highlightId,
      x,
      y,
      color,
      borderColor,
      hasNote,
      note,
      highlightText,
    });
  }, []);

  // Close highlight toolbar
  const closeHighlightToolbar = useCallback(() => {
    setHighlightToolbar(null);
  }, []);

  // Change highlight color
  const changeHighlightColor = useCallback((highlightId: string, colorIndex: number) => {
    const colorConfig = HIGHLIGHT_COLORS[colorIndex];
    const updatedHighlights = highlights.map(h =>
      h.id === highlightId
        ? { ...h, color: colorConfig.color, borderColor: colorConfig.border }
        : h
    );
    setHighlights(updatedHighlights);
    saveHighlights(bookId, updatedHighlights);
    setHighlightToolbar(null);
  }, [highlights, bookId]);

  // Open note editor from highlight toolbar
  const openNoteEditorFromToolbar = useCallback(() => {
    if (!highlightToolbar) return;
    setNoteEditor({
      highlightId: highlightToolbar.highlightId,
      x: highlightToolbar.x,
      y: highlightToolbar.y,
      note: highlightToolbar.note || '',
      isNew: !highlightToolbar.hasNote,
    });
    setHighlightToolbar(null);
  }, [highlightToolbar]);

  // Close note editor
  const closeNoteEditor = useCallback(() => {
    setNoteEditor(null);
  }, []);

  // Close highlight toolbar and note editor when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Check if click is outside highlight toolbar
      if (highlightToolbar && !target.closest('.highlight-toolbar')) {
        setHighlightToolbar(null);
      }

      // Check if click is outside note editor
      if (noteEditor && !target.closest('.note-editor')) {
        setNoteEditor(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [highlightToolbar, noteEditor]);

  // Preload images with progress tracking
  const preloadImagesWithProgress = useCallback(
    (images: ChapterImage[], onProgress?: (loaded: number, total: number) => void): Promise<void> => {
      if (!images || images.length === 0) return Promise.resolve();

      let loaded = 0;
      const total = images.length;

      return Promise.all(
        images.map(
          (img) =>
            new Promise<void>((resolve) => {
              const image = new Image();
              image.onload = () => {
                loaded++;
                onProgress?.(loaded, total);
                resolve();
              };
              image.onerror = () => {
                loaded++;
                onProgress?.(loaded, total);
                resolve(); // Don't block on failed images
              };
              image.src = img.url;
            })
        )
      ).then(() => {});
    },
    []
  );

  // Simple preload for prefetching (no progress tracking)
  const preloadImages = useCallback((images: ChapterImage[]): Promise<void> => {
    return preloadImagesWithProgress(images);
  }, [preloadImagesWithProgress]);

  const loadChapter = useCallback(
    async (chapterNum: number) => {
      if (loadingChapterRef.current === chapterNum) return;

      // Check prefetch cache first (images already preloaded)
      const cached = prefetchCacheRef.current.get(chapterNum);
      if (cached) {
        prefetchCacheRef.current.delete(chapterNum);
        setChapter(cached);
        setCurrentChapter(chapterNum);
        setCurrentPage(0);
        window.history.replaceState({}, '', `/reader/${bookId}/${chapterNum}`);
        return;
      }

      loadingChapterRef.current = chapterNum;

      try {
        setLoading(true);
        setLoadingStatus('Loading chapter...');
        setLoadingProgress(0);
        setError(null);

        const chapterData = await fetchChapterContent(bookId, chapterNum);
        setLoadingProgress(30); // Chapter text loaded

        // Preload images before showing content
        if (chapterData.images && chapterData.images.length > 0) {
          setLoadingStatus('Loading illustrations...');
          await preloadImagesWithProgress(chapterData.images, (loaded, total) => {
            // Progress from 30% to 100%
            const imageProgress = (loaded / total) * 70;
            setLoadingProgress(30 + imageProgress);
          });
        } else {
          setLoadingProgress(100);
        }

        if (loadingChapterRef.current === chapterNum) {
          setChapter(chapterData);
          setCurrentChapter(chapterNum);
          setCurrentPage(0);
          window.history.replaceState({}, '', `/reader/${bookId}/${chapterNum}`);
        }
      } catch (err) {
        if (loadingChapterRef.current === chapterNum) {
          setError(err instanceof Error ? err.message : 'Failed to load chapter');
        }
      } finally {
        if (loadingChapterRef.current === chapterNum) {
          setLoading(false);
          loadingChapterRef.current = null;
        }
      }
    },
    [bookId, preloadImages]
  );

  // Prefetch adjacent chapters when near page boundaries
  useEffect(() => {
    if (!chapter) return;

    const prefetch = async (chapterNum: number) => {
      if (prefetchCacheRef.current.has(chapterNum)) return;
      try {
        const data = await fetchChapterContent(bookId, chapterNum);
        // Preload images before caching
        if (data.images && data.images.length > 0) {
          await preloadImages(data.images);
        }
        prefetchCacheRef.current.set(chapterNum, data);
      } catch {
        // Ignore prefetch errors
      }
    };

    // Prefetch next chapter when on last 3 pages
    if (chapter.hasNext && currentPage >= totalPages - 3) {
      prefetch(currentChapter + 1);
    }

    // Prefetch previous chapter when on first 3 pages
    if (chapter.hasPrevious && currentPage <= 2) {
      prefetch(currentChapter - 1);
    }
  }, [currentPage, totalPages, chapter, currentChapter, bookId, preloadImages]);

  useEffect(() => {
    loadBook();
    loadChapter(initialChapter);
  }, [loadBook, loadChapter, initialChapter]);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;

    if (isFullscreenActive()) {
      exitFullscreen();
    } else {
      requestFullscreen(containerRef.current);
    }
  }, []);

  // Listen for fullscreen changes (including ESC key exit)
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isNowFullscreen = isFullscreenActive();
      setIsFullscreen(isNowFullscreen);
      // Reset controls visibility when entering/exiting fullscreen
      setShowControls(true);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
        controlsTimeoutRef.current = null;
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('msfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('msfullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Auto-hide controls in fullscreen mode after idle
  useEffect(() => {
    if (!isFullscreen) return;

    const handleMouseMove = () => {
      // Show controls on mouse movement
      setShowControls(true);

      // Clear existing timeout
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }

      // Start new timeout to hide controls
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, CONTROLS_HIDE_DELAY);
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('mousemove', handleMouseMove);

      // Start initial hide timer
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, CONTROLS_HIDE_DELAY);
    }

    return () => {
      if (container) {
        container.removeEventListener('mousemove', handleMouseMove);
      }
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [isFullscreen]);

  // Dictionary lookup function
  const lookupWord = useCallback(async (word: string, x: number, y: number) => {
    // Clean the word - remove punctuation and normalize
    const cleanWord = word.toLowerCase().replace(/[^a-z'-]/g, '').trim();
    if (!cleanWord || cleanWord.length < 2) return;

    // Convert viewport coordinates to container-relative coordinates
    const readingArea = readingAreaRef.current;
    let relativeX = x;
    let relativeY = y;
    if (readingArea) {
      const containerRect = readingArea.getBoundingClientRect();
      relativeX = x - containerRect.left + readingArea.scrollLeft;
      relativeY = y - containerRect.top + readingArea.scrollTop;
    }

    setDictionaryPopup({
      word: cleanWord,
      x: relativeX,
      y: relativeY,
      loading: true,
      error: null,
      entry: null,
    });

    try {
      const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${cleanWord}`);
      if (!response.ok) {
        throw new Error('Word not found');
      }
      const data = await response.json();
      if (data && data.length > 0) {
        setDictionaryPopup(prev => prev ? {
          ...prev,
          loading: false,
          entry: {
            word: data[0].word,
            phonetic: data[0].phonetic || data[0].phonetics?.find((p: any) => p.text)?.text,
            meanings: data[0].meanings.slice(0, 3), // Limit to 3 meanings
          },
        } : null);
      }
    } catch {
      setDictionaryPopup(prev => prev ? {
        ...prev,
        loading: false,
        error: 'Definition not found',
      } : null);
    }
  }, []);

  // Clear selection bubbles when popup closes
  const closeDictionaryPopup = useCallback(() => {
    setDictionaryPopup(null);
    setSelectionBubbles([]);
    window.getSelection()?.removeAllRanges();
  }, []);

  // Handle text selection for dictionary lookup
  useEffect(() => {
    const validateAndShowPopup = () => {
      const selection = window.getSelection();
      const selectedText = selection?.toString().trim();

      if (!selectedText) return;

      // Validate it's a single complete word
      const isValidWord = /^[a-zA-Z][a-zA-Z'-]*[a-zA-Z]$|^[a-zA-Z]{2}$/.test(selectedText);
      if (!isValidWord) return;

      const range = selection?.getRangeAt(0);
      if (range) {
        // Check for partial word selection
        const startContainer = range.startContainer;
        if (startContainer.nodeType === Node.TEXT_NODE) {
          const textContent = startContainer.textContent || '';
          const startOffset = range.startOffset;
          if (startOffset > 0 && /[a-zA-Z]/.test(textContent[startOffset - 1])) {
            return;
          }
        }

        const endContainer = range.endContainer;
        if (endContainer.nodeType === Node.TEXT_NODE) {
          const textContent = endContainer.textContent || '';
          const endOffset = range.endOffset;
          if (endOffset < textContent.length && /[a-zA-Z]/.test(textContent[endOffset])) {
            return;
          }
        }

        const rect = range.getBoundingClientRect();
        lookupWord(selectedText, rect.left + rect.width / 2, rect.top - 10);
      }
    };

    const updateBubbles = () => {
      const selection = window.getSelection();
      const selectedText = selection?.toString();
      const readingArea = readingAreaRef.current;

      if (selectedText && selection?.rangeCount && readingArea) {
        const range = selection.getRangeAt(0);
        const rects = range.getClientRects();
        const containerRect = readingArea.getBoundingClientRect();
        const bubbles: Array<{ x: number; y: number; width: number; height: number }> = [];

        for (let i = 0; i < rects.length; i++) {
          const rect = rects[i];
          // Filter out whitespace/newline artifacts at line breaks
          // These are typically < 15px wide and appear at line endings
          if (rect.width > 15 && rect.height > 0) {
            // Convert viewport coordinates to container-relative coordinates
            bubbles.push({
              x: rect.left - containerRect.left + readingArea.scrollLeft,
              y: rect.top - containerRect.top + readingArea.scrollTop,
              width: rect.width,
              height: rect.height,
            });
          }
        }
        setSelectionBubbles(bubbles);
      } else {
        setSelectionBubbles([]);
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      const now = Date.now();
      const timeSinceLastClick = now - lastMouseDownTimeRef.current;
      lastMouseDownTimeRef.current = now;

      // Track mouse position to detect drag vs click
      mouseDownPosRef.current = { x: e.clientX, y: e.clientY };

      // Close dictionary popup when clicking outside of it
      if (!(e.target as HTMLElement).closest('.dictionary-popup')) {
        setDictionaryPopup(null);
      }

      // Close selection toolbar when clicking outside of it
      if (!(e.target as HTMLElement).closest('.selection-toolbar')) {
        setSelectionToolbar(null);
      }

      // Track current selection to detect dismiss clicks vs new selections
      selectionOnMouseDownRef.current = window.getSelection()?.toString().trim() || '';

      // Skip purple "selecting" state for:
      // - Double-clicks (selection is instant)
      // - Triple-clicks (expanding existing selection - check if selection exists)
      if (timeSinceLastClick < 300) {
        return;
      }

      // If there's already a selection, this might be a triple-click to expand
      // Don't show purple in this case
      const existingSelection = window.getSelection()?.toString().trim();
      if (existingSelection) {
        return;
      }

      setIsSelecting(true);
    };

    const handleMouseUp = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.dictionary-popup')) return;
      if ((e.target as HTMLElement).closest('.selection-toolbar')) return;

      setIsSelecting(false);

      if (selectionTimeoutRef.current) {
        clearTimeout(selectionTimeoutRef.current);
      }

      const selection = window.getSelection();
      const selectedText = selection?.toString().trim();

      if (!selectedText) {
        setSelectionBubbles([]);
        setSelectionToolbar(null);
        setDictionaryPopup(null);
        return;
      }

      updateBubbles();

      // Check if mouse moved (drag selection vs click selection)
      const mouseDownPos = mouseDownPosRef.current;
      const mouseMoved = mouseDownPos
        ? Math.abs(e.clientX - mouseDownPos.x) > 5 || Math.abs(e.clientY - mouseDownPos.y) > 5
        : false;

      // Check if this is a dismiss click (selection unchanged from mousedown)
      const isDismissClick = selectedText === selectionOnMouseDownRef.current;

      // Show selection toolbar for:
      // - Any drag selection (mouse moved during selection)
      // - Triple-click selections (paragraph) - mouse didn't move but selection changed
      // Do NOT show for:
      // - Double-click selections (dictionary handles those - mouse didn't move, selection is single word)
      // - Dismiss clicks (clicking without changing selection)
      const isClickSelection = !mouseMoved && !isDismissClick;
      const isSingleWord = !selectedText.includes(' ') && /^[a-zA-Z][a-zA-Z'-]*[a-zA-Z]?$/.test(selectedText);
      const isDoubleClickSelection = isClickSelection && isSingleWord;

      const shouldShowToolbar = !isDoubleClickSelection && !isDismissClick;

      if (shouldShowToolbar) {
        // Close dictionary popup when showing toolbar
        setDictionaryPopup(null);

        const range = selection?.getRangeAt(0);
        if (range && readingArea) {
          const rect = range.getBoundingClientRect();
          const containerRect = readingArea.getBoundingClientRect();

          // Calculate text offsets within the page content
          const textContainer = readingArea.querySelector('.chapter-text-content');
          let startOffset = 0;
          let endOffset = 0;

          if (textContainer && range.startContainer.nodeType === Node.TEXT_NODE) {
            // Walk through text nodes to find offset
            const walker = document.createTreeWalker(textContainer, NodeFilter.SHOW_TEXT);
            let currentOffset = 0;
            let node: Node | null;

            while ((node = walker.nextNode())) {
              if (node === range.startContainer) {
                startOffset = currentOffset + range.startOffset;
              }
              if (node === range.endContainer) {
                endOffset = currentOffset + range.endOffset;
                break;
              }
              currentOffset += (node.textContent?.length || 0);
            }
          }

          setSelectionToolbar({
            x: rect.left + rect.width / 2 - containerRect.left + readingArea.scrollLeft,
            y: rect.top - containerRect.top + readingArea.scrollTop - 10,
            text: selectedText,
            startOffset,
            endOffset,
          });
        }
      }

      // Only trigger dictionary lookup for double-click on valid single words
      const isValidSingleWord = /^[a-zA-Z][a-zA-Z'-]*[a-zA-Z]?$/.test(selectedText) && !selectedText.includes(' ');
      if (isValidSingleWord && isDoubleClickSelection) {
        selectionTimeoutRef.current = setTimeout(validateAndShowPopup, 200);
      }
    };

    const handleSelectionChange = () => {
      updateBubbles();

      const selection = window.getSelection();
      const selectedText = selection?.toString().trim();
      const isValidWord = selectedText && /^[a-zA-Z][a-zA-Z'-]*[a-zA-Z]$|^[a-zA-Z]{2}$/.test(selectedText) && !selectedText.includes(' ');

      if (!isValidWord && selectionTimeoutRef.current) {
        clearTimeout(selectionTimeoutRef.current);
        selectionTimeoutRef.current = null;
      }
    };

    const readingArea = readingAreaRef.current;
    if (readingArea) {
      readingArea.addEventListener('mousedown', handleMouseDown);
      readingArea.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('selectionchange', handleSelectionChange);
      return () => {
        readingArea.removeEventListener('mousedown', handleMouseDown);
        readingArea.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('selectionchange', handleSelectionChange);
        if (selectionTimeoutRef.current) {
          clearTimeout(selectionTimeoutRef.current);
        }
      };
    }
  }, [lookupWord, chapter]); // Re-run when chapter loads to attach listeners to reading area

  const goToNextPage = useCallback(() => {
    if (currentPage < totalPages - 1) {
      setCurrentPage(p => p + 1);
    } else if (chapter?.hasNext && loadingChapterRef.current === null) {
      loadChapter(currentChapter + 1);
    }
  }, [currentPage, totalPages, chapter?.hasNext, currentChapter, loadChapter]);

  const goToPrevPage = useCallback(() => {
    if (currentPage > 0) {
      setCurrentPage(p => p - 1);
    } else if (chapter?.hasPrevious && loadingChapterRef.current === null) {
      loadChapter(currentChapter - 1);
    }
  }, [currentPage, chapter?.hasPrevious, currentChapter, loadChapter]);

  const handleChapterSelect = (chapterNum: number) => {
    setShowChapterDropdown(false);
    if (chapterNum !== currentChapter) {
      loadChapter(chapterNum);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) {
        return;
      }
      switch (e.key) {
        case 'ArrowRight':
        case ' ':
          e.preventDefault();
          closeDictionaryPopup();
          goToNextPage();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          closeDictionaryPopup();
          goToPrevPage();
          break;
        case 'Escape':
          // Close dictionary popup first if open
          if (dictionaryPopup) {
            closeDictionaryPopup();
            return;
          }
          // If in fullscreen, browser handles ESC to exit fullscreen
          // Only call onBack if not in fullscreen
          if (!isFullscreenActive()) {
            onBack();
          }
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToNextPage, goToPrevPage, onBack, toggleFullscreen, dictionaryPopup, closeDictionaryPopup]);

  if (loading && !chapter) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="spinner-enchanted h-8 w-8 animate-spin rounded-full border-4 mb-4" />
        <p className="text-sm text-text-secondary mb-4">{loadingStatus}</p>
        <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-cosmic-500 to-ethereal-500 transition-all duration-300"
            style={{ width: `${loadingProgress}%` }}
          />
        </div>
        <p className="text-xs text-text-muted mt-2">{Math.round(loadingProgress)}%</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center py-20 text-center">
        <p className="mb-4 text-sm text-red-400">{error}</p>
        <button
          onClick={() => loadChapter(currentChapter)}
          className="btn-ethereal rounded-lg px-4 py-2 text-sm font-medium"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`flex flex-col ${
        isFullscreen
          ? 'h-screen bg-[#0a0a0f] p-4'
          : 'h-[calc(100vh-12rem)]'
      }`}
    >
      {/* Header */}
      <div className={`flex items-center justify-between mb-4 p-4 rounded-lg bg-surface/80 border border-white/10 transition-all duration-300 z-50 ${
        isFullscreen && !showControls ? 'opacity-0 -translate-y-4 pointer-events-none' : 'opacity-100 translate-y-0'
      }`}>
        <button
          onClick={isFullscreen ? toggleFullscreen : onBack}
          className="flex items-center gap-2 text-sm text-text-secondary hover:text-cosmic-300 transition-all cursor-pointer px-3 py-1 rounded border border-transparent hover:border-cosmic-400/30 hover:shadow-[0_0_10px_rgba(139,92,246,0.15)]"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {isFullscreen ? 'Exit Fullscreen' : 'Back'}
        </button>

        <div className="flex-1 text-center px-4">
          <h2 className="text-lg font-semibold text-text-primary truncate">
            {book?.title || 'Loading...'}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowChapterDropdown(!showChapterDropdown)}
              className={`flex items-center gap-2 text-sm text-text-secondary hover:text-cosmic-300 transition-all px-3 py-1 rounded border cursor-pointer ${
                showChapterDropdown
                  ? 'border-ethereal-400/50 shadow-[0_0_15px_rgba(251,191,36,0.3)]'
                  : 'border-white/10 hover:border-cosmic-400/30 hover:shadow-[0_0_10px_rgba(139,92,246,0.15)]'
              }`}
            >
              Ch. {currentChapter}
              <svg
                className={`w-4 h-4 transition-transform ${showChapterDropdown ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showChapterDropdown && book?.chapters && (
              <div className="absolute right-0 top-full mt-2 w-64 max-h-80 overflow-y-auto bg-surface border border-ethereal-400/30 rounded-lg shadow-xl shadow-ethereal-500/20 z-50">
                {book.chapters.map((ch: ChapterSummary) => (
                  <button
                    key={ch.chapterNumber}
                    onClick={() => handleChapterSelect(ch.chapterNumber)}
                    className={`w-full text-left px-4 py-2 text-sm transition-all cursor-pointer ${
                      ch.chapterNumber === currentChapter
                        ? 'bg-ethereal-500/20 text-ethereal-300 shadow-[inset_0_0_10px_rgba(251,191,36,0.2)]'
                        : 'text-text-secondary hover:bg-cosmic-500/10 hover:text-cosmic-300 hover:shadow-[inset_0_0_10px_rgba(139,92,246,0.1)]'
                    }`}
                  >
                    <span className="font-medium">Ch. {ch.chapterNumber}</span>
                    {ch.title && <span className="ml-2 text-text-muted truncate">{ch.title}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Fullscreen toggle */}
          <button
            onClick={toggleFullscreen}
            className="flex items-center text-sm text-text-secondary hover:text-cosmic-300 transition-all cursor-pointer px-2 py-1 rounded border border-transparent hover:border-cosmic-400/30 hover:shadow-[0_0_10px_rgba(139,92,246,0.15)]"
            title={isFullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
          >
            {isFullscreen ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Reading area - hide native selection, bubble overlays handle highlight */}
      <style>{`
        .reading-content ::selection {
          background-color: transparent;
          color: inherit;
        }
      `}</style>
      <div ref={readingAreaRef} className="reading-content flex-1 overflow-y-auto px-4 sm:px-8 lg:px-16 py-6 relative">
        {chapter && (
          <div className="max-w-2xl mx-auto">
            {/* Chapter title */}
            {currentPage === 0 && chapter.title && (
              <h3 className="text-xl font-semibold text-text-primary mb-6 text-center">
                {chapter.title}
              </h3>
            )}

            {/* Chapter illustration - shown on first page */}
            {currentPage === 0 && chapter.images && chapter.images.length > 0 && (
              <div className="mb-8">
                <div className="w-full max-w-md mx-auto rounded-lg overflow-hidden border border-white/10">
                  <img
                    src={chapter.images[0].url}
                    alt={`Illustration for ${chapter.title}`}
                    className="w-full h-auto object-cover select-none pointer-events-none"
                    draggable={false}
                  />
                </div>
                {chapter.images.length > 1 && (
                  <div className="flex justify-center gap-2 mt-3">
                    {chapter.images.map((img, index) => (
                      <div
                        key={img.id}
                        className="w-12 h-12 rounded overflow-hidden border border-white/10"
                      >
                        <img
                          src={img.url}
                          alt={`Thumbnail ${index + 1}`}
                          className="w-full h-full object-cover select-none pointer-events-none"
                          draggable={false}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Chapter text */}
            <div className="chapter-text-content text-text-primary leading-relaxed whitespace-pre-wrap text-base sm:text-lg">
              {renderTextWithHighlights(
                pages[currentPage],
                highlights,
                currentChapter,
                currentPage
              )}
            </div>
          </div>
        )}

        {/* Persistent highlight bubbles - rendered as overlays identical to selection bubbles */}
        {(() => {
          // Group bubbles by highlight ID
          const highlightGroups = new Map<string, typeof highlightBubbles>();
          highlightBubbles.forEach(bubble => {
            const existing = highlightGroups.get(bubble.id) || [];
            existing.push(bubble);
            highlightGroups.set(bubble.id, existing);
          });

          return Array.from(highlightGroups.entries()).map(([highlightId, bubbles]) => {
            const firstBubble = bubbles[0];
            const isHovered = hoveredHighlightId === highlightId;

            // Toolbar position at top-right of first bubble
            const iconX = firstBubble.x + firstBubble.width;
            const iconY = firstBubble.y;

            return (
              <div key={`highlight-group-${highlightId}`}>
                {/* Visible highlight bubbles - each one handles hover/click */}
                {bubbles.map((bubble, index) => (
                  <div
                    key={`highlight-${highlightId}-${index}`}
                    className="absolute z-20 rounded-sm cursor-pointer"
                    style={{
                      left: bubble.x - 4,
                      top: bubble.y - 2,
                      width: bubble.width + 8,
                      height: bubble.height + 4,
                      backgroundColor: bubble.color,
                      boxShadow: `0 0 12px ${bubble.borderColor}`,
                    }}
                    onMouseEnter={() => handleHighlightMouseEnter(highlightId)}
                    onMouseLeave={handleHighlightMouseLeave}
                    onClick={(e) => {
                      e.stopPropagation();
                      openHighlightToolbar(
                        highlightId,
                        iconX,
                        iconY,
                        firstBubble.color,
                        firstBubble.borderColor,
                        firstBubble.hasNote,
                        firstBubble.note,
                        firstBubble.highlightText || ''
                      );
                    }}
                  />
                ))}

                {/* Note indicator - show if highlight has a note */}
                {firstBubble.hasNote && (
                  <span
                    className="absolute z-50 w-4 h-4 bg-cosmic-500/25 border border-cosmic-400/50 rounded-full flex items-center justify-center shadow-[0_0_8px_rgba(139,92,246,0.4)] pointer-events-none"
                    style={{
                      left: firstBubble.x - 2 - 6,
                      top: firstBubble.y - 6,
                    }}
                  >
                    <svg className="w-2 h-2 text-cosmic-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                    </svg>
                  </span>
                )}

                {/* Edit icon - pencil, appears at top-right on hover */}
                {(isHovered || highlightToolbar?.highlightId === highlightId) && (
                  <span
                    className={`absolute z-50 w-[26px] h-[26px] rounded-full flex items-center justify-center transition-all duration-300 pointer-events-none ${
                      highlightToolbar?.highlightId === highlightId
                        ? 'bg-ethereal-500/20 border border-ethereal-400/50 shadow-[0_0_12px_rgba(251,191,36,0.4)]'
                        : 'bg-cosmic-500/15 border border-cosmic-400/40 shadow-[0_0_10px_rgba(139,92,246,0.3)]'
                    }`}
                    style={{
                      left: firstBubble.x + firstBubble.width + 4,
                      top: firstBubble.y - 16,
                    }}
                    title="Edit highlight"
                  >
                    <svg
                      className={`w-3.5 h-3.5 transition-colors duration-300 ${
                        highlightToolbar?.highlightId === highlightId
                          ? 'text-ethereal-400'
                          : 'text-cosmic-400'
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </span>
                )}
              </div>
            );
          });
        })()}

        {/* Selection bubble highlights - rendered inside reading area for scroll attachment */}
        {selectionBubbles.map((bubble, index) => (
          <div
            key={index}
            className={`absolute pointer-events-none z-40 rounded-sm transition-colors duration-150 ${
              isSelecting
                ? 'bg-cosmic-500/30 shadow-[0_0_12px_rgba(139,92,246,0.4)]'
                : 'bg-ethereal-500/30 shadow-[0_0_12px_rgba(251,191,36,0.4)]'
            }`}
            style={{
              left: bubble.x - 2,
              top: bubble.y,
              width: bubble.width + 4,
              height: bubble.height,
            }}
          />
        ))}

        {/* Selection toolbar - appears when text is selected */}
        {selectionToolbar && !dictionaryPopup && (
          <div
            className="selection-toolbar absolute z-50 flex items-center gap-1 p-1.5 bg-surface/95 backdrop-blur border border-white/20 rounded-lg shadow-xl transition-all duration-200"
            style={{
              left: Math.max(80, Math.min(selectionToolbar.x, (readingAreaRef.current?.clientWidth || 400) - 80)),
              top: Math.max(20, selectionToolbar.y - 8),
              transform: 'translate(-50%, -100%)',
            }}
          >
            {/* Highlight color options */}
            <div className="flex items-center gap-1 px-1">
              <span className="text-[10px] text-text-muted mr-1 uppercase tracking-wide">Highlight</span>
              {HIGHLIGHT_COLORS.map((colorConfig, index) => (
                <button
                  key={colorConfig.name}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    applyHighlight(index);
                  }}
                  className="w-6 h-6 rounded-full border-2 transition-all hover:scale-110 cursor-pointer"
                  style={{
                    backgroundColor: colorConfig.color,
                    borderColor: colorConfig.border,
                  }}
                  title={colorConfig.name}
                />
              ))}
            </div>

            {/* Divider */}
            <div className="w-px h-5 bg-white/20" />

            {/* Close button */}
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                closeSelectionToolbar();
              }}
              className="p-1 text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
              title="Cancel"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Arrow pointing down */}
            <div className="absolute left-1/2 -bottom-2 -translate-x-1/2 w-0 h-0 border-l-6 border-r-6 border-t-6 border-l-transparent border-r-transparent border-t-white/20" />
          </div>
        )}

        {/* Note Editor - appears when adding/editing a note */}
        {noteEditor && (
          <div
            className="note-editor absolute z-50 w-72 bg-surface/98 backdrop-blur-lg border border-cosmic-400/30 rounded-xl shadow-2xl shadow-cosmic-500/20 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
            style={{
              left: Math.max(150, Math.min(noteEditor.x - 140, (readingAreaRef.current?.clientWidth || 400) - 300)),
              top: noteEditor.y + 8,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-4 py-3 bg-cosmic-500/10 border-b border-cosmic-400/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-cosmic-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  <span className="text-sm font-medium text-text-primary">Add Note</span>
                </div>
                <button
                  type="button"
                  onClick={closeNoteEditor}
                  className="p-1 text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Note input */}
            <div className="p-4">
              <textarea
                autoFocus
                placeholder="Write your thoughts, insights, or annotations..."
                className="w-full h-24 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-cosmic-400/50 focus:ring-1 focus:ring-cosmic-400/30 resize-none"
                value={noteEditor.note}
                onChange={(e) => setNoteEditor({ ...noteEditor, note: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.metaKey) {
                    saveNoteToHighlight(noteEditor.highlightId, noteEditor.note);
                  }
                  if (e.key === 'Escape') {
                    closeNoteEditor();
                  }
                }}
              />

              {/* Action buttons */}
              <div className="flex justify-between items-center mt-3">
                <span className="text-[10px] text-text-muted">⌘+Enter to save</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={closeNoteEditor}
                    className="px-3 py-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
                  >
                    Skip
                  </button>
                  <button
                    type="button"
                    onClick={() => saveNoteToHighlight(noteEditor.highlightId, noteEditor.note)}
                    className="px-4 py-1.5 text-xs bg-cosmic-500/80 hover:bg-cosmic-500 text-white rounded-lg transition-colors cursor-pointer"
                  >
                    Save Note
                  </button>
                </div>
              </div>
            </div>

            {/* Decorative glow */}
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-cosmic-500/20 rounded-full blur-3xl pointer-events-none" />
          </div>
        )}

        {/* Highlight Toolbar - appears when clicking highlighted text */}
        {highlightToolbar && (
          <div
            className="highlight-toolbar absolute z-50 bg-surface/98 backdrop-blur-lg border border-cosmic-400/30 rounded-xl shadow-2xl shadow-cosmic-500/20 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
            style={{
              left: Math.max(90, Math.min(highlightToolbar.x - 80, (readingAreaRef.current?.clientWidth || 400) - 180)),
              top: highlightToolbar.y + 16,
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseEnter={() => handleHighlightMouseEnter(highlightToolbar.highlightId)}
            onMouseLeave={handleHighlightMouseLeave}
          >
            {/* Compact vertical layout */}
            <div className="p-2 min-w-[160px]">
              {/* Note preview at top if exists */}
              {highlightToolbar.hasNote && highlightToolbar.note && (
                <div className="mb-2 p-2 bg-cosmic-500/10 rounded-lg border border-cosmic-400/20">
                  <p className="text-xs text-text-secondary line-clamp-2 italic">
                    "{highlightToolbar.note}"
                  </p>
                </div>
              )}

              {/* Color swatches row */}
              <div className="flex items-center gap-3 mb-2 px-1">
                <span className="text-[10px] text-text-secondary/80 uppercase tracking-wider font-medium">Color</span>
                <div className="flex items-center gap-1.5">
                  {HIGHLIGHT_COLORS.map((colorConfig, index) => (
                    <button
                      key={colorConfig.name}
                      type="button"
                      onClick={() => changeHighlightColor(highlightToolbar.highlightId, index)}
                      className={`w-5 h-5 rounded-full border-2 transition-all hover:scale-110 cursor-pointer ${
                        highlightToolbar.color === colorConfig.color ? 'ring-2 ring-white/50 ring-offset-1 ring-offset-surface' : ''
                      }`}
                      style={{
                        backgroundColor: colorConfig.color,
                        borderColor: colorConfig.border,
                      }}
                      title={colorConfig.name}
                    />
                  ))}
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-white/10 my-2" />

              {/* Action buttons - stacked */}
              <div className="space-y-1">
                {/* Add/Edit Note button */}
                <button
                  type="button"
                  onClick={openNoteEditorFromToolbar}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-text-secondary hover:text-cosmic-400 hover:bg-cosmic-500/10 rounded-lg transition-colors cursor-pointer"
                  title={highlightToolbar.hasNote ? "Edit note" : "Add note"}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                  </svg>
                  {highlightToolbar.hasNote ? 'Edit Note' : 'Add Note'}
                </button>

                {/* Delete button */}
                <button
                  type="button"
                  onClick={() => {
                    removeHighlight(highlightToolbar.highlightId);
                    closeHighlightToolbar();
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-rose-400/70 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                  title="Remove highlight"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Remove Highlight
                </button>
              </div>
            </div>

            {/* Arrow pointing up toward the highlight */}
            <div className="absolute left-1/2 -top-1.5 -translate-x-1/2 w-0 h-0 border-l-6 border-r-6 border-b-6 border-l-transparent border-r-transparent border-b-cosmic-400/30" />
          </div>
        )}

        {/* Dictionary popup - rendered inside reading area for scroll attachment */}
        {dictionaryPopup && (
          <div
            className="dictionary-popup absolute z-50 max-w-xs bg-surface border border-ethereal-400/30 rounded-lg shadow-xl shadow-ethereal-500/20 p-3"
            style={{
              left: Math.max(160, Math.min(dictionaryPopup.x, (readingAreaRef.current?.clientWidth || 400) - 160)),
              top: Math.max(20, dictionaryPopup.y - 10),
              transform: 'translate(-50%, -100%)',
            }}
          >
            {/* Arrow pointing down */}
            <div className="absolute left-1/2 -bottom-2 -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-ethereal-400/30" />

            {/* Close button */}
            <button
              onClick={closeDictionaryPopup}
              className="absolute top-1 right-1 p-1 text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {dictionaryPopup.loading ? (
              <div className="flex items-center gap-2 py-2">
                <div className="w-4 h-4 border-2 border-cosmic-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-text-muted">Looking up "{dictionaryPopup.word}"...</span>
              </div>
            ) : dictionaryPopup.error ? (
              <div className="py-1">
                <p className="text-sm text-text-muted">{dictionaryPopup.error}</p>
              </div>
            ) : dictionaryPopup.entry ? (
              <div className="pr-4">
                {/* Word and phonetic */}
                <div className="mb-2">
                  <span className="text-base font-semibold text-ethereal-300">{dictionaryPopup.entry.word}</span>
                  {dictionaryPopup.entry.phonetic && (
                    <span className="ml-2 text-sm text-text-muted">{dictionaryPopup.entry.phonetic}</span>
                  )}
                </div>

                {/* Meanings */}
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {dictionaryPopup.entry.meanings.map((meaning, idx) => (
                    <div key={idx}>
                      <span className="text-xs font-medium text-cosmic-300 italic">{meaning.partOfSpeech}</span>
                      <ol className="mt-1 space-y-1 pl-4 list-decimal list-outside">
                        {meaning.definitions.slice(0, 2).map((def, defIdx) => (
                          <li key={defIdx} className="text-sm text-text-secondary">
                            {def.definition}
                            {def.example && (
                              <p className="text-xs text-text-muted mt-0.5 italic">"{def.example}"</p>
                            )}
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className={`mt-4 p-4 rounded-lg bg-surface/80 border border-white/10 transition-all duration-300 ${
        isFullscreen && !showControls ? 'opacity-0 translate-y-4 pointer-events-none' : 'opacity-100 translate-y-0'
      }`}>
        <div className="mb-4">
          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cosmic-500 to-ethereal-500 transition-[width] duration-300"
              style={{ width: `${actualProgress}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={goToPrevPage}
            disabled={currentPage === 0 && !chapter?.hasPrevious}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-text-secondary hover:text-cosmic-300 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all rounded border border-transparent hover:border-cosmic-400/30 hover:shadow-[0_0_10px_rgba(139,92,246,0.15)]"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Previous
          </button>

          <div className="text-sm text-text-muted">
            Page {currentPage + 1} of {totalPages}
            <span className="mx-2">|</span>
            Chapter {currentChapter} of {chapter?.totalChapters || '?'}
          </div>

          <button
            onClick={goToNextPage}
            disabled={currentPage === totalPages - 1 && !chapter?.hasNext}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-text-secondary hover:text-cosmic-300 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all rounded border border-transparent hover:border-cosmic-400/30 hover:shadow-[0_0_10px_rgba(139,92,246,0.15)]"
          >
            Next
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {showChapterDropdown && (
        <div className="fixed inset-0 z-40" onClick={() => setShowChapterDropdown(false)} />
      )}
    </div>
  );
}
