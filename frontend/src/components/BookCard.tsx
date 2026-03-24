import { useState, useEffect, useRef } from 'react';
import type { BookSummary } from '../types/book';
import { StatusBadge } from './StatusBadge';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { ProgressBar } from './ProgressBar';

interface BookCardProps {
  book: BookSummary;
  onDelete: (bookId: string) => void;
}

function formatElapsedTime(seconds: number): string {
  if (seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function calculateElapsedSeconds(uploadTimestamp: string | null): number {
  if (!uploadTimestamp) return 0;
  const uploadTime = new Date(uploadTimestamp).getTime();
  const now = Date.now();
  return Math.floor((now - uploadTime) / 1000);
}

export function BookCard({ book, onDelete }: BookCardProps) {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(() =>
    calculateElapsedSeconds(book.uploadTimestamp)
  );
  const timerRef = useRef<number | null>(null);
  const authors = book.authors ?? [];
  const genre = book.genre ?? [];

  // Elapsed time timer for processing books - calculates from upload timestamp
  useEffect(() => {
    const isProcessing = book.processingStatus === 'PROCESSING' || book.processingStatus === 'PENDING_UPLOAD';

    if (isProcessing) {
      // Calculate initial elapsed time from upload timestamp
      setElapsedSeconds(calculateElapsedSeconds(book.uploadTimestamp));

      // Update every second
      timerRef.current = window.setInterval(() => {
        setElapsedSeconds(calculateElapsedSeconds(book.uploadTimestamp));
      }, 1000);
    } else if (timerRef.current) {
      // Stop timer when processing completes
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [book.processingStatus, book.uploadTimestamp]);

  const handleDeleteConfirm = () => {
    onDelete(book.bookId);
    setShowDeleteModal(false);
  };

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

      {(book.processingStatus === 'PROCESSING' || book.processingStatus === 'PENDING_UPLOAD') && (
        <div className="mb-4">
          {book.totalChapters > 0 && (
            <ProgressBar current={book.processedChapters} total={book.totalChapters} />
          )}
          <div className="mt-2 flex items-center justify-center gap-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-ethereal-400" />
            <span className="text-sm font-medium text-text-secondary">
              Elapsed: {formatElapsedTime(elapsedSeconds)}
            </span>
          </div>
        </div>
      )}

      <div className="mt-auto flex gap-2">
        <button
          disabled
          title="Coming soon"
          className="flex-1 rounded-lg border border-border-subtle bg-raised/50 px-3 py-2 text-sm font-medium text-text-muted cursor-not-allowed"
        >
          Download Images
        </button>
        <button
          onClick={() => setShowDeleteModal(true)}
          className="cursor-pointer rounded-lg border border-red-500/20 px-3 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10 hover:border-red-500/30 transition-colors"
        >
          Delete
        </button>
      </div>

      {showDeleteModal && (
        <DeleteConfirmModal
          bookTitle={book.title}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}
    </div>
  );
}
