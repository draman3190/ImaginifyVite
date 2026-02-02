# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Imaginify is an AI-enhanced e-book reader that generates illustrations to accompany text as the user reads. It pairs AI-generated visualizations (comic panels, watercolor illustrations, etc.) with the current reading content. Private/non-commercial use only.

## Build & Run Commands

### Backend (Spring Boot + Gradle)

All commands run from `backend/`:

```bash
cd backend
./gradlew build              # compile + test
./gradlew bootRun            # run on port 8080
./gradlew test               # run all tests (JUnit 5)
./gradlew test --tests "com.imaginify.ImaginifyApplicationTests"  # run single test class
./gradlew test --tests "*.ImaginifyApplicationTests.contextLoads" # run single test method
./gradlew bootJar            # build executable JAR
./gradlew packageEventHandler # build event handler ZIP (build/event-handler/event-handler.zip)
./gradlew clean              # clean build artifacts
```

- Java 21 required
- Spring Boot 3.5.5, Gradle 9.3.0 (wrapper included)
- AWS SDK v2 (BOM 2.29.45) for DynamoDB, S3, Secrets Manager
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
npm test                 # run CDK assertion tests (Jest)
npm run synth            # synthesize CloudFormation templates
npm run deploy:beta      # deploy beta stack
npm run deploy:gamma     # deploy gamma stack
npm run deploy:prod      # deploy prod stack
npm run deploy:all       # deploy all stacks
npx cdk list             # list all stacks
```

- CDK v2, TypeScript 5.x; CDK CLI installed as devDependency (`aws-cdk` package)
- Three stacks: `ImaginifyStack-beta`, `ImaginifyStack-gamma`, `ImaginifyStack-prod`
- All stacks target AWS account 115417277634, us-east-1
- **First-time setup**: CDK bootstrap is required before first deploy: `npx cdk bootstrap aws://115417277634/us-east-1`
- AWS credentials must be configured (`aws configure`) before deploy

### Frontend

Not yet set up. `frontend/` directory is empty. Planned as a React app.

## Architecture

### Backend Package Structure (`com.imaginify`)

```
controller/          REST endpoints (ImageGenerationController, LibraryController)
service/             Business logic orchestration
  client/            AI provider interface + implementations (Gemini, Grok)
handler/             Lambda event handlers (BookUploadEventHandler)
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

### Infrastructure Stack (`ImaginifyStack`)

Single parameterized stack class instantiated per stage (beta, gamma, prod). Each stack creates:

- **KMS Key** — encrypts Secrets Manager secrets, auto-rotation enabled, alias `alias/imaginify-secrets-{stage}`
- **DynamoDB Table** — `imaginify-books-{stage}`, partition key `bookId` (String), on-demand billing, PITR enabled
- **S3 Bucket** — `imaginify-images-{stage}-115417277634`, SSE-S3, all public access blocked, SSL enforced
- **Secrets Manager Secret** — `imaginify/api-keys-{stage}`, KMS-encrypted, placeholder values (real keys set manually post-deploy)
- **IAM Role** — `imaginify-backend-role-{stage}`, assumable by Lambda + EC2, least-privilege policies scoped to specific resource ARNs
- **Lambda Function** — `imaginify-backend-{stage}`, Java 21 runtime, Spring Boot via AWS Lambda Web Adapter layer, SnapStart enabled
- **Lambda Alias** — `live` alias pointing to current published version (required for SnapStart)
- **HTTP API Gateway** — `imaginify-api-{stage}`, catch-all `/{proxy+}` route to Lambda, CORS enabled
- **CloudWatch Log Group** — `/aws/lambda/imaginify-backend-{stage}`, 1-week retention (beta/gamma), 6-month retention (prod)
- **Event Handler Lambda** — `imaginify-event-handler-{stage}`, Java 21 runtime, plain Lambda handler (no Web Adapter), triggered by S3 PutObject events on `books/*.txt`
- **Event Handler IAM Role** — `imaginify-event-handler-role-{stage}`, least-privilege: DynamoDB GetItem/PutItem, S3 GetObject on `books/*`, CloudWatch Logs
- **Event Handler Log Group** — `/aws/lambda/imaginify-event-handler-{stage}`, same retention as backend

Stage differences:
- prod uses `RETAIN` removal policy; beta and gamma use `DESTROY` with `autoDeleteObjects` enabled on S3
- Lambda memory: beta 1024MB, gamma 1536MB, prod 2048MB
- Reserved concurrency: beta 5, gamma 10, prod unlimited

### Book Upload Event Processing

When a `.txt` file is uploaded to the `books/` prefix in S3, an event notification triggers `BookUploadEventHandler` — a lightweight Lambda (plain Java, no Spring Boot). It downloads the file, parses metadata and chapters via `TextParsingService`, and updates the DynamoDB book record. This eliminates the need for clients to call `POST /confirm-upload` (kept as manual fallback).

```
S3 PutObject (books/*.txt) → Event Notification → BookUploadEventHandler Lambda → DynamoDB
```

- **Idempotency**: Uses DynamoDB conditional PutItem (`processingStatus = PENDING_UPLOAD`) for atomic claim. Duplicate S3 events are safely skipped.
- **Error handling**: On failure, sets `processingStatus = FAILED` and logs the error. Does not rethrow to avoid infinite Lambda retries.
- **Packaging**: Separate lean ZIP (`build/event-handler/event-handler.zip`) with only AWS SDK + Lambda runtime deps — no Spring JARs.

### Deployment Architecture

```
Client → HTTP API Gateway → Lambda (Web Adapter Layer + Spring Boot JAR) → DynamoDB/S3/SecretsManager
S3 PutObject (books/*.txt) → Event Handler Lambda (plain Java) → DynamoDB
```

The backend runs in Lambda using the [AWS Lambda Web Adapter](https://github.com/awslabs/aws-lambda-web-adapter). This is a Lambda Layer that runs the Spring Boot app inside Lambda and proxies API Gateway HTTP requests to it. **Zero changes to backend Java code are needed** — `./gradlew bootRun` for local development continues to work unchanged.

Environment variables are set on the Lambda function to configure resource names:
- `AWS_DYNAMODB_TABLE_NAME` — DynamoDB table name
- `AWS_S3_BUCKET_NAME` — S3 bucket name
- `AWS_SECRETSMANAGER_API_KEY_SECRET_ID` — Secrets Manager secret name
- `AWS_LAMBDA_EXEC_WRAPPER` — Web Adapter bootstrap (`/opt/bootstrap`)
- `PORT` — App port for Web Adapter (`8080`)
- `AWS_LWA_READINESS_CHECK_PATH` — Health check path (`/actuator/health`)

### Build & Deploy Workflow

Deploy scripts automatically build the backend JAR before deploying:

```bash
cd infrastructure
npm run deploy:beta    # builds JAR + deploys beta stack
npm run deploy:gamma   # builds JAR + deploys gamma stack
npm run deploy:prod    # builds JAR + deploys prod stack
```

To build the backend JAR and event handler ZIP independently: `npm run build:backend` (from `infrastructure/`).

### Data Layer

- **DynamoDB**: `imaginify-books` table, partition key `bookId`. Book entity contains nested Chapter list, each with ImageMetadata list.
- **S3**: `imaginify-images` bucket for generated images
- **Secrets Manager**: `imaginify/api-keys` for AI provider API keys
- **Region**: us-east-1

### Key Design Decisions

- **Image collaging**: generate 10-20 images per collage to reduce API costs (fewer calls)
- **Zero-Trust IAM**: explicit permissions only, no wildcards
- **DynamoDB**: chosen for quick iteration; may migrate to relational DB later

## Git Conventions

Commit message format: `[Category] Descriptive message`

Categories used: `[Backend]`, `[Infrastructure]`, `[Documentation]`, `[Cleanup]`

## Documentation

Detailed specs in `docs/`:
- `docs/product.md` — product spec, business context, technology alternatives
- `docs/technicalspecs.md` — module specs, DynamoDB schema, prompt templates, testing strategy
- `docs/requirements.md` — functional/non-functional requirements, SLAs, security policies
- `docs/images/diagrams/` — architecture diagrams
