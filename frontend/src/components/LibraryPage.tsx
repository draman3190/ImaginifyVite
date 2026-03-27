import { useState, useEffect, useCallback } from 'react';
import { useBooks } from '../hooks/useBooks';
import { generateImages } from '../api/imageApi';

export function LibraryPage() {
  const { books, loading, error, refresh, silentRefresh } = useBooks();

  // Note: useBooks hook automatically polls when imageStatus === 'GENERATING'

  if (loading && books.length === 0) {
    return (
      <div className="flex justify-center py-20">
        <div className="spinner-enchanted h-8 w-8 animate-spin rounded-full border-4" />
      </div>
    );
  }

  if (error && books.length === 0) {
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
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-4 text-6xl">📚</div>
        <h2 className="mb-2 text-xl font-semibold text-text-primary">Library Empty</h2>
        <p className="text-sm text-text-muted">
          Upload some books to see them here
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-text-primary">Book Library</h2>
        <p className="text-sm text-text-muted">{books.length} book{books.length !== 1 ? 's' : ''} in your collection</p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border-subtle">
        <table className="w-full">
          <thead className="bg-raised/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted">
                Title
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted">
                Author
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted">
                Genre
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-text-muted">
                Pages
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-text-muted">
                Chapters
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-text-muted">
                Availability
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-text-muted">
                Illustrations
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {books.map((book) => (
              <tr key={book.bookId} className="hover:bg-raised/30 transition-colors">
                <td className="px-4 py-4">
                  <span className="font-medium text-text-primary">{book.title}</span>
                </td>
                <td className="px-4 py-4">
                  <span className="text-sm text-text-secondary">
                    {book.authors?.join(', ') || 'Unknown'}
                  </span>
                </td>
                <td className="px-4 py-4">
                  {book.genre && book.genre.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {book.genre.map((g) => (
                        <span
                          key={g}
                          className="tag-forest rounded px-2 py-0.5 text-xs"
                        >
                          {g}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-sm text-text-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-4 text-center">
                  <span className="text-sm text-text-secondary">
                    {book.pageCount > 0 ? book.pageCount : '—'}
                  </span>
                </td>
                <td className="px-4 py-4 text-center">
                  <span className="text-sm text-text-secondary">
                    {book.totalChapters > 0 ? book.totalChapters : '—'}
                  </span>
                </td>
                <td className="px-4 py-4 text-center">
                  <StatusPill status={book.processingStatus} />
                </td>
                <td className="px-4 py-4 text-center">
                  <ImageStatusCell
                    bookId={book.bookId}
                    imageStatus={book.imageStatus}
                    isBookReady={book.processingStatus === 'COMPLETED'}
                    onGenerateStarted={silentRefresh}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const getStatusStyle = () => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'PROCESSING':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'PENDING_UPLOAD':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'FAILED':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getStatusLabel = () => {
    switch (status) {
      case 'COMPLETED':
        return 'Ready to Read';
      case 'PROCESSING':
        return 'Analyzing...';
      case 'PENDING_UPLOAD':
        return 'Queued';
      case 'FAILED':
        return 'Unavailable';
      default:
        return status;
    }
  };

  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${getStatusStyle()}`}>
      {getStatusLabel()}
    </span>
  );
}

interface ImageStatusCellProps {
  bookId: string;
  imageStatus: string | null;
  isBookReady: boolean;
  onGenerateStarted: () => void;
}

function ImageStatusCell({ bookId, imageStatus, isBookReady, onGenerateStarted }: ImageStatusCellProps) {
  const [localStatus, setLocalStatus] = useState<'idle' | 'requesting' | 'started' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  // Reset local state when imageStatus from server changes
  useEffect(() => {
    if (imageStatus === 'GENERATING' || imageStatus === 'COMPLETED' || imageStatus === 'FAILED') {
      setLocalStatus('idle');
    }
  }, [imageStatus]);

  const handleGenerate = useCallback(async () => {
    if (localStatus === 'requesting' || localStatus === 'started') return;

    setLocalStatus('requesting');
    setError(null);

    try {
      await generateImages(bookId);
      setLocalStatus('started');
      // Trigger refresh to get updated status from server
      onGenerateStarted();
    } catch (err) {
      setLocalStatus('error');
      setError('Failed to start');
      console.error('Failed to generate images:', err);
    }
  }, [bookId, localStatus, onGenerateStarted]);

  // If book is still processing, images can't be generated yet
  if (!isBookReady) {
    return (
      <span className="text-xs text-text-muted">
        Waiting for book...
      </span>
    );
  }

  // Show status based on imageStatus field from server
  if (imageStatus === 'COMPLETED') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-400">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        Ready
      </span>
    );
  }

  // Show generating state from server OR local optimistic state
  if (imageStatus === 'GENERATING' || localStatus === 'started') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-yellow-400">
        <div className="h-3 w-3 animate-spin rounded-full border-2 border-yellow-400 border-t-transparent" />
        Generating...
      </span>
    );
  }

  // Show requesting state (API call in progress)
  if (localStatus === 'requesting') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-blue-400">
        <div className="h-3 w-3 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
        Starting...
      </span>
    );
  }

  if (imageStatus === 'FAILED' || localStatus === 'error') {
    return (
      <div className="flex flex-col items-center gap-1">
        <span className="text-xs text-red-400">{error || 'Failed'}</span>
        <button
          onClick={handleGenerate}
          className="text-xs text-ethereal-400 hover:text-ethereal-300 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  // Default: NOT_STARTED or null - show Generate button
  return (
    <button
      onClick={handleGenerate}
      disabled={localStatus !== 'idle'}
      className="rounded bg-cosmic-500/20 px-3 py-1 text-xs font-medium text-cosmic-400 border border-cosmic-500/30 hover:bg-cosmic-500/30 transition-colors disabled:opacity-50"
    >
      Generate
    </button>
  );
}
