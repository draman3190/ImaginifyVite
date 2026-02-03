import { useState } from 'react';
import { useBooks } from '../hooks/useBooks';
import { BookCard } from './BookCard';
import { UploadBookModal } from './UploadBookModal';
import { EmptyState } from './EmptyState';

export function BookLibrary() {
  const { books, loading, error, refresh, deleteBook } = useBooks();
  const [showUpload, setShowUpload] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <h1 className="text-2xl font-bold text-gray-900">Imaginify</h1>
          <button
            onClick={() => setShowUpload(true)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Upload Book
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {loading && (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center py-20 text-center">
            <p className="mb-4 text-sm text-red-600">{error}</p>
            <button
              onClick={refresh}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
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
