import { useState, useEffect } from 'react';
import { fetchBooks } from '../api/libraryApi';
import type { BookSummary } from '../types/book';
import { ChapterReader } from './ChapterReader';

function parseReaderPath(): { bookId: string | null; chapterNumber: number } {
  const path = window.location.pathname;
  const match = path.match(/^\/reader\/([^/]+)(?:\/(\d+))?$/);
  if (match) {
    return {
      bookId: match[1],
      chapterNumber: match[2] ? parseInt(match[2], 10) : 1,
    };
  }
  return { bookId: null, chapterNumber: 1 };
}

export function ReaderPage() {
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [initialChapter, setInitialChapter] = useState(1);

  useEffect(() => {
    const { bookId, chapterNumber } = parseReaderPath();
    if (bookId) {
      setActiveBookId(bookId);
      setInitialChapter(chapterNumber);
    }

    loadBooks();
  }, []);

  const loadBooks = async () => {
    try {
      setLoading(true);
      const allBooks = await fetchBooks();
      // Filter to only show completed books
      const completedBooks = allBooks.filter((b) => b.processingStatus === 'COMPLETED');
      setBooks(completedBooks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load books');
    } finally {
      setLoading(false);
    }
  };

  const handleCardClick = (bookId: string) => {
    setSelectedCardId(selectedCardId === bookId ? null : bookId);
  };

  const handleOpenReader = (bookId: string) => {
    setActiveBookId(bookId);
    setInitialChapter(1);
    window.history.pushState({}, '', `/reader/${bookId}/1`);
  };

  const handleBack = () => {
    setActiveBookId(null);
    setSelectedCardId(null);
    window.history.pushState({}, '', '/reader');
  };

  // Handle browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      const { bookId, chapterNumber } = parseReaderPath();
      setActiveBookId(bookId);
      setInitialChapter(chapterNumber);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  if (activeBookId) {
    return (
      <ChapterReader
        bookId={activeBookId}
        initialChapter={initialChapter}
        onBack={handleBack}
      />
    );
  }

  if (loading) {
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
          onClick={loadBooks}
          className="btn-ethereal rounded-lg px-4 py-2 text-sm font-medium"
        >
          Retry
        </button>
      </div>
    );
  }

  if (books.length === 0) {
    return (
      <div className="flex flex-col items-center py-20 text-center">
        <div className="mb-4 text-6xl opacity-60">📚</div>
        <h2 className="mb-2 text-xl font-semibold text-text-primary">No books ready to read</h2>
        <p className="text-sm text-text-secondary">
          Upload and process books in My Books to start reading.
        </p>
      </div>
    );
  }

  const selectedBook = books.find((b) => b.bookId === selectedCardId);

  return (
    <div>
      <h2 className="mb-6 text-xl font-semibold text-text-primary">Select a book to read</h2>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {books.map((book) => {
          const authors = book.authors ?? [];
          const genres = book.genre ?? [];
          const isSelected = selectedCardId === book.bookId;

          return (
            <div key={book.bookId} className="relative">
              <div
                onClick={() => handleCardClick(book.bookId)}
                className={`card-reader text-left cursor-pointer ${isSelected ? 'selected' : ''}`}
              >
                <div className="p-5">
                  <h3 className="text-lg font-semibold text-text-primary leading-tight mb-2">
                    {book.title}
                  </h3>

                  <p className="text-sm text-text-secondary mb-3">
                    {authors.length > 0 ? authors.join(', ') : 'Unknown author'}
                  </p>

                  {/* Genre tags */}
                  {genres.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {genres.slice(0, 3).map((g) => (
                        <span key={g} className="tag-forest rounded px-2 py-0.5 text-xs">
                          {g}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Floating popover for selected book */}
              {isSelected && selectedBook && (
                <div className="absolute left-0 right-0 top-full mt-2 z-20 bg-surface border border-cosmic-500/50 rounded-lg shadow-xl shadow-cosmic-500/20">
                  <div className="p-4">
                    {/* Metadata */}
                    <div className="space-y-2 mb-4 text-sm">
                      <div className="flex justify-between">
                        <span className="text-text-muted">Chapters</span>
                        <span className="text-text-primary">{selectedBook.totalChapters}</span>
                      </div>
                      {selectedBook.pageCount > 0 && (
                        <div className="flex justify-between">
                          <span className="text-text-muted">Pages</span>
                          <span className="text-text-primary">{selectedBook.pageCount}</span>
                        </div>
                      )}
                      {(selectedBook.genre ?? []).length > 0 && (
                        <div className="flex justify-between">
                          <span className="text-text-muted">Genre</span>
                          <span className="text-text-primary">{(selectedBook.genre ?? []).join(', ')}</span>
                        </div>
                      )}
                    </div>

                    {/* Divider */}
                    <div className="h-px bg-white/10 mb-4" />

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenReader(selectedBook.bookId);
                      }}
                      className="w-full btn-ethereal rounded-lg px-3 py-2 text-sm font-medium"
                    >
                      Start Reading
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Click outside to close popover */}
      {selectedCardId && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setSelectedCardId(null)}
        />
      )}
    </div>
  );
}
