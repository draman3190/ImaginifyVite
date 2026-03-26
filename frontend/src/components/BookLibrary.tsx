import { useState } from 'react';
import { Layout } from './Layout';
import { MyBooksPage } from './MyBooksPage';
import { LibraryPage } from './LibraryPage';
import { UploadBookModal } from './UploadBookModal';

export function BookLibrary() {
  const [activeTab, setActiveTab] = useState('my-books');
  const [showUpload, setShowUpload] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleUploadComplete = () => {
    setShowUpload(false);
    setRefreshTrigger((prev) => prev + 1);
  };

  return (
    <>
      <Layout
        activeTab={activeTab}
        onTabChange={setActiveTab}
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
