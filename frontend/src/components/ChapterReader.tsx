import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  const [selectedImage, setSelectedImage] = useState<ChapterImage | null>(null);

  // Dictionary popup state
  const [dictionaryPopup, setDictionaryPopup] = useState<DictionaryPopupState | null>(null);

  // Selection highlight bubble state - array for multi-line selections
  const [selectionBubbles, setSelectionBubbles] = useState<Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>>([]);

  // Track if selection is in progress (purple) vs completed (yellow)
  const [isSelecting, setIsSelecting] = useState(false);

  // Container ref for fullscreen
  const containerRef = useRef<HTMLDivElement>(null);
  const readingAreaRef = useRef<HTMLDivElement>(null);

  // Ref for selection timeout to persist across re-renders
  const selectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      setIsFullscreen(isFullscreenActive());
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

  // Dictionary lookup function
  const lookupWord = useCallback(async (word: string, x: number, y: number) => {
    // Clean the word - remove punctuation and normalize
    const cleanWord = word.toLowerCase().replace(/[^a-z'-]/g, '').trim();
    if (!cleanWord || cleanWord.length < 2) return;

    setDictionaryPopup({
      word: cleanWord,
      x,
      y,
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

      if (selectedText && selection?.rangeCount) {
        const range = selection.getRangeAt(0);
        const rects = range.getClientRects();
        const bubbles: Array<{ x: number; y: number; width: number; height: number }> = [];

        for (let i = 0; i < rects.length; i++) {
          const rect = rects[i];
          if (rect.width > 0 && rect.height > 0) {
            bubbles.push({
              x: rect.left,
              y: rect.top,
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

    const handleMouseDown = () => {
      setIsSelecting(true);
    };

    const handleMouseUp = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.dictionary-popup')) return;

      setIsSelecting(false);

      if (selectionTimeoutRef.current) {
        clearTimeout(selectionTimeoutRef.current);
      }

      const selection = window.getSelection();
      const selectedText = selection?.toString().trim();

      if (!selectedText) {
        setSelectionBubbles([]);
        setDictionaryPopup(null);
        return;
      }

      updateBubbles();

      // Only trigger dictionary lookup for valid single words
      const isValidSingleWord = /^[a-zA-Z][a-zA-Z'-]*[a-zA-Z]?$/.test(selectedText) && !selectedText.includes(' ');
      if (isValidSingleWord) {
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
  }, [lookupWord]);

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
      <div className="flex items-center justify-between mb-4 p-4 rounded-lg bg-surface/80 border border-white/10">
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
                <button
                  onClick={() => setSelectedImage(chapter.images[0])}
                  className="w-full max-w-md mx-auto block rounded-lg overflow-hidden border border-white/10 hover:border-cosmic-400/50 hover:shadow-[0_0_20px_rgba(139,92,246,0.25)] transition-all cursor-pointer"
                >
                  <img
                    src={chapter.images[0].url}
                    alt={`Illustration for ${chapter.title}`}
                    className="w-full h-auto object-cover"
                  />
                </button>
                {chapter.images.length > 1 && (
                  <div className="flex justify-center gap-2 mt-3">
                    {chapter.images.map((img, index) => (
                      <button
                        key={img.id}
                        onClick={() => setSelectedImage(img)}
                        className="w-12 h-12 rounded overflow-hidden border border-white/10 hover:border-cosmic-400/50 transition-all cursor-pointer"
                      >
                        <img
                          src={img.url}
                          alt={`Thumbnail ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Chapter text */}
            <div className="text-text-primary leading-relaxed whitespace-pre-wrap text-base sm:text-lg">
              {pages[currentPage]}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-4 p-4 rounded-lg bg-surface/80 border border-white/10">
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

      {/* Image lightbox */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={() => setSelectedImage(null)}
        >
          <button
            onClick={() => setSelectedImage(null)}
            className="absolute top-4 right-4 p-2 text-white/70 hover:text-white transition-colors cursor-pointer"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={selectedImage.url}
            alt="Full size illustration"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Selection bubble highlights */}
      {selectionBubbles.map((bubble, index) => (
        <div
          key={index}
          className={`fixed pointer-events-none z-40 rounded-lg transition-colors duration-150 ${
            isSelecting
              ? 'bg-cosmic-500/25 border border-cosmic-400/40 shadow-[0_0_8px_rgba(139,92,246,0.3)]'
              : 'bg-ethereal-500/25 border border-ethereal-400/40 shadow-[0_0_8px_rgba(251,191,36,0.3)]'
          }`}
          style={{
            left: bubble.x - 3,
            top: bubble.y - 1,
            width: bubble.width + 6,
            height: bubble.height + 2,
          }}
        />
      ))}

      {/* Dictionary popup */}
      {dictionaryPopup && (
        <div
          className="dictionary-popup fixed z-50 max-w-xs bg-surface border border-ethereal-400/30 rounded-lg shadow-xl shadow-ethereal-500/20 p-3 transform -translate-x-1/2 -translate-y-full"
          style={{
            left: Math.max(160, Math.min(dictionaryPopup.x, window.innerWidth - 160)),
            top: Math.max(100, dictionaryPopup.y),
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
  );
}
