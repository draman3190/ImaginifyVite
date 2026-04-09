# Imaginify Backend

Spring Boot backend API for the Imaginify e-book reader.

## Requirements

- Java 21
- Gradle (wrapper included)
- AWS credentials configured

## Build & Run

```bash
# Build and test
./gradlew build

# Run locally (connects to beta stage resources)
./gradlew bootRun --args='--aws.dynamodb.table-name=imaginify-books-beta --aws.s3.bucket-name=imaginify-images-beta-115417277634 --aws.secrets-manager.api-key-secret-id=imaginify/api-keys-beta'

# Run tests
./gradlew test

# Build deployment packages
./gradlew packageLambda              # Spring Boot JAR for Lambda
./gradlew packageEventHandler        # Book upload handler ZIP
./gradlew packageImageGenerationHandler  # Image generation handler ZIP
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/library/books` | List all books |
| GET | `/library/books/{bookId}` | Get book details |
| GET | `/library/books/{bookId}/chapters/{num}` | Get chapter content |
| GET | `/library/books/search?query=` | Search books |
| POST | `/library/books/upload-url?filename=X` | Get presigned upload URL |
| DELETE | `/library/books/{bookId}` | Delete book |
| POST | `/images/generate` | Trigger image generation |

## Package Structure

```
com.imaginify/
├── controller/     # REST endpoints
├── service/        # Business logic
│   └── client/     # AI provider clients
├── handler/        # Lambda event handlers
├── repository/     # DynamoDB access
├── config/         # AWS configuration
├── model/          # Domain entities
├── dto/            # Request/response DTOs
├── exception/      # Custom exceptions
└── util/           # Utilities
```

## Lambda Functions

The backend compiles into three deployment packages:

1. **imaginify-backend.jar** — Full Spring Boot application for API Lambda
2. **event-handler.zip** — Lean package for S3-triggered book processing
3. **image-generation-handler.zip** — Lean package for async image generation

Event handlers exclude Spring dependencies for faster cold starts.

## AI Providers

**Image Generation:**
- GeminiImageGenerationClient
- HuggingFaceImageClient (FLUX model)
- TogetherAiImageClient

**Verification:**
- ClaudeVerificationClient
- GeminiVerificationClient
- HuggingFaceVerificationClient

**Text Processing:**
- GeminiTextClient (chapter summaries)

## Configuration

Environment variables (set via Lambda or application.yml):
- `AWS_DYNAMODB_TABLE_NAME`
- `AWS_S3_BUCKET_NAME`
- `AWS_SECRETSMANAGER_API_KEY_SECRET_ID`

## Testing

```bash
# Run all tests
./gradlew test

# Run specific test class
./gradlew test --tests "com.imaginify.ImaginifyApplicationTests"

# Run specific test method
./gradlew test --tests "*.ImaginifyApplicationTests.contextLoads"
```

Tests use `@MockitoBean` to mock AWS clients — no real credentials needed.
