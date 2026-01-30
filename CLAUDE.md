# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Imaginify is an AI-enhanced e-book reader that generates illustrations to accompany text as the user reads. It pairs AI-generated visualizations (comic panels, watercolor illustrations, etc.) with the current reading content. Private/non-commercial use only.

## Build & Run Commands

### Backend (Spring Boot + Gradle)

All commands run from `backend/`:

```bash
cd backend
./gradlew build          # compile + test
./gradlew bootRun        # run on port 8080
./gradlew test           # run all tests (JUnit 5)
./gradlew test --tests "com.imaginify.ImaginifyApplicationTests"  # run single test class
./gradlew test --tests "*.ImaginifyApplicationTests.contextLoads" # run single test method
./gradlew bootJar        # build executable JAR
./gradlew clean          # clean build artifacts
```

- Java 21 required
- Spring Boot 3.5.5, Gradle 9.3.0 (wrapper included)
- AWS SDK v2 for DynamoDB, S3, Secrets Manager
- Set `aws.dynamodb.endpoint` in `application.yml` to override for local DynamoDB testing
- Tests use `@MockitoBean` to mock AWS clients (DynamoDbClient, S3Client, etc.) so no real AWS credentials needed

### Frontend & Infrastructure

Not yet set up. `frontend/` and `infrastructure/` directories are empty.
- Frontend: planned React app
- Infrastructure: planned AWS CDK with TypeScript, targeting AWS account 115417277634 with beta/gamma/prod stages

## Architecture

### Backend Package Structure (`com.imaginify`)

```
controller/          REST endpoints (ImageGenerationController, LibraryController)
service/             Business logic orchestration
  client/            AI provider interface + implementations (Gemini, Grok)
repository/          DynamoDB data access (BookRepository)
config/              AWS SDK bean configuration (AwsConfig, DynamoDbConfig)
model/               Domain entities with DynamoDB annotations (Book, Chapter, ImageMetadata)
dto/                 Request/response DTOs (separate from domain models)
exception/           Custom exceptions + GlobalExceptionHandler (@RestControllerAdvice)
```

### API Endpoints

- `POST /images/generate` — trigger image generation for a book (accepts `bookId`)
- `GET /library/books` — list all books
- `GET /library/books/{bookId}` — get book by ID
- `GET /library/books/search?query=` — search books
- `POST /library/books` — upload a book
- `DELETE /library/books/{bookId}` — delete a book

### Image Generation Pipeline

`ImageGenerationOrchestrationService` drives the full pipeline:
1. Fetch book metadata from DynamoDB via `BookRepository`
2. For each chapter, build prompt context using `PromptTemplateService` (template at `src/main/resources/prompt-templates/visualization-prompt.txt`)
3. Call AI provider via `AiImageGenerationClient` interface (Gemini or Grok implementations)
4. Validate output via `QualityAssuranceService` (three-layer: hard constraints → visual scoring → AI-as-judge)
5. Process images via `ImageFormattingService` (collage extraction, resize, enhance, format conversion)
6. Store to S3 via `StorageService`

Several services are stubs throwing `UnsupportedOperationException`: both AI client implementations, QualityAssuranceService, and ImageFormattingService.

### Data Layer

- **DynamoDB**: `imaginify-books` table, partition key `bookId`. Book entity contains nested Chapter list, each with ImageMetadata list.
- **S3**: `imaginify-images` bucket for generated images
- **Secrets Manager**: `imaginify/api-keys` for AI provider API keys
- **Region**: us-east-1

### Key Design Decisions

- **Image collaging**: generate 10-20 images per collage to reduce API costs (fewer calls)
- **Zero-Trust IAM**: explicit permissions only, no wildcards
- **DynamoDB**: chosen for quick iteration; may migrate to relational DB later

## Documentation

Detailed specs in `docs/`:
- `docs/product.md` — product spec, business context, technology alternatives
- `docs/technicalspecs.md` — module specs, DynamoDB schema, prompt templates, testing strategy
- `docs/requirements.md` — functional/non-functional requirements, SLAs, security policies
- `docs/images/diagrams/` — architecture diagrams

## Current Task: Infrastructure as Code (IaC)

Backend API scaffolding is complete. Next step is setting up AWS CDK in `infrastructure/` with TypeScript to define DynamoDB, S3, Lambda, API Gateway, IAM, Secrets Manager, and KMS resources. Deploy to beta first, then gamma, then prod. Do not build frontend or CI/CD pipelines yet.