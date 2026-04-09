# Imaginify Frontend

React-based web UI for the Imaginify e-book reader.

## Requirements

- Node.js 18+

## Setup & Run

```bash
# Install dependencies
npm install

# Start development server (port 5173)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run linter
npm run lint
```

## Tech Stack

- **React 19** — UI framework
- **Vite 7** — Build tool and dev server
- **TypeScript 5** — Type safety
- **Tailwind CSS 4** — Styling (via `@tailwindcss/vite` plugin)

## Project Structure

```
src/
├── api/
│   ├── client.ts         # Fetch wrapper with error handling
│   ├── libraryApi.ts     # Book management API calls
│   ├── readerApi.ts      # Reader content API calls
│   └── imageApi.ts       # Image generation API calls
├── components/
│   ├── Layout.tsx        # App shell
│   ├── TabNavigation.tsx # Navigation tabs
│   ├── BookLibrary.tsx   # Main container with routing
│   ├── MyBooksPage.tsx   # Card grid view
│   ├── LibraryPage.tsx   # Table view
│   ├── ReaderPage.tsx    # Book selection for reader
│   ├── ChapterReader.tsx # E-reader component
│   ├── BookCard.tsx      # Book card component
│   ├── StatusBadge.tsx   # Status indicator
│   ├── ProgressBar.tsx   # Progress component
│   ├── EmptyState.tsx    # Empty state placeholder
│   ├── UploadBookModal.tsx    # Upload dialog
│   └── DeleteConfirmModal.tsx # Delete confirmation
├── hooks/
│   └── useBooks.ts       # Book data management hook
├── types/
│   └── book.ts           # TypeScript types
├── App.tsx
└── main.tsx
```

## Key Features

**Navigation:**
- URL-based routing (`/`, `/library`, `/reader/{bookId}/{chapter}`)
- Tab navigation between My Books, Library, and Reader views

**E-Reader (ChapterReader):**
- ~300 words per page with natural breaks
- Chapter navigation via dropdown and prev/next buttons
- Keyboard navigation (arrow keys)
- Fullscreen mode (F to toggle, ESC to exit)
- Adjacent chapter prefetching

**Data Management:**
- Optimistic updates for delete operations
- Auto-polling every 3s during image generation
- Cross-tab synchronization via refresh triggers

## Development

The Vite dev server proxies `/library` and `/images` requests to `http://localhost:8080` (the backend). Use the root `./dev.sh` script to start both servers together.

## Environment Variables

Configuration in `.env.development`:

```env
VITE_API_BASE_URL=http://localhost:8080
```
