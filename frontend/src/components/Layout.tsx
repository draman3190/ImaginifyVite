import type { ReactNode } from 'react';
import { TabNavigation } from './TabNavigation';

const TABS = [
  { id: 'my-books', label: 'My Books' },
  { id: 'library', label: 'Library' },
  { id: 'reader', label: 'Reader' },
];

interface LayoutProps {
  children: ReactNode;
  activeTab: string;
  onTabChange: (tabId: string) => void;
  onUploadClick: () => void;
}

export function Layout({ children, activeTab, onTabChange, onUploadClick }: LayoutProps) {
  return (
    <div className="min-h-screen bg-starfield">
      <header className="bg-enchanted-header">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <h1 className="bg-gradient-to-r from-cosmic-400 via-cosmic-300 to-ethereal-400 bg-clip-text text-2xl font-bold text-transparent">
            Imaginify
          </h1>
          {activeTab === 'my-books' && (
            <button
              onClick={onUploadClick}
              className="btn-ethereal rounded-lg px-4 py-2 text-sm font-medium"
            >
              Upload Book
            </button>
          )}
        </div>
      </header>

      <TabNavigation tabs={TABS} activeTab={activeTab} onTabChange={onTabChange} />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}
