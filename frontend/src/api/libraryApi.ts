import { apiGet, apiPost, apiDelete, putToPresignedUrl } from './client';
import type { BookSummary, PresignedUploadUrlResponse } from '../types/book';

export function fetchBooks(): Promise<BookSummary[]> {
  return apiGet<BookSummary[]>('/library/books');
}

export function deleteBook(bookId: string): Promise<void> {
  return apiDelete<void>(`/library/books/${bookId}`);
}

export function initiateUpload(filename: string): Promise<PresignedUploadUrlResponse> {
  return apiPost<PresignedUploadUrlResponse>(
    `/library/books/upload-url?filename=${encodeURIComponent(filename)}`,
  );
}

export function uploadFileToS3(presignedUrl: string, file: File): Promise<void> {
  return putToPresignedUrl(presignedUrl, file);
}
