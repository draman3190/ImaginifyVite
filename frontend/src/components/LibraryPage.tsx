import { useState, useEffect, useCallback } from 'react';
import { useBooks } from '../hooks/useBooks';
import { generateImages } from '../api/imageApi';
import { DeleteConfirmModal } from './DeleteConfirmModal';

export function LibraryPage() {
  const { books, loading, error, refresh, silentRefresh, deleteBook } = useBooks();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const handleDeleteClick = (bookId: string, title: string) => {
    setOpenMenuId(null);
    setDeleteTarget({ id: bookId, title });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteBook(deleteTarget.id);
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

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

      <div className="rounded-lg border border-border-subtle">
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
              <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-text-muted">
                Actions
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
                <td className="px-4 py-4 text-center">
                  <div className="relative inline-block">
                    <button
                      onClick={() => setOpenMenuId(openMenuId === book.bookId ? null : book.bookId)}
                      className={`p-1.5 rounded transition-all cursor-pointer ${
                        openMenuId === book.bookId
                          ? 'text-ethereal-300 shadow-[0_0_15px_rgba(251,191,36,0.3)]'
                          : 'text-text-secondary hover:text-cosmic-300 hover:shadow-[0_0_10px_rgba(139,92,246,0.2)]'
                      }`}
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                      </svg>
                    </button>
                    {openMenuId === book.bookId && (
                      <div className="absolute left-full top-0 ml-12 w-32 bg-surface border border-ethereal-400/30 rounded-lg shadow-xl shadow-ethereal-500/20 z-50">
                        <button
                          onClick={() => handleDeleteClick(book.bookId, book.title)}
                          className="w-full text-left px-3 py-2 text-sm text-rose-400 hover:bg-rose-500/20 hover:shadow-[inset_0_0_10px_rgba(244,63,94,0.1)] transition-all cursor-pointer rounded-lg"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Click outside to close menu */}
      {openMenuId && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setOpenMenuId(null)}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          bookTitle={deleteTarget.title}
          isDeleting={isDeleting}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const getStatusStyle = () => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
      case 'PROCESSING':
        return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
      case 'PENDING_UPLOAD':
        return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
      case 'FAILED':
        return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
      default:
        return 'bg-gray-500/15 text-gray-400 border-gray-500/30';
    }
  };

  const getStatusLabel = () => {
    switch (status) {
      case 'COMPLETED':
        return 'Ready';
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
      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300">
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
        Done
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
