import { useState, useEffect, useMemo } from 'react';
import { useBooks } from '../hooks/useBooks';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import type { BookSummary } from '../types/book';

interface LibraryPageProps {
  refreshTrigger?: number;
  onRefreshNeeded?: () => void;
}

export function LibraryPage({ refreshTrigger, onRefreshNeeded }: LibraryPageProps) {
  const { books, loading, error, refresh, deleteBook } = useBooks();

  // Refresh when trigger changes (e.g., after delete on another page)
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      refresh();
    }
  }, [refreshTrigger, refresh]);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [imageStatusFilter, setImageStatusFilter] = useState<string>('all');
  const [genreFilter, setGenreFilter] = useState<string>('all');

  // Pagination state
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Get unique genres from all books
  const allGenres = useMemo(() => {
    const genres = new Set<string>();
    books.forEach((book) => {
      book.genre?.forEach((g) => genres.add(g));
    });
    return Array.from(genres).sort();
  }, [books]);

  // Filter books based on search and filters
  const filteredBooks = useMemo(() => {
    return books.filter((book) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const titleMatch = book.title?.toLowerCase().includes(query);
        const authorMatch = book.authors?.some((a) => a.toLowerCase().includes(query));
        if (!titleMatch && !authorMatch) return false;
      }

      // Status filter
      if (statusFilter !== 'all' && book.processingStatus !== statusFilter) {
        return false;
      }

      // Image status filter
      if (imageStatusFilter !== 'all') {
        if (imageStatusFilter === 'NOT_STARTED' && book.imageStatus && book.imageStatus !== 'NOT_STARTED') {
          return false;
        } else if (imageStatusFilter !== 'NOT_STARTED' && book.imageStatus !== imageStatusFilter) {
          return false;
        }
      }

      // Genre filter
      if (genreFilter !== 'all') {
        if (!book.genre?.includes(genreFilter)) return false;
      }

      return true;
    });
  }, [books, searchQuery, statusFilter, imageStatusFilter, genreFilter]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, imageStatusFilter, genreFilter, pageSize]);

  // Calculate pagination
  const totalPages = Math.ceil(filteredBooks.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const displayedBooks = filteredBooks.slice(startIndex, startIndex + pageSize);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Dropdown open states for filters
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // View mode: 'grid' (table) or 'shelf' (bookshelf)
  const [viewMode, setViewMode] = useState<'grid' | 'shelf'>('grid');

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setImageStatusFilter('all');
    setGenreFilter('all');
  };

  const clearDropdownFilters = () => {
    setStatusFilter('all');
    setImageStatusFilter('all');
    setGenreFilter('all');
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'Ready';
      case 'PROCESSING': return 'Analyzing';
      case 'PENDING_UPLOAD': return 'Queued';
      case 'FAILED': return 'Failed';
      default: return status;
    }
  };

  const getImageStatusLabel = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'Done';
      case 'GENERATING': return 'Generating';
      case 'NOT_STARTED': return 'Pending';
      case 'FAILED': return 'Failed';
      default: return status;
    }
  };

  const hasActiveFilters = searchQuery || statusFilter !== 'all' || imageStatusFilter !== 'all' || genreFilter !== 'all';
  const hasActiveDropdownFilters = statusFilter !== 'all' || imageStatusFilter !== 'all' || genreFilter !== 'all';

  const handleDeleteClick = (bookId: string, title: string) => {
    setOpenMenuId(null);
    setDeleteTarget({ id: bookId, title });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);

    // Track start time to ensure minimum display of "Deleting..." state
    const startTime = Date.now();
    const MIN_DELETING_DISPLAY_MS = 500;

    try {
      await deleteBook(deleteTarget.id);

      // Ensure "Deleting..." shows for at least MIN_DELETING_DISPLAY_MS
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_DELETING_DISPLAY_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_DELETING_DISPLAY_MS - elapsed));
      }

      // Notify parent to refresh other pages
      onRefreshNeeded?.();

      // Show success state briefly before closing
      setIsDeleting(false);
      setIsDeleted(true);
      setTimeout(() => {
        setIsDeleted(false);
        setDeleteTarget(null);
      }, 800);
    } catch {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  // Note: useBooks hook automatically polls when imageStatus === 'GENERATING'

  // Render main content based on state
  const renderContent = () => {
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

        {/* Search and Filters */}
        <div className="mb-6">
          <div className="flex flex-wrap items-center gap-4">
            {/* Search bar */}
            <div className="relative w-72">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search by title or author..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full pl-10 pr-8 py-1.5 bg-surface border rounded text-sm placeholder-text-muted focus:outline-none transition-all ${
                  searchQuery
                    ? 'border-ethereal-400/50 shadow-[0_0_15px_rgba(251,191,36,0.3)] text-ethereal-300'
                    : 'border-white/10 text-text-primary focus:border-cosmic-400/50 focus:shadow-[0_0_10px_rgba(139,92,246,0.15)]'
                }`}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Divider */}
            <div className="h-6 w-px bg-white/10" />

            {/* Filters label */}
            <span className={`text-sm font-medium transition-all ${
              openDropdown
                ? 'text-cosmic-300 drop-shadow-[0_0_8px_rgba(139,92,246,0.6)]'
                : hasActiveDropdownFilters
                ? 'text-ethereal-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]'
                : 'text-text-secondary'
            }`}>Filters</span>

            {/* Status filter dropdown */}
            <div className="relative">
              <button
                onClick={() => setOpenDropdown(openDropdown === 'status' ? null : 'status')}
                className={`flex items-center gap-2 text-sm text-text-secondary hover:text-cosmic-300 transition-all px-3 py-1 rounded border cursor-pointer ${
                  openDropdown === 'status'
                    ? 'border-ethereal-400/50 shadow-[0_0_15px_rgba(251,191,36,0.3)]'
                    : statusFilter !== 'all'
                    ? 'border-ethereal-400/50 text-ethereal-300 font-medium shadow-[0_0_15px_rgba(251,191,36,0.3)]'
                    : 'border-white/10 hover:border-cosmic-400/30 hover:shadow-[0_0_10px_rgba(139,92,246,0.15)]'
                }`}
              >
                <span>{statusFilter === 'all' ? 'Availability' : getStatusLabel(statusFilter)}</span>
                <svg className={`w-3 h-3 transition-transform ${openDropdown === 'status' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {openDropdown === 'status' && (
                <div className="absolute top-full left-0 mt-1 w-40 bg-surface border border-ethereal-400/30 rounded-lg shadow-xl shadow-ethereal-500/20 z-50 py-1 max-h-64 overflow-y-auto">
                  {[
                    { value: 'all', label: 'All' },
                    { value: 'COMPLETED', label: 'Ready' },
                    { value: 'PROCESSING', label: 'Analyzing' },
                    { value: 'PENDING_UPLOAD', label: 'Queued' },
                    { value: 'FAILED', label: 'Failed' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setStatusFilter(option.value);
                        setOpenDropdown(null);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-sm transition-colors cursor-pointer ${
                        statusFilter === option.value
                          ? 'text-ethereal-300 font-medium bg-ethereal-500/10'
                          : 'text-text-secondary hover:text-cosmic-300 hover:bg-cosmic-500/10'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Image status filter dropdown */}
            <div className="relative">
              <button
                onClick={() => setOpenDropdown(openDropdown === 'imageStatus' ? null : 'imageStatus')}
                className={`flex items-center gap-2 text-sm text-text-secondary hover:text-cosmic-300 transition-all px-3 py-1 rounded border cursor-pointer ${
                  openDropdown === 'imageStatus'
                    ? 'border-ethereal-400/50 shadow-[0_0_15px_rgba(251,191,36,0.3)]'
                    : imageStatusFilter !== 'all'
                    ? 'border-ethereal-400/50 text-ethereal-300 font-medium shadow-[0_0_15px_rgba(251,191,36,0.3)]'
                    : 'border-white/10 hover:border-cosmic-400/30 hover:shadow-[0_0_10px_rgba(139,92,246,0.15)]'
                }`}
              >
                <span>{imageStatusFilter === 'all' ? 'Illustrations' : getImageStatusLabel(imageStatusFilter)}</span>
                <svg className={`w-3 h-3 transition-transform ${openDropdown === 'imageStatus' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {openDropdown === 'imageStatus' && (
                <div className="absolute top-full left-0 mt-1 w-40 bg-surface border border-ethereal-400/30 rounded-lg shadow-xl shadow-ethereal-500/20 z-50 py-1 max-h-64 overflow-y-auto">
                  {[
                    { value: 'all', label: 'All' },
                    { value: 'COMPLETED', label: 'Done' },
                    { value: 'GENERATING', label: 'Generating' },
                    { value: 'NOT_STARTED', label: 'Pending' },
                    { value: 'FAILED', label: 'Failed' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setImageStatusFilter(option.value);
                        setOpenDropdown(null);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-sm transition-colors cursor-pointer ${
                        imageStatusFilter === option.value
                          ? 'text-ethereal-300 font-medium bg-ethereal-500/10'
                          : 'text-text-secondary hover:text-cosmic-300 hover:bg-cosmic-500/10'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Genre filter dropdown */}
            {allGenres.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setOpenDropdown(openDropdown === 'genre' ? null : 'genre')}
                  className={`flex items-center gap-2 text-sm text-text-secondary hover:text-cosmic-300 transition-all px-3 py-1 rounded border cursor-pointer ${
                    openDropdown === 'genre'
                      ? 'border-ethereal-400/50 shadow-[0_0_15px_rgba(251,191,36,0.3)]'
                      : genreFilter !== 'all'
                      ? 'border-ethereal-400/50 text-ethereal-300 font-medium shadow-[0_0_15px_rgba(251,191,36,0.3)]'
                      : 'border-white/10 hover:border-cosmic-400/30 hover:shadow-[0_0_10px_rgba(139,92,246,0.15)]'
                  }`}
                >
                  <span>{genreFilter === 'all' ? 'Genre' : genreFilter}</span>
                  <svg className={`w-3 h-3 transition-transform ${openDropdown === 'genre' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {openDropdown === 'genre' && (
                  <div className="absolute top-full left-0 mt-1 w-40 bg-surface border border-ethereal-400/30 rounded-lg shadow-xl shadow-ethereal-500/20 z-50 py-1 max-h-64 overflow-y-auto">
                    <button
                      onClick={() => {
                        setGenreFilter('all');
                        setOpenDropdown(null);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-sm transition-colors cursor-pointer ${
                        genreFilter === 'all'
                          ? 'text-ethereal-300 font-medium bg-ethereal-500/10'
                          : 'text-text-secondary hover:text-cosmic-300 hover:bg-cosmic-500/10'
                      }`}
                    >
                      All
                    </button>
                    {allGenres.map((genre) => (
                      <button
                        key={genre}
                        onClick={() => {
                          setGenreFilter(genre);
                          setOpenDropdown(null);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-sm transition-colors cursor-pointer ${
                          genreFilter === genre
                            ? 'text-ethereal-300 font-medium bg-ethereal-500/10'
                            : 'text-text-secondary hover:text-cosmic-300 hover:bg-cosmic-500/10'
                        }`}
                      >
                        {genre}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Clear filters */}
            {hasActiveDropdownFilters && (
              <button
                onClick={clearDropdownFilters}
                className="px-3 py-1 text-xs text-cosmic-300 hover:text-cosmic-200 border border-cosmic-400/30 rounded hover:bg-cosmic-500/10 hover:shadow-[0_0_10px_rgba(139,92,246,0.15)] transition-all cursor-pointer"
              >
                Clear
              </button>
            )}

            {/* Results count */}
            {hasActiveFilters && (
              <span className="text-xs text-text-muted">
                {filteredBooks.length} of {books.length} match
              </span>
            )}

            {/* View mode toggle */}
            <div className="flex items-center gap-1 ml-auto mr-4">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded border transition-all cursor-pointer ${
                  viewMode === 'grid'
                    ? 'border-ethereal-400/50 text-ethereal-300 shadow-[0_0_10px_rgba(251,191,36,0.3)]'
                    : 'border-white/10 text-text-secondary hover:text-cosmic-300 hover:border-cosmic-400/30 hover:shadow-[0_0_10px_rgba(139,92,246,0.15)]'
                }`}
                title="Grid View"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('shelf')}
                className={`p-1.5 rounded border transition-all cursor-pointer ${
                  viewMode === 'shelf'
                    ? 'border-ethereal-400/50 text-ethereal-300 shadow-[0_0_10px_rgba(251,191,36,0.3)]'
                    : 'border-white/10 text-text-secondary hover:text-cosmic-300 hover:border-cosmic-400/30 hover:shadow-[0_0_10px_rgba(139,92,246,0.15)]'
                }`}
                title="Bookshelf View"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </button>
            </div>

            {/* Page size selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted">Show</span>
              <div className="relative">
                <button
                  onClick={() => setOpenDropdown(openDropdown === 'pageSize' ? null : 'pageSize')}
                  className={`flex items-center gap-2 text-sm text-text-secondary hover:text-cosmic-300 transition-all px-2 py-0.5 rounded border cursor-pointer ${
                    openDropdown === 'pageSize'
                      ? 'border-ethereal-400/50 shadow-[0_0_15px_rgba(251,191,36,0.3)]'
                      : 'border-white/10 hover:border-cosmic-400/30 hover:shadow-[0_0_10px_rgba(139,92,246,0.15)]'
                  }`}
                >
                  <span>{pageSize}</span>
                  <svg className={`w-3 h-3 transition-transform ${openDropdown === 'pageSize' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {openDropdown === 'pageSize' && (
                  <div className="absolute top-full right-0 mt-1 w-20 bg-surface border border-ethereal-400/30 rounded-lg shadow-xl shadow-ethereal-500/20 z-50 py-1">
                    {[10, 50, 100].map((size) => (
                      <button
                        key={size}
                        onClick={() => {
                          setPageSize(size);
                          setOpenDropdown(null);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-sm transition-colors cursor-pointer ${
                          pageSize === size
                            ? 'text-ethereal-300 font-medium bg-ethereal-500/10'
                            : 'text-text-secondary hover:text-cosmic-300 hover:bg-cosmic-500/10'
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <span className="text-xs text-text-muted">per page</span>
            </div>
          </div>
        </div>

        {/* Click outside to close dropdown */}
        {openDropdown && (
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpenDropdown(null)}
          />
        )}

        {/* No results message */}
        {filteredBooks.length === 0 && hasActiveFilters && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <svg className="w-12 h-12 text-text-muted mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <h3 className="text-lg font-medium text-text-primary mb-2">No books found</h3>
            <p className="text-sm text-text-muted mb-4">Try adjusting your search or filters</p>
            <button
              onClick={clearFilters}
              className="px-4 py-2 text-sm text-cosmic-300 border border-cosmic-400/30 rounded-lg hover:bg-cosmic-500/10 transition-all cursor-pointer"
            >
              Clear all filters
            </button>
          </div>
        )}

        {filteredBooks.length > 0 && viewMode === 'grid' && (
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
              {displayedBooks.map((book) => (
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
                      imageStatus={book.imageStatus}
                      isBookReady={book.processingStatus === 'COMPLETED'}
                    />
                  </td>
                  <td className="px-4 py-4 text-center">
                    <div className="relative inline-block">
                      <button
                        onClick={() => {
                          setOpenDropdown(null);
                          setOpenMenuId(openMenuId === book.bookId ? null : book.bookId);
                        }}
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

          {/* Pagination controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border-subtle bg-raised/30">
              <span className="text-xs text-text-muted">
                Showing {startIndex + 1}–{Math.min(startIndex + pageSize, filteredBooks.length)} of {filteredBooks.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className={`px-2 py-1 text-xs rounded border transition-all cursor-pointer ${
                    currentPage === 1
                      ? 'border-white/5 text-text-muted cursor-not-allowed'
                      : 'border-white/10 text-text-secondary hover:text-cosmic-300 hover:border-cosmic-400/30 hover:shadow-[0_0_10px_rgba(139,92,246,0.15)]'
                  }`}
                >
                  First
                </button>
                <button
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className={`px-2 py-1 text-xs rounded border transition-all cursor-pointer ${
                    currentPage === 1
                      ? 'border-white/5 text-text-muted cursor-not-allowed'
                      : 'border-white/10 text-text-secondary hover:text-cosmic-300 hover:border-cosmic-400/30 hover:shadow-[0_0_10px_rgba(139,92,246,0.15)]'
                  }`}
                >
                  Prev
                </button>
                <span className="px-3 py-1 text-sm text-text-secondary">
                  Page <span className="text-ethereal-300 font-medium">{currentPage}</span> of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className={`px-2 py-1 text-xs rounded border transition-all cursor-pointer ${
                    currentPage === totalPages
                      ? 'border-white/5 text-text-muted cursor-not-allowed'
                      : 'border-white/10 text-text-secondary hover:text-cosmic-300 hover:border-cosmic-400/30 hover:shadow-[0_0_10px_rgba(139,92,246,0.15)]'
                  }`}
                >
                  Next
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className={`px-2 py-1 text-xs rounded border transition-all cursor-pointer ${
                    currentPage === totalPages
                      ? 'border-white/5 text-text-muted cursor-not-allowed'
                      : 'border-white/10 text-text-secondary hover:text-cosmic-300 hover:border-cosmic-400/30 hover:shadow-[0_0_10px_rgba(139,92,246,0.15)]'
                  }`}
                >
                  Last
                </button>
              </div>
            </div>
          )}
        </div>
        )}

        {/* Bookshelf View */}
        {filteredBooks.length > 0 && viewMode === 'shelf' && (
          <div className="space-y-4">
            {/* Bookshelf cabinet */}
            <div className="relative rounded-lg overflow-hidden" style={{
              background: 'linear-gradient(180deg, #2A1810 0%, #1F120C 100%)',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3), 0 4px 20px rgba(0,0,0,0.4)',
            }}>
              {/* Wood grain texture overlay */}
              <div className="absolute inset-0 opacity-20"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='wood'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.02 0.15' numOctaves='3' seed='1'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23wood)'/%3E%3C/svg%3E")`,
                }}
              />

              {/* Render shelves with books */}
              {Array.from({ length: Math.ceil(displayedBooks.length / 4) }).map((_, shelfIndex) => {
                const shelfBooks = displayedBooks.slice(shelfIndex * 4, (shelfIndex + 1) * 4);
                return (
                  <div key={shelfIndex} className="relative">
                    {/* Shelf back panel */}
                    <div className="absolute inset-x-0 top-0 bottom-4"
                      style={{
                        background: 'linear-gradient(180deg, #1A0F0A 0%, #241610 50%, #1A0F0A 100%)',
                      }}
                    />

                    {/* Books container */}
                    <div className="relative flex items-end gap-2 px-6 pt-4 pb-0 min-h-[260px]">
                      {/* Left bookend */}
                      {shelfIndex === 0 && shelfBooks.length > 0 && (
                        <div className="flex-shrink-0 w-5 h-[180px] mr-2"
                          style={{
                            background: 'linear-gradient(to right, #4A3728, #3D2D22, #2D211A)',
                            borderRadius: '2px',
                            boxShadow: '2px 0 4px rgba(0,0,0,0.3)',
                          }}
                        />
                      )}

                      {shelfBooks.map((book) => (
                        <BookSpine
                          key={book.bookId}
                          book={book}
                          isMenuOpen={openMenuId === book.bookId}
                          onMenuToggle={() => {
                            setOpenDropdown(null);
                            setOpenMenuId(openMenuId === book.bookId ? null : book.bookId);
                          }}
                          onDelete={() => handleDeleteClick(book.bookId, book.title)}
                        />
                      ))}

                      {/* Right bookend */}
                      {shelfBooks.length > 0 && (
                        <div className="flex-shrink-0 w-5 h-[180px] ml-2"
                          style={{
                            background: 'linear-gradient(to left, #4A3728, #3D2D22, #2D211A)',
                            borderRadius: '2px',
                            boxShadow: '-2px 0 4px rgba(0,0,0,0.3)',
                          }}
                        />
                      )}
                    </div>

                    {/* Shelf board - 3D wooden plank */}
                    <div className="relative h-5 mx-2"
                      style={{
                        background: 'linear-gradient(180deg, #5D4037 0%, #4E342E 40%, #3E2723 100%)',
                        borderRadius: '0 0 3px 3px',
                        boxShadow: '0 4px 8px rgba(0,0,0,0.4), inset 0 2px 0 rgba(255,255,255,0.05)',
                      }}
                    >
                      {/* Wood grain on shelf */}
                      <div className="absolute inset-0 opacity-30"
                        style={{
                          backgroundImage: `repeating-linear-gradient(
                            90deg,
                            transparent,
                            transparent 20px,
                            rgba(0,0,0,0.1) 20px,
                            rgba(0,0,0,0.1) 21px
                          )`,
                        }}
                      />
                      {/* Shelf front lip highlight */}
                      <div className="absolute bottom-0 left-0 right-0 h-[3px]"
                        style={{
                          background: 'linear-gradient(180deg, #6D4C41, #5D4037)',
                          borderRadius: '0 0 3px 3px',
                        }}
                      />
                    </div>

                    {/* Shadow under shelf */}
                    <div className="h-3 mx-4"
                      style={{
                        background: 'linear-gradient(180deg, rgba(0,0,0,0.4) 0%, transparent 100%)',
                      }}
                    />
                  </div>
                );
              })}

              {/* Cabinet bottom trim */}
              <div className="h-3 mx-2 -mt-2"
                style={{
                  background: 'linear-gradient(180deg, #3E2723, #2D1F1A)',
                  borderRadius: '0 0 4px 4px',
                }}
              />
            </div>

            {/* Pagination controls for shelf view */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border border-border-subtle rounded-lg bg-raised/30">
                <span className="text-xs text-text-muted">
                  Showing {startIndex + 1}–{Math.min(startIndex + pageSize, filteredBooks.length)} of {filteredBooks.length}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className={`px-2 py-1 text-xs rounded border transition-all cursor-pointer ${
                      currentPage === 1
                        ? 'border-white/5 text-text-muted cursor-not-allowed'
                        : 'border-white/10 text-text-secondary hover:text-cosmic-300 hover:border-cosmic-400/30 hover:shadow-[0_0_10px_rgba(139,92,246,0.15)]'
                    }`}
                  >
                    First
                  </button>
                  <button
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className={`px-2 py-1 text-xs rounded border transition-all cursor-pointer ${
                      currentPage === 1
                        ? 'border-white/5 text-text-muted cursor-not-allowed'
                        : 'border-white/10 text-text-secondary hover:text-cosmic-300 hover:border-cosmic-400/30 hover:shadow-[0_0_10px_rgba(139,92,246,0.15)]'
                    }`}
                  >
                    Prev
                  </button>
                  <span className="px-3 py-1 text-sm text-text-secondary">
                    Page <span className="text-ethereal-300 font-medium">{currentPage}</span> of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className={`px-2 py-1 text-xs rounded border transition-all cursor-pointer ${
                      currentPage === totalPages
                        ? 'border-white/5 text-text-muted cursor-not-allowed'
                        : 'border-white/10 text-text-secondary hover:text-cosmic-300 hover:border-cosmic-400/30 hover:shadow-[0_0_10px_rgba(139,92,246,0.15)]'
                    }`}
                  >
                    Next
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className={`px-2 py-1 text-xs rounded border transition-all cursor-pointer ${
                      currentPage === totalPages
                        ? 'border-white/5 text-text-muted cursor-not-allowed'
                        : 'border-white/10 text-text-secondary hover:text-cosmic-300 hover:border-cosmic-400/30 hover:shadow-[0_0_10px_rgba(139,92,246,0.15)]'
                    }`}
                  >
                    Last
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Click outside to close menu */}
        {openMenuId && (
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpenMenuId(null)}
          />
        )}
      </div>
    );
  };

  return (
    <>
      {renderContent()}

      {deleteTarget && (
        <DeleteConfirmModal
          bookTitle={deleteTarget.title}
          isDeleting={isDeleting}
          isDeleted={isDeleted}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
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
  imageStatus: string | null;
  isBookReady: boolean;
}

function ImageStatusCell({ imageStatus, isBookReady }: ImageStatusCellProps) {
  // If book is still processing, image generation hasn't started yet
  if (!isBookReady) {
    return (
      <span className="text-xs text-text-muted">
        Waiting...
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

  if (imageStatus === 'GENERATING') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-yellow-400">
        <div className="h-3 w-3 animate-spin rounded-full border-2 border-yellow-400 border-t-transparent" />
        Generating...
      </span>
    );
  }

  if (imageStatus === 'FAILED') {
    return (
      <span className="text-xs text-red-400">Failed</span>
    );
  }

  // Default: NOT_STARTED or null - generation will start automatically after book processing
  return (
    <span className="text-xs text-text-muted">Pending</span>
  );
}

// Realistic book spine colors - leather, cloth, and modern covers
const SPINE_STYLES = [
  { bg: '#8B2635', texture: 'leather', text: '#F5E6D3', accent: '#C9A962' }, // Burgundy leather with gold
  { bg: '#1E3A5F', texture: 'cloth', text: '#E8E8E8', accent: '#C0C0C0' },   // Navy cloth with silver
  { bg: '#2D4A3E', texture: 'leather', text: '#F5E6D3', accent: '#C9A962' }, // Forest green leather
  { bg: '#4A3728', texture: 'leather', text: '#F5E6D3', accent: '#C9A962' }, // Brown leather
  { bg: '#483D8B', texture: 'cloth', text: '#E8E8E8', accent: '#DDA0DD' },   // Purple cloth
  { bg: '#8B4513', texture: 'leather', text: '#F5E6D3', accent: '#C9A962' }, // Saddle brown
  { bg: '#191970', texture: 'cloth', text: '#E8E8E8', accent: '#87CEEB' },   // Midnight blue
  { bg: '#800020', texture: 'leather', text: '#F5E6D3', accent: '#C9A962' }, // Burgundy
  { bg: '#2F4F4F', texture: 'cloth', text: '#E8E8E8', accent: '#98FB98' },   // Dark slate
  { bg: '#722F37', texture: 'leather', text: '#F5E6D3', accent: '#C9A962' }, // Wine
];

function getSpineStyle(book: BookSummary) {
  const hash = book.title.split('').reduce((acc, char, i) => acc + char.charCodeAt(0) * (i + 1), 0);
  return SPINE_STYLES[hash % SPINE_STYLES.length];
}

function getSpineDimensions(book: BookSummary) {
  // Height based on chapters/content (taller = more content)
  const baseHeight = 200;
  const heightVariance = book.totalChapters > 0
    ? Math.min(book.totalChapters * 1.5, 40)
    : (book.title.length % 15) * 2;

  // Width based on page count or chapters (wider = more pages) - wider for readable text
  const baseWidth = 48;
  const widthVariance = book.totalChapters > 0
    ? Math.min(book.totalChapters * 0.6, 16)
    : (book.title.length % 10) * 1.2;

  return {
    height: baseHeight + heightVariance,
    width: baseWidth + widthVariance,
  };
}

function getRandomTilt(bookId: string) {
  // Consistent "random" tilt based on book ID
  const hash = bookId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const tiltOptions = [-2, -1, 0, 0, 0, 1, 2]; // Most books straight, some tilted
  return tiltOptions[hash % tiltOptions.length];
}

interface BookSpineProps {
  book: BookSummary;
  isMenuOpen: boolean;
  onMenuToggle: () => void;
  onDelete: () => void;
}

function BookSpine({ book, isMenuOpen, onMenuToggle, onDelete }: BookSpineProps) {
  const style = getSpineStyle(book);
  const { height, width } = getSpineDimensions(book);
  const tilt = getRandomTilt(book.bookId);
  const isReady = book.processingStatus === 'COMPLETED';
  const authorName = book.authors?.[0] || 'Unknown';

  return (
    <div
      className="relative group"
      style={{ transform: `rotate(${tilt}deg)`, transformOrigin: 'bottom center' }}
    >
      {/* Book shadow on shelf */}
      <div
        className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-black/40 blur-sm rounded-full"
        style={{ width: width + 4, height: 6 }}
      />

      {/* Book spine container */}
      <div
        className={`relative cursor-pointer transition-all duration-300 group-hover:-translate-y-3 group-hover:rotate-0 ${
          !isReady ? 'opacity-70' : ''
        }`}
        style={{ height, width }}
        onClick={onMenuToggle}
      >
        {/* Main spine body */}
        <div
          className="absolute inset-0 rounded-[2px]"
          style={{
            background: `linear-gradient(to right,
              ${style.bg} 0%,
              ${adjustBrightness(style.bg, 20)} 15%,
              ${adjustBrightness(style.bg, 10)} 50%,
              ${adjustBrightness(style.bg, -10)} 85%,
              ${adjustBrightness(style.bg, -20)} 100%
            )`,
          }}
        />

        {/* Leather/cloth texture overlay */}
        <div
          className="absolute inset-0 rounded-[2px] opacity-30"
          style={{
            backgroundImage: style.texture === 'leather'
              ? `url("data:image/svg+xml,%3Csvg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`
              : `url("data:image/svg+xml,%3Csvg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.5' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          }}
        />

        {/* Top edge (pages) */}
        <div
          className="absolute -top-[3px] left-[2px] right-[2px] h-[3px] rounded-t-[1px]"
          style={{
            background: 'linear-gradient(to bottom, #F5F5DC, #E8E4D9)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3)',
          }}
        />

        {/* Spine raised edges */}
        <div className="absolute left-0 top-0 bottom-0 w-[2px] rounded-l-[2px]"
          style={{ background: `linear-gradient(to right, ${adjustBrightness(style.bg, 30)}, transparent)` }}
        />
        <div className="absolute right-0 top-0 bottom-0 w-[2px] rounded-r-[2px]"
          style={{ background: `linear-gradient(to left, ${adjustBrightness(style.bg, -30)}, transparent)` }}
        />

        {/* Decorative gold/silver band at top */}
        <div
          className="absolute top-4 left-[3px] right-[3px] h-[2px] rounded-full"
          style={{
            background: `linear-gradient(to bottom, ${style.accent}, ${adjustBrightness(style.accent, -20)})`,
            boxShadow: `0 1px 2px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.3)`,
          }}
        />

        {/* Title and Author - vertical text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden px-1">
          {/* Title */}
          <div
            className="flex items-center justify-center"
            style={{
              writingMode: 'vertical-rl',
              textOrientation: 'mixed',
              transform: 'rotate(180deg)',
              height: height - 60,
              padding: '8px 0',
            }}
          >
            <span
              className="font-bold text-center leading-snug tracking-wide"
              style={{
                color: style.text,
                fontSize: '13px',
                textShadow: `
                  0 1px 0 rgba(0,0,0,0.4),
                  0 2px 4px rgba(0,0,0,0.3),
                  0 0 8px rgba(0,0,0,0.2)
                `,
                letterSpacing: '0.5px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                maxHeight: height - 70,
                fontFamily: 'Georgia, "Times New Roman", serif',
              }}
            >
              {book.title}
            </span>
          </div>

          {/* Author - at bottom with better visibility */}
          <div
            className="absolute bottom-7"
            style={{
              writingMode: 'vertical-rl',
              textOrientation: 'mixed',
              transform: 'rotate(180deg)',
            }}
          >
            <span
              className="font-medium text-center"
              style={{
                color: style.accent,
                fontSize: '9px',
                textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                letterSpacing: '0.3px',
                maxHeight: 60,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontFamily: 'Georgia, "Times New Roman", serif',
              }}
            >
              {authorName}
            </span>
          </div>
        </div>

        {/* Decorative band at bottom */}
        <div
          className="absolute bottom-4 left-[3px] right-[3px] h-[2px] rounded-full"
          style={{
            background: `linear-gradient(to bottom, ${style.accent}, ${adjustBrightness(style.accent, -20)})`,
            boxShadow: `0 1px 2px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.3)`,
          }}
        />

        {/* Processing overlay */}
        {book.processingStatus === 'PROCESSING' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-[2px]">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
          </div>
        )}

        {/* Hover glow effect */}
        <div className="absolute inset-0 rounded-[2px] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
          style={{ boxShadow: '0 0 20px rgba(251, 191, 36, 0.3)' }}
        />
      </div>

      {/* Hover tooltip */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 px-4 py-3 bg-surface/95 backdrop-blur border border-white/20 rounded-lg shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 min-w-[200px]">
        <p className="text-sm font-semibold text-text-primary mb-1">{book.title}</p>
        <p className="text-xs text-text-secondary">{book.authors?.join(', ') || 'Unknown author'}</p>
        {book.genre && book.genre.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {book.genre.map((g) => (
              <span key={g} className="text-[10px] px-1.5 py-0.5 bg-cosmic-500/20 text-cosmic-300 rounded">
                {g}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3 mt-2 pt-2 border-t border-white/10">
          <span className="text-[10px] text-text-muted">
            {book.totalChapters > 0 ? `${book.totalChapters} chapters` : 'Processing...'}
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
            book.processingStatus === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-300' :
            book.processingStatus === 'PROCESSING' ? 'bg-amber-500/20 text-amber-300' :
            book.processingStatus === 'FAILED' ? 'bg-rose-500/20 text-rose-300' :
            'bg-sky-500/20 text-sky-300'
          }`}>
            {book.processingStatus === 'COMPLETED' ? 'Ready' :
             book.processingStatus === 'PROCESSING' ? 'Analyzing' :
             book.processingStatus === 'FAILED' ? 'Failed' : 'Queued'}
          </span>
        </div>
        {/* Tooltip arrow */}
        <div className="absolute left-1/2 -translate-x-1/2 -bottom-2 w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-white/20" />
      </div>

      {/* Action menu */}
      {isMenuOpen && (
        <div className="absolute top-0 left-full ml-2 w-32 bg-surface border border-ethereal-400/30 rounded-lg shadow-xl shadow-ethereal-500/20 z-50">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="w-full text-left px-3 py-2 text-sm text-rose-400 hover:bg-rose-500/20 hover:shadow-[inset_0_0_10px_rgba(244,63,94,0.1)] transition-all cursor-pointer rounded-lg"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// Helper function to adjust color brightness
function adjustBrightness(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, Math.min(255, (num >> 16) + amt));
  const G = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amt));
  const B = Math.max(0, Math.min(255, (num & 0x0000FF) + amt));
  return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
}
