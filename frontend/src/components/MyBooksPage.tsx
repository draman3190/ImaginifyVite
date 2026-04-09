import { useState, useEffect, useMemo } from 'react';
import { useBooks } from '../hooks/useBooks';
import type { BookSummary } from '../types/book';

interface MyBooksPageProps {
  onUpload: () => void;
  refreshTrigger?: number;
  onRefreshNeeded?: () => void;
}

// Reading progress stored in localStorage
interface ReadingProgress {
  bookId: string;
  currentChapter: number;
  currentPage: number;
  totalPages: number;
  percentComplete: number;
  totalReadingTime: number; // in minutes
  lastReadDate: string | null;
  sessionsCount: number;
  startedDate: string | null;
  completedDate: string | null;
}

interface DailyReading {
  date: string;
  minutes: number;
}

// Get reading progress from localStorage
function getReadingProgress(): Record<string, ReadingProgress> {
  try {
    const data = localStorage.getItem('imaginify-reading-progress');
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

// Get daily reading data from localStorage
function getDailyReading(): DailyReading[] {
  try {
    const data = localStorage.getItem('imaginify-daily-reading');
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

// Generate simulated progress for demo (based on book metadata)
function generateSimulatedProgress(book: BookSummary): ReadingProgress {
  const hash = book.bookId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const isStarted = hash % 3 !== 0; // 2/3 of books are "started"
  const percentComplete = isStarted ? (hash % 100) : 0;
  const totalPages = book.totalChapters * 15; // Estimate 15 pages per chapter

  return {
    bookId: book.bookId,
    currentChapter: Math.floor((percentComplete / 100) * book.totalChapters) + 1,
    currentPage: Math.floor((percentComplete / 100) * totalPages),
    totalPages,
    percentComplete,
    totalReadingTime: isStarted ? (hash % 300) + 10 : 0,
    lastReadDate: isStarted ? getRandomRecentDate(hash) : null,
    sessionsCount: isStarted ? (hash % 20) + 1 : 0,
    startedDate: isStarted ? getRandomPastDate(hash) : null,
    completedDate: percentComplete === 100 ? getRandomRecentDate(hash) : null,
  };
}

function getRandomRecentDate(seed: number): string {
  const daysAgo = seed % 14;
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString();
}

function getRandomPastDate(seed: number): string {
  const daysAgo = (seed % 60) + 14;
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString();
}

// Generate simulated weekly reading data
function generateWeeklyData(): DailyReading[] {
  const data: DailyReading[] = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    data.push({
      date: date.toISOString().split('T')[0],
      minutes: Math.floor(Math.random() * 90) + 10,
    });
  }
  return data;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatDate(dateString: string | null): string {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getDayName(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

export function MyBooksPage({ refreshTrigger }: MyBooksPageProps) {
  const { books, loading, error, refresh } = useBooks();
  const [selectedBook, setSelectedBook] = useState<string | null>(null);

  // Refresh when trigger changes
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      refresh();
    }
  }, [refreshTrigger, refresh]);

  // Get or generate reading progress for all books
  const readingData = useMemo(() => {
    const stored = getReadingProgress();
    const result: Record<string, ReadingProgress> = {};

    books.forEach(book => {
      if (book.processingStatus === 'COMPLETED') {
        result[book.bookId] = stored[book.bookId] || generateSimulatedProgress(book);
      }
    });

    return result;
  }, [books]);

  // Weekly reading data
  const weeklyData = useMemo(() => {
    const stored = getDailyReading();
    return stored.length > 0 ? stored.slice(-7) : generateWeeklyData();
  }, []);

  // Calculate aggregate statistics
  const stats = useMemo(() => {
    const completedBooks = books.filter(b => b.processingStatus === 'COMPLETED');
    const progressValues = Object.values(readingData);

    const booksInProgress = progressValues.filter(p => p.percentComplete > 0 && p.percentComplete < 100).length;
    const booksCompleted = progressValues.filter(p => p.percentComplete === 100).length;
    const totalReadingTime = progressValues.reduce((sum, p) => sum + p.totalReadingTime, 0);
    const totalSessions = progressValues.reduce((sum, p) => sum + p.sessionsCount, 0);
    const avgSessionLength = totalSessions > 0 ? Math.round(totalReadingTime / totalSessions) : 0;

    // Calculate streak (consecutive days with reading)
    let streak = 0;
    const today = new Date().toISOString().split('T')[0];
    for (let i = 0; i < 30; i++) {
      const checkDate = new Date();
      checkDate.setDate(checkDate.getDate() - i);
      const dateStr = checkDate.toISOString().split('T')[0];
      const dayReading = weeklyData.find(d => d.date === dateStr);
      if (dayReading && dayReading.minutes > 0) {
        streak++;
      } else if (i > 0) {
        break;
      }
    }

    return {
      totalBooks: completedBooks.length,
      booksInProgress,
      booksCompleted,
      totalReadingTime,
      avgSessionLength,
      totalSessions,
      streak,
      weeklyTotal: weeklyData.reduce((sum, d) => sum + d.minutes, 0),
    };
  }, [books, readingData, weeklyData]);

  // Sort books by last read date
  const sortedBooks = useMemo(() => {
    return books
      .filter(b => b.processingStatus === 'COMPLETED')
      .sort((a, b) => {
        const progressA = readingData[a.bookId];
        const progressB = readingData[b.bookId];
        if (!progressA?.lastReadDate) return 1;
        if (!progressB?.lastReadDate) return -1;
        return new Date(progressB.lastReadDate).getTime() - new Date(progressA.lastReadDate).getTime();
      });
  }, [books, readingData]);

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

  const maxWeeklyMinutes = Math.max(...weeklyData.map(d => d.minutes), 1);

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-bold text-text-primary">Reading Statistics</h2>
        <p className="text-sm text-text-muted mt-1">Track your reading progress and habits</p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<BookIcon />}
          label="Total Books"
          value={stats.totalBooks.toString()}
          subtext={`${stats.booksInProgress} in progress`}
        />
        <StatCard
          icon={<ClockIcon />}
          label="Time Read"
          value={formatDuration(stats.totalReadingTime)}
          subtext={`${formatDuration(stats.weeklyTotal)} this week`}
        />
        <StatCard
          icon={<FireIcon />}
          label="Reading Streak"
          value={`${stats.streak} days`}
          subtext={stats.streak > 0 ? "Keep it up!" : "Start reading!"}
          highlight={stats.streak >= 7}
        />
        <StatCard
          icon={<CheckIcon />}
          label="Completed"
          value={stats.booksCompleted.toString()}
          subtext={`${stats.totalSessions} sessions`}
        />
      </div>

      {/* Weekly Activity */}
      <div className="bg-surface/50 rounded-xl border border-white/10 p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Weekly Activity</h3>
        <div className="flex items-end justify-between gap-2 h-32">
          {weeklyData.map((day, index) => (
            <div key={index} className="flex-1 flex flex-col items-center gap-2">
              <div className="w-full flex flex-col items-center justify-end h-24">
                <div
                  className="w-full max-w-[40px] rounded-t-md transition-all duration-300 hover:opacity-80"
                  style={{
                    height: `${(day.minutes / maxWeeklyMinutes) * 100}%`,
                    minHeight: day.minutes > 0 ? '8px' : '2px',
                    background: day.minutes > 30
                      ? 'linear-gradient(to top, #8B5CF6, #A78BFA)'
                      : day.minutes > 0
                      ? 'linear-gradient(to top, #6366F1, #818CF8)'
                      : 'rgba(255,255,255,0.1)',
                  }}
                />
              </div>
              <span className="text-xs text-text-muted">{getDayName(day.date)}</span>
              <span className="text-xs text-text-secondary font-medium">
                {day.minutes > 0 ? `${day.minutes}m` : '-'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Reading Insights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <InsightCard
          label="Avg Session"
          value={formatDuration(stats.avgSessionLength)}
          icon={<TimerIcon />}
        />
        <InsightCard
          label="Total Sessions"
          value={stats.totalSessions.toString()}
          icon={<SessionIcon />}
        />
        <InsightCard
          label="Completion Rate"
          value={stats.totalBooks > 0 ? `${Math.round((stats.booksCompleted / stats.totalBooks) * 100)}%` : '0%'}
          icon={<PercentIcon />}
        />
      </div>

      {/* Book Progress List */}
      <div className="bg-surface/50 rounded-xl border border-white/10 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10">
          <h3 className="text-lg font-semibold text-text-primary">Book Progress</h3>
        </div>

        {sortedBooks.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-text-muted">No books available yet. Upload some books to start tracking!</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {sortedBooks.map((book) => {
              const progress = readingData[book.bookId];
              const isExpanded = selectedBook === book.bookId;

              return (
                <div key={book.bookId} className="hover:bg-white/[0.02] transition-colors">
                  <button
                    onClick={() => setSelectedBook(isExpanded ? null : book.bookId)}
                    className="w-full px-6 py-4 text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-4">
                      {/* Book Info */}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-text-primary truncate">{book.title}</h4>
                        <p className="text-sm text-text-muted truncate">
                          {book.authors?.join(', ') || 'Unknown author'}
                        </p>
                      </div>

                      {/* Progress */}
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm font-medium text-text-primary">
                            {progress?.percentComplete || 0}%
                          </p>
                          <p className="text-xs text-text-muted">
                            {formatDate(progress?.lastReadDate)}
                          </p>
                        </div>

                        {/* Progress Ring */}
                        <div className="relative w-10 h-10">
                          <svg className="w-10 h-10 -rotate-90">
                            <circle
                              cx="20"
                              cy="20"
                              r="16"
                              fill="none"
                              stroke="rgba(255,255,255,0.1)"
                              strokeWidth="4"
                            />
                            <circle
                              cx="20"
                              cy="20"
                              r="16"
                              fill="none"
                              stroke={progress?.percentComplete === 100 ? '#10B981' : '#8B5CF6'}
                              strokeWidth="4"
                              strokeLinecap="round"
                              strokeDasharray={`${(progress?.percentComplete || 0) * 1.005} 100`}
                            />
                          </svg>
                          {progress?.percentComplete === 100 && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <CheckIcon className="w-4 h-4 text-emerald-400" />
                            </div>
                          )}
                        </div>

                        {/* Expand Icon */}
                        <svg
                          className={`w-5 h-5 text-text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </button>

                  {/* Expanded Details */}
                  {isExpanded && progress && (
                    <div className="px-6 pb-4 pt-0">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-black/20 rounded-lg">
                        <DetailItem label="Chapters" value={`${progress.currentChapter} / ${book.totalChapters}`} />
                        <DetailItem label="Time Spent" value={formatDuration(progress.totalReadingTime)} />
                        <DetailItem label="Sessions" value={progress.sessionsCount.toString()} />
                        <DetailItem label="Started" value={formatDate(progress.startedDate)} />
                        <DetailItem label="Est. Pages" value={`${progress.currentPage} / ${progress.totalPages}`} />
                        <DetailItem
                          label="Est. Remaining"
                          value={progress.percentComplete < 100
                            ? formatDuration(Math.round((progress.totalReadingTime / Math.max(progress.percentComplete, 1)) * (100 - progress.percentComplete)))
                            : 'Done!'
                          }
                        />
                        <DetailItem label="Genre" value={book.genre?.[0] || 'Unknown'} />
                        <DetailItem
                          label="Avg. Pace"
                          value={progress.sessionsCount > 0
                            ? `${Math.round(progress.totalReadingTime / progress.sessionsCount)}m/session`
                            : '-'
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// Stat Card Component
function StatCard({ icon, label, value, subtext, highlight }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtext: string;
  highlight?: boolean;
}) {
  return (
    <div className={`bg-surface/50 rounded-xl border p-4 ${
      highlight
        ? 'border-ethereal-400/30 shadow-[0_0_20px_rgba(251,191,36,0.15)]'
        : 'border-white/10'
    }`}>
      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2 rounded-lg ${highlight ? 'bg-ethereal-500/20' : 'bg-cosmic-500/20'}`}>
          {icon}
        </div>
        <span className="text-sm text-text-muted">{label}</span>
      </div>
      <p className="text-2xl font-bold text-text-primary">{value}</p>
      <p className="text-xs text-text-muted mt-1">{subtext}</p>
    </div>
  );
}

// Insight Card Component
function InsightCard({ icon, label, value }: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-surface/30 rounded-lg border border-white/5 p-4 flex items-center gap-4">
      <div className="p-2.5 rounded-lg bg-cosmic-500/10">
        {icon}
      </div>
      <div>
        <p className="text-xs text-text-muted">{label}</p>
        <p className="text-lg font-semibold text-text-primary">{value}</p>
      </div>
    </div>
  );
}

// Detail Item Component
function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-text-muted">{label}</p>
      <p className="text-sm font-medium text-text-secondary">{value}</p>
    </div>
  );
}

// Icons
function BookIcon({ className = "w-5 h-5 text-cosmic-400" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  );
}

function ClockIcon({ className = "w-5 h-5 text-cosmic-400" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function FireIcon({ className = "w-5 h-5 text-ethereal-400" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
    </svg>
  );
}

function CheckIcon({ className = "w-5 h-5 text-emerald-400" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function TimerIcon({ className = "w-5 h-5 text-cosmic-400" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function SessionIcon({ className = "w-5 h-5 text-cosmic-400" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );
}

function PercentIcon({ className = "w-5 h-5 text-cosmic-400" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  );
}
