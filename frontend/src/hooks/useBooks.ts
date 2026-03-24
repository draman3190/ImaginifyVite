import { useState, useEffect, useCallback, useRef } from 'react';
import type { BookSummary } from '../types/book';
import { fetchBooks, deleteBook as apiDeleteBook } from '../api/libraryApi';

interface UseBooksResult {
  books: BookSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  deleteBook: (bookId: string) => Promise<void>;
}

const POLL_INTERVAL_MS = 3000; // Poll every 3 seconds when processing

export function useBooks(): UseBooksResult {
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollIntervalRef = useRef<number | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchBooks()
      .then(setBooks)
      .catch((err) => setError(err.message || 'Failed to load books'))
      .finally(() => setLoading(false));
  }, []);

  // Silent refresh for polling (doesn't show loading state)
  const silentRefresh = useCallback(() => {
    fetchBooks()
      .then(setBooks)
      .catch(() => {}); // Silently ignore errors during polling
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Poll for updates while any book is processing
  useEffect(() => {
    const hasProcessingBooks = books.some(
      (book) => book.processingStatus === 'PROCESSING' || book.processingStatus === 'PENDING_UPLOAD'
    );

    if (hasProcessingBooks && !pollIntervalRef.current) {
      pollIntervalRef.current = window.setInterval(silentRefresh, POLL_INTERVAL_MS);
    } else if (!hasProcessingBooks && pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [books, silentRefresh]);

  const deleteBook = useCallback(async (bookId: string) => {
    // Optimistic removal
    setBooks((prev) => prev.filter((b) => b.bookId !== bookId));
    try {
      await apiDeleteBook(bookId);
    } catch (err) {
      // Revert on failure
      refresh();
      throw err;
    }
  }, [refresh]);

  return { books, loading, error, refresh, deleteBook };
}
