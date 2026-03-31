import { createPortal } from 'react-dom';

interface DeleteConfirmModalProps {
  bookTitle: string;
  isDeleting?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmModal({ bookTitle, isDeleting, onConfirm, onCancel }: DeleteConfirmModalProps) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={isDeleting ? undefined : onCancel}
    >
      <div
        className="w-full max-w-sm rounded-xl p-6 shadow-2xl bg-[#191c2a] border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/15 border border-red-500/20">
            {isDeleting ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-red-400 border-t-transparent" />
            ) : (
              <svg
                className="h-5 w-5 text-red-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            )}
          </div>
          <h2 className="text-lg font-semibold text-gray-100">
            {isDeleting ? 'Deleting Book...' : 'Delete Book'}
          </h2>
        </div>

        {isDeleting ? (
          <p className="mb-6 text-sm text-gray-400">
            Please wait while we remove this book from your library.
          </p>
        ) : (
          <>
            <p className="mb-3 text-sm text-gray-400">
              Are you sure you want to delete this book?
            </p>
            <p className="mb-4 rounded-lg bg-white/5 px-3 py-2 text-sm font-medium text-gray-200 border border-white/5">
              {bookTitle}
            </p>
            <p className="mb-6 text-xs text-gray-500">
              This action cannot be undone.
            </p>
          </>
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="cursor-pointer rounded-lg px-4 py-2 text-sm font-medium text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="cursor-pointer rounded-lg bg-red-500/20 border border-red-500/30 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/30 hover:text-red-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
