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
    <div className="card-enchanted relative flex flex-col rounded-lg p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-text-primary leading-tight">{book.title}</h3>
        <StatusBadge status={book.processingStatus} />
      </div>

      <p className="mb-2 text-sm text-text-secondary">
        {authors.length > 0 ? authors.join(', ') : 'Unknown author'}
      </p>

      {genre.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {genre.map((g) => (
            <span
              key={g}
              className="tag-forest rounded px-2 py-0.5 text-xs"
            >
              {g}
            </span>
          ))}
        </div>
      )}

      <p className="mb-4 text-xs text-text-muted">
        {book.pageCount > 0 ? `${book.pageCount} pages` : 'Page count unknown'}
      </p>

      <div className="mt-auto flex gap-2">
        <button
          disabled
          title="Coming soon"
          className="flex-1 rounded-lg border border-border-subtle bg-raised/50 px-3 py-2 text-sm font-medium text-text-muted cursor-not-allowed"
        >
          Download Images
        </button>
        <button
          onClick={() => onDelete(book.bookId)}
          className="rounded-lg border border-red-500/20 px-3 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10 hover:border-red-500/30 transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
