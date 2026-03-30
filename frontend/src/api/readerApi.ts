import { apiGet } from './client';
import type { BookDetail, ChapterContent } from '../types/book';

export function fetchBookDetail(bookId: string): Promise<BookDetail> {
  return apiGet<BookDetail>(`/library/books/${bookId}`);
}

export function fetchChapterContent(bookId: string, chapterNumber: number): Promise<ChapterContent> {
  return apiGet<ChapterContent>(`/library/books/${bookId}/chapters/${chapterNumber}`);
}
