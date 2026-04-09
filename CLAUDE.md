# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Imaginify is an AI-enhanced e-book reader that generates illustrations to accompany text as the user reads. It pairs AI-generated visualizations (comic panels, watercolor illustrations, etc.) with the current reading content. Private/non-commercial use only.

## Build & Run Commands

### Local Development (Recommended)

Run from project root to start both backend and frontend together:

```bash
./dev.sh          # uses beta stage (default)
./dev.sh gamma    # uses gamma stage
```

This script:
- Starts the backend with the specified stage's AWS resources
- Waits for the backend to be healthy
- Starts the frontend dev server
- Cleans up both on Ctrl+C

### Backend (Spring Boot + Gradle)

All commands run from `backend/`:

```bash
cd backend
./gradlew build                      # compile + test
./gradlew bootRun                    # run on port 8080
./gradlew test                       # run all tests (JUnit 5)
./gradlew test --tests "com.imaginify.ImaginifyApplicationTests"  # run single test class
./gradlew test --tests "*.ImaginifyApplicationTests.contextLoads" # run single test method
./gradlew bootJar                    # build executable JAR
./gradlew packageLambda              # build Lambda deployment package
./gradlew packageEventHandler        # build event handler ZIP
./gradlew packageImageGenerationHandler  # build image generation handler ZIP
./gradlew clean                      # clean build artifacts
```

- Java 21 required
- Spring Boot 3.5.5, Gradle (wrapper included)
- AWS SDK v2 (BOM 2.29.45) for DynamoDB, S3, Secrets Manager, Lambda
- Set `aws.dynamodb.endpoint` in `application.yml` to override for local DynamoDB testing
- Tests use `@MockitoBean` to mock AWS clients (DynamoDbClient, S3Client, etc.) so no real AWS credentials needed
- **Running against a deployed stage** — override resource names via args:
  ```bash
  ./gradlew bootRun --args='--aws.dynamodb.table-name=imaginify-books-beta --aws.s3.bucket-name=imaginify-images-beta-115417277634 --aws.secrets-manager.api-key-secret-id=imaginify/api-keys-beta'
  ```
  Resource naming pattern: `{base-name}-{stage}` (S3 also appends the account ID)

### Infrastructure (AWS CDK + TypeScript)

All commands run from `infrastructure/`:

```bash
cd infrastructure
npm install              # install dependencies
npm run build            # compile TypeScript (tsc)
npm run build:backend    # build all Lambda packages (JAR + ZIPs)
npm test                 # run CDK assertion tests (Jest)
npm run synth            # synthesize CloudFormation templates
npm run deploy:beta      # deploy beta stack (auto-builds backend)
npm run deploy:gamma     # deploy gamma stack (auto-builds backend)
npm run deploy:prod      # deploy prod stack (auto-builds backend)
npm run deploy:all       # deploy all stacks
npx cdk list             # list all stacks
```

- CDK v2, TypeScript 5.x; CDK CLI installed as devDependency (`aws-cdk` package)
- Three stacks: `ImaginifyStack-beta`, `ImaginifyStack-gamma`, `ImaginifyStack-prod`
- All stacks target AWS account 115417277634, us-east-1
- **First-time setup**: CDK bootstrap is required before first deploy: `npx cdk bootstrap aws://115417277634/us-east-1`
- AWS credentials must be configured (`aws configure`) before deploy
- Deploy scripts automatically build backend packages via `predeploy` hooks

### Frontend (React + Vite + TypeScript)

All commands run from `frontend/`:

```bash
cd frontend
npm install              # install dependencies
npm run dev              # start dev server on port 5173
npm run build            # production build to dist/
npm run lint             # run ESLint
npm run preview          # preview production build locally
```

- Vite 7.x, React 19, TypeScript 5.x, Tailwind CSS v4
- Tailwind configured via `@tailwindcss/vite` plugin (no `tailwind.config.js` needed)
- Environment variables in `.env.development` (`VITE_API_BASE_URL`)
- **Local development**: Vite dev server proxies `/library` and `/images` to `http://localhost:8080` (avoids CORS issues). Use `./dev.sh` from project root to start both servers together.

## Architecture

### Frontend Structure (`frontend/src/`)

```
api/
  client.ts              Fetch wrapper with base URL, RFC 7807 error handling
  libraryApi.ts          fetchBooks, deleteBook, initiateUpload, uploadFileToS3
  readerApi.ts           fetchBookDetail, fetchChapterContent
  imageApi.ts            triggerImageGeneration API calls
types/
  book.ts                BookSummary, BookDetail, ChapterContent, ChapterSummary
components/
  Layout.tsx             App shell with header and main content area
  TabNavigation.tsx      Tab-based navigation component (My Books, Library, Reader)
  BookLibrary.tsx        Main container: tab routing, URL-based navigation
  MyBooksPage.tsx        Card grid view of books with upload modal
  LibraryPage.tsx        Table view with detailed book metadata
  ReaderPage.tsx         Book selection grid for e-reader (filters by completed status)
  ChapterReader.tsx      E-reader with pagination, chapter navigation, fullscreen mode
  BookCard.tsx           Book card with metadata, status badge, progress indicators
  StatusBadge.tsx        Reusable status indicator component
  ProgressBar.tsx        Progress indicator for processing/generation status
  EmptyState.tsx         Empty state placeholder component
  UploadBookModal.tsx    File picker + two-step presigned URL upload flow
  DeleteConfirmModal.tsx Styled confirmation dialog (React portal, dark theme)
hooks/
  useBooks.ts            Fetch, refresh, delete books with optimistic updates + polling
App.tsx                  Renders Layout
main.tsx                 React entry point
```

**Key patterns:**
- **Tab routing**: URL-based (`/`, `/library`, `/reader/{bookId}/{chapter}`) with `window.history.replaceState`
- **Cross-page sync**: `refreshTrigger` prop propagates delete/update events between tabs
- **Optimistic updates**: `useBooks` removes items immediately, rolls back on error
- **Polling**: Auto-polls every 3s when any book has `imageStatus === 'GENERATING'`
- **Reader access**: Books must have both `processingStatus === 'COMPLETED'` AND `imageStatus === 'COMPLETED'`

**ChapterReader features:**
- Pagination: ~300 words per page with natural paragraph/sentence breaks
- Chapter navigation: Dropdown selector, prev/next buttons, keyboard arrows
- Fullscreen mode: Press `F` to toggle, `ESC` to exit, dark immersive background
- Prefetching: Loads adjacent chapters when near page boundaries
- Deep linking: `/reader/{bookId}/{chapterNumber}` URLs

### Backend Package Structure (`com.imaginify`)

```
controller/
  LibraryController          REST endpoints for book management
  ImageGenerationController  REST endpoints for image generation

service/
  LibraryService             Book CRUD operations orchestration
  TextParsingService         Extracts metadata + chapters from text files
  SegmentDetectionService    Splits chapters into reading segments
  ChapterSummaryService      AI-powered chapter summarization (Gemini)
  PromptTemplateService      Builds image generation prompts
  QualityAssuranceService    3-layer image validation
  ImageFormattingService     Collage extraction, resize, format conversion
  ImageGenerationOrchestrationService  Full image generation pipeline
  ImageGenerationTriggerService  Triggers async image generation
  StorageService             S3 file operations

service/client/
  AiImageGenerationClient    Interface for image generation providers
  GeminiImageGenerationClient  Gemini image generation implementation
  GrokImageGenerationClient    Grok image generation (stub)
  HuggingFaceImageClient       HuggingFace FLUX model implementation
  TogetherAiImageClient        Together AI image generation
  GeminiTextClient             Gemini text API for summaries
  ClaudeVerificationClient     Claude-based image verification
  GeminiVerificationClient     Gemini-based image verification
  HuggingFaceVerificationClient  HuggingFace-based image verification

handler/
  BookUploadEventHandler       S3-triggered, processes uploads
  ImageGenerationEventHandler  Async image generation with QA retries

repository/
  BookRepository             DynamoDB data access

config/
  AwsConfig                  AWS SDK bean configuration
  DynamoDbConfig             DynamoDB client configuration

model/
  Book                       Book entity with chapters
  Chapter                    Chapter with segments and images
  Segment                    Reading segment with images
  ImageMetadata              Image details (url, dimensions, provider)
  ImageStatus                ENUM: NOT_STARTED, GENERATING, COMPLETED, FAILED
  ProcessingStatus           ENUM: PENDING_UPLOAD, PROCESSING, COMPLETED, FAILED
  TextMetadata               Parsed text metadata (title, author, etc.)
  TextChapter                Parsed chapter data
  PromptContext              Context for prompt generation
  QualityScore               Image quality assessment result

dto/request/
  GenerateImagesRequest      Image generation request
  UploadBookRequest          Book upload request

dto/response/
  BookResponse               Full book details with chapters
  BookSummaryResponse        Book summary for list views
  ChapterContentResponse     Chapter content for reader
  GenerateImagesResponse     Image generation result
  PresignedUploadUrlResponse S3 presigned URL for uploads
  PresignedDownloadUrlResponse  S3 presigned URL for downloads

exception/
  GlobalExceptionHandler     @RestControllerAdvice for error handling
  BookNotFoundException      Book not found (404)
  BookProcessingException    Processing error
  ImageGenerationException   Image generation error
  QualityAssuranceException  QA validation failure

util/
  SlugUtils                  URL slug generation
  ChapterTypeDetector        Detect chapter types (content vs transition)
```

### API Endpoints

- `GET /library/books` — list all books (returns `BookSummaryResponse[]`)
- `GET /library/books/{bookId}` — get book by ID (returns `BookResponse` with chapters)
- `GET /library/books/{bookId}/chapters/{chapterNumber}` — get chapter content for e-reader
- `GET /library/books/search?query=` — search books by title/author
- `POST /library/books/upload-url?filename=X` — initiate upload, get presigned S3 URL
- `DELETE /library/books/{bookId}` — delete book and associated S3 files
- `POST /images/generate` — manually trigger image generation (usually auto-triggered)

### Image Generation Pipeline

`ImageGenerationOrchestrationService` drives the full pipeline:
1. Fetch book metadata from DynamoDB via `BookRepository`
2. For each chapter, build prompt context using `PromptTemplateService` (template at `src/main/resources/prompt-templates/visualization-prompt.txt`)
3. Call AI provider via `AiImageGenerationClient` interface (multiple implementations available)
4. Validate output via `QualityAssuranceService` (three-layer: hard constraints → visual scoring → AI-as-judge)
5. Process images via `ImageFormattingService` (collage extraction, resize, enhance, format conversion)
6. Store to S3 via `StorageService`

**AI Client Implementations:**
- `GeminiImageGenerationClient` — Google Gemini image generation
- `HuggingFaceImageClient` — HuggingFace FLUX model
- `TogetherAiImageClient` — Together AI models
- `GrokImageGenerationClient` — Grok (stub)

**Verification Clients:**
- `ClaudeVerificationClient` — Anthropic Claude for image verification
- `GeminiVerificationClient` — Google Gemini for image verification
- `HuggingFaceVerificationClient` — HuggingFace models for verification

### Infrastructure Stack (`ImaginifyStack`)

Single parameterized stack class instantiated per stage (beta, gamma, prod). Each stack creates:

- **KMS Key** — encrypts Secrets Manager secrets, auto-rotation enabled, alias `alias/imaginify-secrets-{stage}`
- **DynamoDB Table** — `imaginify-books-{stage}`, partition key `bookId` (String), on-demand billing, PITR enabled
- **S3 Bucket** — `imaginify-images-{stage}-115417277634`, SSE-S3, all public access blocked, SSL enforced, CORS enabled for PUT (browser-based presigned URL uploads)
- **Secrets Manager Secret** — `imaginify/api-keys-{stage}`, KMS-encrypted, placeholder values (real keys set manually post-deploy)
- **IAM Role** — `imaginify-backend-role-{stage}`, assumable by Lambda + EC2, least-privilege policies scoped to specific resource ARNs
- **Lambda Function** — `imaginify-backend-{stage}`, Java 21 runtime, Spring Boot via AWS Lambda Web Adapter layer, SnapStart enabled
- **Lambda Alias** — `live` alias pointing to current published version (required for SnapStart)
- **HTTP API Gateway** — `imaginify-api-{stage}`, catch-all `/{proxy+}` route to Lambda, CORS enabled
- **CloudWatch Log Group** — `/aws/lambda/imaginify-backend-{stage}`, 1-week retention (beta/gamma), 6-month retention (prod)
- **Event Handler Lambda** — `imaginify-event-handler-{stage}`, Java 21 runtime, S3-triggered on `books/*.txt`
- **Image Generation Lambda** — `imaginify-image-gen-{stage}`, Java 21 runtime, async-invoked by event handler
- **Event Handler IAM Role** — DynamoDB read/write, S3 read/write on `books/*`, invoke image generation Lambda
- **Image Gen IAM Role** — DynamoDB read/write, S3 write on `books/*/images/*`, Secrets Manager read

Stage differences:
- prod uses `RETAIN` removal policy; beta and gamma use `DESTROY` with `autoDeleteObjects` enabled on S3
- Lambda memory: beta 1024MB, gamma 1536MB, prod 2048MB
- Reserved concurrency: beta 5, gamma 10, prod unlimited

### Text Parsing (`TextParsingService`)

Extracts metadata and chapter structure from uploaded text files:

**Metadata detection** (scans first 100 lines):
- Explicit labels: `Title:`, `Author:`, `By:`, `Written by:`, `Language:`, `Genre:`
- Inline patterns: "Title by Author", "A Novel by Author", "by Author Name"
- Positional: standalone "BY" keyword (with blank line tolerance), author name near title
- Supports initials (F. Scott Fitzgerald), ALL CAPS, hyphenated names

**Chapter detection** with lookahead for titles on separate lines:
- Standard: `Chapter 1`, `CHAPTER ONE`, `Chapter IV: Title`
- Stephen King style: `<< 1 >> TITLE` or `<< 1 >>` with title on next line
- Parts: `P A R T O N E`, `PART TWO: Subtitle` (captures subtitle after decorative lines)
- Sections: `Section 1`, `Book 1`, `Act 1`, `Prologue`, `Epilogue`
- Skips decorative lines (dashes, equals, asterisks) when looking for titles

**Segment detection** (`SegmentDetectionService`): Splits chapters into 2-3 page reading chunks with natural pause points for image generation.

### Book Processing Pipeline

When a `.txt` file is uploaded to the `books/` prefix in S3:

```
S3 PutObject (books/*.txt) → BookUploadEventHandler → ImageGenerationEventHandler → DynamoDB
```

**BookUploadEventHandler** (plain Java Lambda):
1. Downloads file, parses metadata/chapters via `TextParsingService`
2. Generates chapter summaries via `ChapterSummaryService` (uses Gemini API)
3. Uploads chapter text to S3 (`books/{slug}/chapters/01.txt`, etc.)
4. Sets `processingStatus = COMPLETED`
5. Auto-triggers `ImageGenerationEventHandler` via async Lambda invocation

**ImageGenerationEventHandler** (plain Java Lambda):
1. Builds prompts via `PromptTemplateService`
2. Generates images via configured AI client (HuggingFace, Gemini, TogetherAI)
3. Validates via `QualityAssuranceService` (retries up to 5x on QA failure)
4. Stores images to S3, updates chapter `images[]` metadata
5. Sets `imageStatus = COMPLETED`

**Key patterns:**
- **Idempotency**: Conditional PutItem (`processingStatus = PENDING_UPLOAD`) for atomic claim
- **Deletion safety**: All `putItem` calls use `attribute_exists(bookId)` condition to prevent re-creating deleted books. If book is deleted mid-processing, handlers abort gracefully.
- **Incremental saves**: Progress saved after each chapter for resumability
- **Error handling**: Sets status to `FAILED`, does not rethrow to avoid Lambda retries
- **Packaging**: Lean ZIP with AWS SDK + Lambda deps only (no Spring JARs)

### Deployment Architecture

```
Client → HTTP API Gateway → Lambda (Web Adapter + Spring Boot) → DynamoDB/S3/SecretsManager

S3 PutObject (books/*.txt) → BookUploadEventHandler Lambda ─┬→ DynamoDB
                                                             └→ ImageGenerationEventHandler Lambda → S3/DynamoDB
```

**Three Lambda functions:**
1. **Backend Lambda** — Spring Boot via AWS Lambda Web Adapter, handles API requests
2. **BookUploadEventHandler** — S3-triggered, processes book text, invokes image generation
3. **ImageGenerationEventHandler** — Async-invoked, generates and stores images

The backend runs using the [AWS Lambda Web Adapter](https://github.com/awslabs/aws-lambda-web-adapter) layer. **Zero changes to backend Java code needed** — `./gradlew bootRun` works unchanged for local dev.

Environment variables are set on the Lambda function to configure resource names:
- `AWS_DYNAMODB_TABLE_NAME` — DynamoDB table name
- `AWS_S3_BUCKET_NAME` — S3 bucket name
- `AWS_SECRETSMANAGER_API_KEY_SECRET_ID` — Secrets Manager secret name
- `AWS_LAMBDA_EXEC_WRAPPER` — Web Adapter bootstrap (`/opt/bootstrap`)
- `PORT` — App port for Web Adapter (`8080`)
- `AWS_LWA_READINESS_CHECK_PATH` — Health check path (`/actuator/health`)

### Build & Deploy Workflow

Deploy scripts automatically build all backend packages before deploying:

```bash
cd infrastructure
npm run deploy:beta    # builds JAR + ZIPs, deploys beta stack
npm run deploy:gamma   # builds JAR + ZIPs, deploys gamma stack
npm run deploy:prod    # builds JAR + ZIPs, deploys prod stack
```

To build the backend packages independently: `npm run build:backend` (from `infrastructure/`).

This builds:
- `backend/build/lambda/imaginify-backend.jar` — Spring Boot backend
- `backend/build/event-handler/event-handler.zip` — Book upload handler
- `backend/build/image-generation-handler/image-generation-handler.zip` — Image generation handler

### Data Layer

- **DynamoDB**: `imaginify-books` table, partition key `bookId`
  - Book: bookId, slug, title, authors[], genre[], language, processingStatus, imageStatus, uploadTimestamp, chapters[]
  - Chapter: chapterNumber, title, chapterType (CONTENT|TRANSITION), startOffset, textLength, summary, segments[], images[]
  - Segment: segmentNumber, startOffset, endOffset, images[]
  - ImageMetadata: id, url, provider, width, height, format, createdAt, type
  - **Status fields**:
    - `processingStatus`: PENDING_UPLOAD → PROCESSING → COMPLETED | FAILED
    - `imageStatus`: NOT_STARTED → GENERATING → COMPLETED | FAILED
- **S3 paths**:
  - Upload: `books/{uuid}.txt` (temporary, moved after processing)
  - Book file: `books/{slug}/book.txt`
  - Chapters: `books/{slug}/chapters/01.txt`, `02.txt`, etc.
  - Images: `books/{slug}/images/chapter_01/001.png`, etc.
- **Secrets Manager**: `imaginify/api-keys` with `GEMINI_API_KEY`, `HUGGINGFACE_API_KEY`
- **Region**: us-east-1

### Key Design Decisions

- **Image collaging**: generate 10-20 images per collage to reduce API costs (fewer calls)
- **Zero-Trust IAM**: explicit permissions only, no wildcards
- **DynamoDB**: chosen for quick iteration; may migrate to relational DB later
- **Multiple AI providers**: support for Gemini, HuggingFace, Together AI for flexibility and fallback

## Git Conventions

Commit message format: `[Category] Descriptive message`

Categories used: `[Backend]`, `[Frontend]`, `[Infrastructure]`, `[Documentation]`, `[Cleanup]`

## Documentation

Detailed specs in `docs/`:
- `docs/product.md` — product spec, business context, technology alternatives
- `docs/technicalspecs.md` — module specs, DynamoDB schema, prompt templates, testing strategy
- `docs/requirements.md` — functional/non-functional requirements, SLAs, security policies
- `docs/images/diagrams/` — architecture diagrams
