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
  imageStatus: string | null; // NOT_STARTED, GENERATING, COMPLETED, FAILED
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

export interface ChapterSummary {
  chapterNumber: number;
  title: string;
  chapterType: string;
  textLength: number;
}

export interface BookDetail {
  bookId: string;
  title: string;
  authors: string[] | null;
  language: string | null;
  genre: string[] | null;
  processingStatus: string;
  chapters: ChapterSummary[];
}

export interface ChapterImage {
  id: string;
  url: string;
  width: number;
  height: number;
}

export interface ChapterContent {
  bookId: string;
  chapterNumber: number;
  title: string;
  chapterType: string;
  content: string;
  textLength: number;
  totalChapters: number;
  hasPrevious: boolean;
  hasNext: boolean;
  images: ChapterImage[];
}
