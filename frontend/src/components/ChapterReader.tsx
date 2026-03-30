import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { fetchBookDetail, fetchChapterContent } from '../api/readerApi';
import type { BookDetail, ChapterContent, ChapterSummary } from '../types/book';

interface ChapterReaderProps {
  bookId: string;
  initialChapter: number;
  onBack: () => void;
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

  // Progress bar animation state
  const [displayedProgress, setDisplayedProgress] = useState(0);
  const targetProgressRef = useRef(0);
  const animationFrameRef = useRef<number>();

  // Guard against duplicate chapter loads
  const loadingChapterRef = useRef<number | null>(null);

  // Refs for values needed in navigation callbacks (avoid stale closures)
  const currentChapterRef = useRef(currentChapter);
  const chapterRef = useRef(chapter);
  const totalPagesRef = useRef(1);

  // Keep refs in sync
  currentChapterRef.current = currentChapter;
  chapterRef.current = chapter;

  const pages = useMemo(() => {
    if (!chapter?.content) return [''];
    return splitIntoPages(chapter.content);
  }, [chapter?.content]);

  const totalPages = pages.length;
  totalPagesRef.current = totalPages;

  // Calculate actual progress
  const actualProgress = chapter
    ? ((currentChapter - 1) / chapter.totalChapters) * 100 +
      ((currentPage + 1) / totalPages / chapter.totalChapters) * 100
    : 0;

  // Update target progress - only allow forward or significant backward (chapter change)
  useEffect(() => {
    const current = targetProgressRef.current;
    // Allow forward progress, or allow reset if it's a big jump back (new chapter)
    if (actualProgress > current || actualProgress < current - 10) {
      targetProgressRef.current = actualProgress;
    }
  }, [actualProgress]);

  // RAF animation loop for smooth progress bar
  useEffect(() => {
    const animate = () => {
      const target = targetProgressRef.current;

      setDisplayedProgress(prev => {
        const diff = target - prev;

        // Snap if very close
        if (Math.abs(diff) < 0.1) {
          return target;
        }

        // Smooth chase at ~70% speed
        return prev + diff * 0.12;
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

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
      // Prevent duplicate loads of the same chapter
      if (loadingChapterRef.current === chapterNum) {
        return;
      }
      loadingChapterRef.current = chapterNum;

      try {
        setLoading(true);
        setError(null);
        const chapterData = await fetchChapterContent(bookId, chapterNum);

        // Only apply if this is still the chapter we want
        if (loadingChapterRef.current === chapterNum) {
          setChapter(chapterData);
          setCurrentChapter(chapterNum);
          setCurrentPage(0);
          // Reset progress target for new chapter
          targetProgressRef.current =
            ((chapterNum - 1) / chapterData.totalChapters) * 100 +
            (1 / chapterData.totalChapters) * 100 / 10; // Approximate first page
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

  useEffect(() => {
    loadBook();
    loadChapter(initialChapter);
  }, [loadBook, loadChapter, initialChapter]);

  const goToNextPage = useCallback(() => {
    setCurrentPage(prev => {
      const total = totalPagesRef.current;
      if (prev < total - 1) {
        return prev + 1;
      }
      // At last page, trigger chapter load if available
      if (chapterRef.current?.hasNext && loadingChapterRef.current === null) {
        loadChapter(currentChapterRef.current + 1);
      }
      return prev;
    });
  }, [loadChapter]);

  const goToPrevPage = useCallback(() => {
    setCurrentPage(prev => {
      if (prev > 0) {
        return prev - 1;
      }
      // At first page, trigger chapter load if available
      if (chapterRef.current?.hasPrevious && loadingChapterRef.current === null) {
        loadChapter(currentChapterRef.current - 1);
      }
      return prev;
    });
  }, [loadChapter]);

  const handleChapterSelect = (chapterNum: number) => {
    setShowChapterDropdown(false);
    if (chapterNum !== currentChapter) {
      loadChapter(chapterNum);
    }
  };

  // Keyboard navigation
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
          onBack();
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToNextPage, goToPrevPage, onBack]);

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
    <div className="flex flex-col h-[calc(100vh-12rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 p-4 rounded-lg bg-surface/80 border border-white/10">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-all cursor-pointer px-3 py-1 rounded border border-transparent hover:border-ethereal-400/30 hover:shadow-[0_0_10px_rgba(251,191,36,0.15)]"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back
        </button>

        <div className="flex-1 text-center px-4">
          <h2 className="text-lg font-semibold text-text-primary truncate">
            {book?.title || 'Loading...'}
          </h2>
        </div>

        {/* Chapter dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowChapterDropdown(!showChapterDropdown)}
            className={`flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-all px-3 py-1 rounded border cursor-pointer ${
              showChapterDropdown
                ? 'border-cosmic-400/50 shadow-[0_0_15px_rgba(139,92,246,0.3)]'
                : 'border-white/10 hover:border-ethereal-400/30 hover:shadow-[0_0_10px_rgba(251,191,36,0.15)]'
            }`}
          >
            Ch. {currentChapter}
            <svg
              className={`w-4 h-4 transition-transform ${showChapterDropdown ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {showChapterDropdown && book?.chapters && (
            <div className="absolute right-0 top-full mt-2 w-64 max-h-80 overflow-y-auto bg-surface border border-cosmic-400/30 rounded-lg shadow-xl shadow-cosmic-500/20 z-50">
              {book.chapters.map((ch: ChapterSummary) => (
                <button
                  key={ch.chapterNumber}
                  onClick={() => handleChapterSelect(ch.chapterNumber)}
                  className={`w-full text-left px-4 py-2 text-sm transition-all cursor-pointer ${
                    ch.chapterNumber === currentChapter
                      ? 'bg-cosmic-500/20 text-cosmic-300 shadow-[inset_0_0_10px_rgba(139,92,246,0.2)]'
                      : 'text-text-secondary hover:bg-ethereal-500/10 hover:text-ethereal-300 hover:shadow-[inset_0_0_10px_rgba(251,191,36,0.1)]'
                  }`}
                >
                  <span className="font-medium">Ch. {ch.chapterNumber}</span>
                  {ch.title && (
                    <span className="ml-2 text-text-muted truncate">{ch.title}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Reading area */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 lg:px-16 py-6">
        {chapter && (
          <div className="max-w-2xl mx-auto">
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

      {/* Footer */}
      <div className="mt-4 p-4 rounded-lg bg-surface/80 border border-white/10">
        {/* Progress bar */}
        <div className="mb-4">
          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-ethereal-500 to-cosmic-500"
              style={{ width: `${displayedProgress}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={goToPrevPage}
            disabled={currentPage === 0 && !chapter?.hasPrevious}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:border-transparent cursor-pointer transition-all rounded border border-transparent hover:border-ethereal-400/30 hover:shadow-[0_0_10px_rgba(251,191,36,0.15)]"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
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
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:border-transparent cursor-pointer transition-all rounded border border-transparent hover:border-ethereal-400/30 hover:shadow-[0_0_10px_rgba(251,191,36,0.15)]"
          >
            Next
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Click outside to close dropdown */}
      {showChapterDropdown && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowChapterDropdown(false)}
        />
      )}
    </div>
  );
}
