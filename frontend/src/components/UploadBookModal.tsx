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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-xl font-semibold text-gray-900">Upload Book</h2>

        {state === 'select' && (
          <>
            <div
              className="mb-4 flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed border-gray-300 p-8 hover:border-indigo-400"
              onClick={() => fileInputRef.current?.click()}
            >
              <svg
                className="mb-2 h-10 w-10 text-gray-400"
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
                <p className="text-sm font-medium text-gray-900">{selectedFile.name}</p>
              ) : (
                <p className="text-sm text-gray-500">Click to select a .txt file</p>
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
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={!selectedFile}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Upload
              </button>
            </div>
          </>
        )}

        {state === 'uploading' && (
          <div className="flex flex-col items-center py-8">
            <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
            <p className="text-sm text-gray-600">Uploading {selectedFile?.name}...</p>
          </div>
        )}

        {state === 'success' && (
          <div className="flex flex-col items-center py-8">
            <svg className="mb-4 h-12 w-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-sm font-medium text-gray-900">Upload complete!</p>
            <p className="text-xs text-gray-500">Your book is being processed.</p>
          </div>
        )}

        {state === 'error' && (
          <div className="flex flex-col items-center py-8">
            <svg className="mb-4 h-12 w-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <p className="mb-1 text-sm font-medium text-red-700">Upload failed</p>
            <p className="mb-4 text-xs text-gray-500">{error}</p>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
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
