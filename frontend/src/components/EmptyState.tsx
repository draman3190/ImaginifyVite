interface EmptyStateProps {
  onUpload: () => void;
}

export function EmptyState({ onUpload }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <svg
        className="mx-auto mb-4 h-16 w-16 animate-float text-cosmic-500 drop-shadow-[0_0_12px_rgba(139,92,246,0.4)]"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
        />
      </svg>
      <h3 className="mb-1 text-lg font-medium text-text-primary">No books yet</h3>
      <p className="mb-4 text-sm text-text-muted">Upload a book to get started with Imaginify.</p>
      <button
        onClick={onUpload}
        className="btn-ethereal rounded-lg px-4 py-2 text-sm font-medium"
      >
        Upload Book
      </button>
    </div>
  );
}
