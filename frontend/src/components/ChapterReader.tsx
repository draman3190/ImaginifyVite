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

export function ChapterReader({ bookId, initialChapter, onBack }: ChapterReaderProps) {
  const [book, setBook] = useState<BookDetail | null>(null);
  const [chapter, setChapter] = useState<ChapterContent | null>(null);
  const [currentChapter, setCurrentChapter] = useState(initialChapter);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showChapterDropdown, setShowChapterDropdown] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showImagePanel, setShowImagePanel] = useState(false);
  const [selectedImage, setSelectedImage] = useState<ChapterImage | null>(null);

  // Container ref for fullscreen
  const containerRef = useRef<HTMLDivElement>(null);

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

  const loadChapter = useCallback(
    async (chapterNum: number) => {
      if (loadingChapterRef.current === chapterNum) return;

      // Check prefetch cache first
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
        setError(null);
        const chapterData = await fetchChapterContent(bookId, chapterNum);

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
    [bookId]
  );

  // Prefetch adjacent chapters when near page boundaries
  useEffect(() => {
    if (!chapter) return;

    const prefetch = async (chapterNum: number) => {
      if (prefetchCacheRef.current.has(chapterNum)) return;
      try {
        const data = await fetchChapterContent(bookId, chapterNum);
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
  }, [currentPage, totalPages, chapter, currentChapter, bookId]);

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
          goToNextPage();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          goToPrevPage();
          break;
        case 'Escape':
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
  }, [goToNextPage, goToPrevPage, onBack, toggleFullscreen]);

  if (loading && !chapter) {
    return (
      <div className="flex justify-center py-20">
        <div className="spinner-enchanted h-8 w-8 animate-spin rounded-full border-4" />
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

          {/* Image panel toggle */}
          {chapter?.images && chapter.images.length > 0 && (
            <button
              onClick={() => setShowImagePanel(!showImagePanel)}
              className={`flex items-center text-sm transition-all cursor-pointer px-2 py-1 rounded border ${
                showImagePanel
                  ? 'text-ethereal-300 border-ethereal-400/50 shadow-[0_0_15px_rgba(251,191,36,0.3)]'
                  : 'text-text-secondary hover:text-cosmic-300 border-transparent hover:border-cosmic-400/30 hover:shadow-[0_0_10px_rgba(139,92,246,0.15)]'
              }`}
              title={showImagePanel ? 'Hide illustrations' : 'Show illustrations'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
              <span className="ml-1.5 text-xs">{chapter.images.length}</span>
            </button>
          )}

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

      {/* Main content area with optional image panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Reading area */}
        <div className={`flex-1 overflow-y-auto px-4 sm:px-8 py-6 transition-all duration-300 ${
          showImagePanel ? 'lg:pr-4' : 'lg:px-16'
        }`}>
          {chapter && (
            <div className={`mx-auto ${showImagePanel ? 'max-w-xl' : 'max-w-2xl'}`}>
              {currentPage === 0 && chapter.title && (
                <h3 className="text-xl font-semibold text-text-primary mb-6 text-center">
                  {chapter.title}
                </h3>
              )}
              <div className="text-text-primary leading-relaxed whitespace-pre-wrap text-base sm:text-lg">
                {pages[currentPage]}
              </div>
            </div>
          )}
        </div>

        {/* Image panel */}
        {showImagePanel && chapter?.images && chapter.images.length > 0 && (
          <div className="w-80 border-l border-white/10 bg-surface/50 overflow-y-auto p-4 hidden lg:block">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-medium text-text-primary">Illustrations</h4>
              <button
                onClick={() => setShowImagePanel(false)}
                className="text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-3">
              {chapter.images.map((img, index) => (
                <button
                  key={img.id}
                  onClick={() => setSelectedImage(img)}
                  className="w-full rounded-lg overflow-hidden border border-white/10 hover:border-cosmic-400/50 hover:shadow-[0_0_15px_rgba(139,92,246,0.2)] transition-all cursor-pointer"
                >
                  <img
                    src={img.url}
                    alt={`Illustration ${index + 1}`}
                    className="w-full h-auto object-cover"
                    loading="lazy"
                  />
                </button>
              ))}
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
    </div>
  );
}
