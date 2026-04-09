# Imaginify

An AI-enhanced e-book reader that generates illustrations to accompany text as you read. Imaginify pairs AI-generated visualizations (comic panels, watercolor illustrations, etc.) with your reading content, creating an immersive visual reading experience.

**Private/non-commercial use only.**

## Features

- Upload text files (.txt) and automatically extract book metadata and chapters
- AI-powered chapter summarization for context-aware image generation
- Multiple AI providers for image generation (Gemini, HuggingFace FLUX, Together AI)
- Quality assurance pipeline with multi-provider verification
- Full-featured e-reader with pagination, chapter navigation, and fullscreen mode
- Real-time processing status updates with polling

## Project Structure

```
imaginify/
├── backend/           # Spring Boot API (Java 21)
├── frontend/          # React + Vite + TypeScript
├── infrastructure/    # AWS CDK (TypeScript)
├── docs/              # Product specs and architecture docs
├── dev.sh             # Local development script
└── CLAUDE.md          # Claude Code guidance
```

## Quick Start

### Prerequisites

- Java 21
- Node.js 18+
- AWS CLI configured with credentials
- Access to AWS account 115417277634

### Local Development

The easiest way to run both backend and frontend together:

```bash
./dev.sh          # uses beta stage (default)
./dev.sh gamma    # uses gamma stage
```

This starts the backend on port 8080 and frontend on port 5173, with hot-reload enabled.

### Manual Setup

**Backend:**
```bash
cd backend
./gradlew bootRun --args='--aws.dynamodb.table-name=imaginify-books-beta --aws.s3.bucket-name=imaginify-images-beta-115417277634 --aws.secrets-manager.api-key-secret-id=imaginify/api-keys-beta'
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

### Deployment

Deploy to AWS using CDK:

```bash
cd infrastructure
npm install
npm run deploy:beta    # Deploy to beta stage
npm run deploy:gamma   # Deploy to gamma stage
npm run deploy:prod    # Deploy to production
```

## Architecture

```
Client → HTTP API Gateway → Lambda (Spring Boot) → DynamoDB/S3

S3 Upload → BookUploadEventHandler → ImageGenerationEventHandler → S3/DynamoDB
```

**Components:**
- **Backend Lambda** — Spring Boot via AWS Lambda Web Adapter
- **BookUploadEventHandler** — S3-triggered book processing
- **ImageGenerationEventHandler** — Async image generation with QA

**AWS Resources:**
- DynamoDB for book metadata
- S3 for file storage (books, chapters, images)
- Secrets Manager for API keys
- API Gateway for HTTP routing

## Documentation

- [CLAUDE.md](./CLAUDE.md) — Detailed build commands and architecture
- [docs/product.md](./docs/product.md) — Product specification
- [docs/technicalspecs.md](./docs/technicalspecs.md) — Technical specifications
- [docs/requirements.md](./docs/requirements.md) — Requirements and SLAs

## Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | Java 21, Spring Boot 3.5.5, Gradle |
| Frontend | React 19, Vite 7, TypeScript 5, Tailwind CSS 4 |
| Infrastructure | AWS CDK v2, TypeScript |
| Database | DynamoDB |
| Storage | S3 |
| AI Providers | Google Gemini, HuggingFace, Together AI, Anthropic Claude |

## License

Private/non-commercial use only.
