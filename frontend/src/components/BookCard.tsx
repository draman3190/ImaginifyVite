import type { BookSummary } from '../types/book';
import { StatusBadge } from './StatusBadge';

interface BookCardProps {
  book: BookSummary;
  onDelete: (bookId: string) => void;
}

export function BookCard({ book, onDelete }: BookCardProps) {
  const authors = book.authors ?? [];
  const genre = book.genre ?? [];

  return (
    <div className="flex flex-col rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-start justify-between">
        <h3 className="text-lg font-semibold text-gray-900 leading-tight">{book.title}</h3>
        <StatusBadge status={book.processingStatus} />
      </div>

      <p className="mb-2 text-sm text-gray-600">
        {authors.length > 0 ? authors.join(', ') : 'Unknown author'}
      </p>

      {genre.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {genre.map((g) => (
            <span
              key={g}
              className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
            >
              {g}
            </span>
          ))}
        </div>
      )}

      <p className="mb-4 text-xs text-gray-400">
        {book.pageCount > 0 ? `${book.pageCount} pages` : 'Page count unknown'}
      </p>

      <div className="mt-auto flex gap-2">
        <button
          disabled
          title="Coming soon"
          className="flex-1 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-400 cursor-not-allowed"
        >
          Download Images
        </button>
        <button
          onClick={() => onDelete(book.bookId)}
          className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
