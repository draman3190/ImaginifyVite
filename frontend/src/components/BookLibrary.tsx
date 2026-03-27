import { useState, useEffect } from 'react';
import { Layout } from './Layout';
import { MyBooksPage } from './MyBooksPage';
import { LibraryPage } from './LibraryPage';
import { UploadBookModal } from './UploadBookModal';

function getTabFromPath(): string {
  const path = window.location.pathname;
  if (path === '/library') return 'library';
  if (path === '/books' || path === '/') return 'my-books';
  return 'my-books';
}

export function BookLibrary() {
  const [activeTab, setActiveTab] = useState(getTabFromPath);
  const [showUpload, setShowUpload] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Sync URL with tab state
  const handleTabChange = (tab: string) => {
    const newPath = tab === 'library' ? '/library' : '/books';
    window.history.pushState({}, '', newPath);
    setActiveTab(tab);
  };

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => setActiveTab(getTabFromPath());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleUploadComplete = () => {
    setShowUpload(false);
    setRefreshTrigger((prev) => prev + 1);
  };

  return (
    <>
      <Layout
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onUploadClick={() => setShowUpload(true)}
      >
        {activeTab === 'my-books' && (
          <MyBooksPage onUpload={() => setShowUpload(true)} refreshTrigger={refreshTrigger} />
        )}
        {activeTab === 'library' && <LibraryPage />}
      </Layout>

      {showUpload && (
        <UploadBookModal
          onClose={() => setShowUpload(false)}
          onUploadComplete={handleUploadComplete}
        />
      )}
    </>
  );
}
