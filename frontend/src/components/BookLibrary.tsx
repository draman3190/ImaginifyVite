import { useState } from 'react';
import { useBooks } from '../hooks/useBooks';
import { BookCard } from './BookCard';
import { UploadBookModal } from './UploadBookModal';
import { EmptyState } from './EmptyState';

export function BookLibrary() {
  const { books, loading, error, refresh, deleteBook } = useBooks();
  const [showUpload, setShowUpload] = useState(false);

  return (
    <div className="min-h-screen bg-starfield">
      <header className="bg-enchanted-header">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <h1 className="bg-gradient-to-r from-ethereal-400 via-ethereal-300 to-cosmic-400 bg-clip-text text-2xl font-bold text-transparent">
            Imaginify
          </h1>
          <button
            onClick={() => setShowUpload(true)}
            className="btn-ethereal rounded-lg px-4 py-2 text-sm font-medium"
          >
            Upload Book
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {loading && (
          <div className="flex justify-center py-20">
            <div className="spinner-enchanted h-8 w-8 animate-spin rounded-full border-4" />
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center py-20 text-center">
            <p className="mb-4 text-sm text-red-400">{error}</p>
            <button
              onClick={refresh}
              className="btn-ethereal rounded-lg px-4 py-2 text-sm font-medium"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && books.length === 0 && (
          <EmptyState onUpload={() => setShowUpload(true)} />
        )}

        {!loading && !error && books.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {books.map((book) => (
              <BookCard key={book.bookId} book={book} onDelete={deleteBook} />
            ))}
          </div>
        )}
      </main>

      {showUpload && (
        <UploadBookModal
          onClose={() => setShowUpload(false)}
          onUploadComplete={refresh}
        />
      )}
    </div>
  );
}
