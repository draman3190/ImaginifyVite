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
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        <div className="flex-1 text-center px-4">
          <h2 className="text-lg font-semibold text-text-primary truncate">
            {book?.title || 'Loading...'}
          </h2>
        </div>

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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
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
                  {ch.title && <span className="ml-2 text-text-muted truncate">{ch.title}</span>}
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
        <div className="mb-4">
          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-ethereal-500 to-cosmic-500 transition-[width] duration-300"
              style={{ width: `${actualProgress}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={goToPrevPage}
            disabled={currentPage === 0 && !chapter?.hasPrevious}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all rounded border border-transparent hover:border-ethereal-400/30 hover:shadow-[0_0_10px_rgba(251,191,36,0.15)]"
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
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all rounded border border-transparent hover:border-ethereal-400/30 hover:shadow-[0_0_10px_rgba(251,191,36,0.15)]"
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
