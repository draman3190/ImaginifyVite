import { apiPost } from './client';
import type { GenerateImagesResponse } from '../types/book';

export function generateImages(bookId: string): Promise<GenerateImagesResponse> {
  return apiPost<GenerateImagesResponse>('/images/generate', { bookId });
}
