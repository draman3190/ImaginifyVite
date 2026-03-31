import { useEffect } from 'react';
import { useBooks } from '../hooks/useBooks';
import { BookCard } from './BookCard';
import { EmptyState } from './EmptyState';

interface MyBooksPageProps {
  onUpload: () => void;
  refreshTrigger?: number;
  onRefreshNeeded?: () => void;
}

export function MyBooksPage({ onUpload, refreshTrigger, onRefreshNeeded }: MyBooksPageProps) {
  const { books, loading, error, refresh, deleteBook } = useBooks();

  const handleDelete = async (bookId: string) => {
    await deleteBook(bookId);
    // Notify parent to refresh other pages
    onRefreshNeeded?.();
  };

  // Refresh when trigger changes (after upload completes)
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      refresh();
    }
  }, [refreshTrigger, refresh]);

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
          onClick={refresh}
          className="btn-ethereal rounded-lg px-4 py-2 text-sm font-medium"
        >
          Retry
        </button>
      </div>
    );
  }

  if (books.length === 0) {
    return <EmptyState onUpload={onUpload} />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {books.map((book) => (
        <BookCard key={book.bookId} book={book} onDelete={handleDelete} />
      ))}
    </div>
  );
}
