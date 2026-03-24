export interface BookSummary {
  bookId: string;
  title: string;
  authors: string[] | null;
  genre: string[] | null;
  pageCount: number;
  processingStatus: string;
  totalChapters: number;
  processedChapters: number;
  uploadTimestamp: string | null;
}

export interface PresignedUploadUrlResponse {
  bookId: string;
  uploadUrl: string;
  s3Key: string;
  expirationMinutes: number;
}

export interface GenerateImagesResponse {
  bookId: string;
  status: string;
  message: string;
}
