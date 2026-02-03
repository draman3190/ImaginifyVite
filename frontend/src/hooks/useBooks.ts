import { useState, useEffect, useCallback } from 'react';
import type { BookSummary } from '../types/book';
import { fetchBooks, deleteBook as apiDeleteBook } from '../api/libraryApi';

interface UseBooksResult {
  books: BookSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  deleteBook: (bookId: string) => Promise<void>;
}

export function useBooks(): UseBooksResult {
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchBooks()
      .then(setBooks)
      .catch((err) => setError(err.message || 'Failed to load books'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
