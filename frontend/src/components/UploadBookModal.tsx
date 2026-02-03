import { useState, useRef } from 'react';
import { initiateUpload, uploadFileToS3 } from '../api/libraryApi';

interface UploadBookModalProps {
  onClose: () => void;
  onUploadComplete: () => void;
}

type UploadState = 'select' | 'uploading' | 'success' | 'error';

export function UploadBookModal({ onClose, onUploadComplete }: UploadBookModalProps) {
  const [state, setState] = useState<UploadState>('select');
  const [error, setError] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload() {
    if (!selectedFile) return;

    setState('uploading');
    setError('');

    try {
      const { uploadUrl } = await initiateUpload(selectedFile.name);
      await uploadFileToS3(uploadUrl, selectedFile);
      setState('success');
      setTimeout(() => {
        onUploadComplete();
        onClose();
      }, 2000);
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'Upload failed');
    }
  }

  return (
    <div className="modal-fog fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="modal-enchanted w-full max-w-md rounded-xl p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-xl font-semibold text-text-primary">Upload Book</h2>

        {state === 'select' && (
          <>
            <div
              className="dropzone-enchanted mb-4 flex cursor-pointer flex-col items-center rounded-lg p-8"
              onClick={() => fileInputRef.current?.click()}
            >
              <svg
                className="mb-2 h-10 w-10 text-text-muted"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              {selectedFile ? (
                <p className="text-sm font-medium text-ethereal-400">{selectedFile.name}</p>
              ) : (
                <p className="text-sm text-text-muted">Click to select a .txt file</p>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt"
                className="hidden"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={onClose}
                className="cursor-pointer rounded-lg px-4 py-2 text-sm font-medium text-text-secondary hover:bg-raised/50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={!selectedFile}
                className="btn-ethereal rounded-lg px-4 py-2 text-sm font-medium"
              >
                Upload
              </button>
            </div>
          </>
        )}

        {state === 'uploading' && (
          <div className="flex flex-col items-center py-8">
            <div className="spinner-enchanted mb-4 h-8 w-8 animate-spin rounded-full border-4" />
            <p className="text-sm text-text-secondary">Uploading {selectedFile?.name}...</p>
          </div>
        )}

        {state === 'success' && (
          <div className="flex flex-col items-center py-8">
            <svg className="mb-4 h-12 w-12 text-forest-400 drop-shadow-[0_0_8px_rgba(34,197,94,0.4)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-sm font-medium text-text-primary">Upload complete!</p>
            <p className="text-xs text-text-muted">Your book is being processed.</p>
            <p className="mt-3 text-xs text-text-muted">Closing automatically...</p>
          </div>
        )}

        {state === 'error' && (
          <div className="flex flex-col items-center py-8">
            <svg className="mb-4 h-12 w-12 text-red-400 drop-shadow-[0_0_8px_rgba(239,68,68,0.4)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <p className="mb-1 text-sm font-medium text-red-400">Upload failed</p>
            <p className="mb-4 text-xs text-text-muted">{error}</p>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="cursor-pointer rounded-lg px-4 py-2 text-sm font-medium text-text-secondary hover:bg-raised/50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                className="btn-ethereal rounded-lg px-4 py-2 text-sm font-medium"
              >
                Retry
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
