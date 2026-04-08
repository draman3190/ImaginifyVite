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
          <div className="space-y-8">
            {/* Render books in shelf rows */}
            {Array.from({ length: Math.ceil(displayedBooks.length / 6) }).map((_, shelfIndex) => {
              const shelfBooks = displayedBooks.slice(shelfIndex * 6, (shelfIndex + 1) * 6);
              return (
                <div key={shelfIndex} className="relative">
                  {/* Shelf with books */}
                  <div className="flex items-end gap-3 px-4 pb-3 min-h-[200px]">
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
                  </div>
                  {/* Shelf board */}
                  <div className="h-3 bg-gradient-to-b from-amber-900/40 to-amber-950/60 rounded-sm shadow-[0_4px_8px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1)]" />
                  {/* Shelf bracket shadows */}
                  <div className="absolute -bottom-1 left-4 right-4 h-2 bg-gradient-to-b from-black/20 to-transparent" />
                </div>
              );
            })}

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

// Book spine colors based on genre or hash of title
const SPINE_COLORS = [
  { bg: 'from-rose-900 to-rose-950', text: 'text-rose-100', accent: 'bg-rose-700' },
  { bg: 'from-blue-900 to-blue-950', text: 'text-blue-100', accent: 'bg-blue-700' },
  { bg: 'from-emerald-900 to-emerald-950', text: 'text-emerald-100', accent: 'bg-emerald-700' },
  { bg: 'from-amber-900 to-amber-950', text: 'text-amber-100', accent: 'bg-amber-700' },
  { bg: 'from-purple-900 to-purple-950', text: 'text-purple-100', accent: 'bg-purple-700' },
  { bg: 'from-cyan-900 to-cyan-950', text: 'text-cyan-100', accent: 'bg-cyan-700' },
  { bg: 'from-pink-900 to-pink-950', text: 'text-pink-100', accent: 'bg-pink-700' },
  { bg: 'from-indigo-900 to-indigo-950', text: 'text-indigo-100', accent: 'bg-indigo-700' },
];

function getSpineColor(book: BookSummary) {
  // Use genre to determine color if available, otherwise hash the title
  if (book.genre && book.genre.length > 0) {
    const genreHash = book.genre[0].split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return SPINE_COLORS[genreHash % SPINE_COLORS.length];
  }
  const titleHash = book.title.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return SPINE_COLORS[titleHash % SPINE_COLORS.length];
}

function getSpineHeight(book: BookSummary) {
  // Vary height based on page count or chapters
  const baseHeight = 140;
  const variance = book.totalChapters > 0
    ? Math.min(book.totalChapters * 2, 40)
    : Math.min((book.title.length % 20) * 2, 40);
  return baseHeight + variance;
}

interface BookSpineProps {
  book: BookSummary;
  isMenuOpen: boolean;
  onMenuToggle: () => void;
  onDelete: () => void;
}

function BookSpine({ book, isMenuOpen, onMenuToggle, onDelete }: BookSpineProps) {
  const color = getSpineColor(book);
  const height = getSpineHeight(book);
  const isReady = book.processingStatus === 'COMPLETED';

  return (
    <div className="relative group">
      {/* Book spine */}
      <div
        className={`relative w-12 rounded-sm cursor-pointer transition-all duration-300 group-hover:-translate-y-2 group-hover:shadow-[0_8px_20px_rgba(0,0,0,0.4)] ${
          !isReady ? 'opacity-60' : ''
        }`}
        style={{ height: `${height}px` }}
        onClick={onMenuToggle}
      >
        {/* Spine background with 3D effect */}
        <div className={`absolute inset-0 bg-gradient-to-r ${color.bg} rounded-sm`} />

        {/* Left edge highlight */}
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-white/10 rounded-l-sm" />

        {/* Right edge shadow */}
        <div className="absolute right-0 top-0 bottom-0 w-1 bg-black/30 rounded-r-sm" />

        {/* Top edge */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-white/5 rounded-t-sm" />

        {/* Decorative band at top */}
        <div className={`absolute top-3 left-1 right-1 h-1.5 ${color.accent} rounded-full opacity-60`} />

        {/* Book title - rotated vertically */}
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden p-1">
          <span
            className={`${color.text} text-[10px] font-medium whitespace-nowrap transform -rotate-90 origin-center`}
            style={{
              maxWidth: `${height - 40}px`,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {book.title}
          </span>
        </div>

        {/* Decorative band at bottom */}
        <div className={`absolute bottom-3 left-1 right-1 h-1.5 ${color.accent} rounded-full opacity-60`} />

        {/* Processing indicator */}
        {book.processingStatus === 'PROCESSING' && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/50 border-t-transparent" />
          </div>
        )}

        {/* Status indicator dot */}
        <div className={`absolute bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full ${
          book.processingStatus === 'COMPLETED' ? 'bg-emerald-400' :
          book.processingStatus === 'PROCESSING' ? 'bg-amber-400 animate-pulse' :
          book.processingStatus === 'FAILED' ? 'bg-rose-400' :
          'bg-sky-400'
        }`} />
      </div>

      {/* Hover tooltip */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-surface border border-white/10 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 whitespace-nowrap">
        <p className="text-sm font-medium text-text-primary">{book.title}</p>
        <p className="text-xs text-text-muted">{book.authors?.join(', ') || 'Unknown author'}</p>
        {book.genre && book.genre.length > 0 && (
          <p className="text-xs text-cosmic-300 mt-1">{book.genre.join(', ')}</p>
        )}
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
