# Imaginify Infrastructure

AWS CDK infrastructure-as-code for Imaginify.

## Requirements

- Node.js 18+
- AWS CLI configured with credentials
- CDK bootstrap completed for target account

## Setup

```bash
# Install dependencies
npm install

# First-time setup: bootstrap CDK (one-time per account/region)
npx cdk bootstrap aws://115417277634/us-east-1
```

## Commands

```bash
# Build TypeScript
npm run build

# Build backend packages (JAR + ZIPs)
npm run build:backend

# Run CDK tests
npm test

# Synthesize CloudFormation templates
npm run synth

# Deploy stacks (auto-builds backend)
npm run deploy:beta
npm run deploy:gamma
npm run deploy:prod
npm run deploy:all

# List all stacks
npx cdk list
```

## Stacks

Three identical stacks with stage-specific configuration:

- `ImaginifyStack-beta` — Development/testing
- `ImaginifyStack-gamma` — Staging
- `ImaginifyStack-prod` — Production

## Resources Created

Each stack provisions:

| Resource | Naming Pattern |
|----------|----------------|
| DynamoDB Table | `imaginify-books-{stage}` |
| S3 Bucket | `imaginify-images-{stage}-115417277634` |
| Secrets Manager | `imaginify/api-keys-{stage}` |
| KMS Key | `alias/imaginify-secrets-{stage}` |
| Backend Lambda | `imaginify-backend-{stage}` |
| Event Handler Lambda | `imaginify-event-handler-{stage}` |
| Image Gen Lambda | `imaginify-image-gen-{stage}` |
| API Gateway | `imaginify-api-{stage}` |

## Stage Differences

| Setting | Beta | Gamma | Prod |
|---------|------|-------|------|
| Lambda Memory | 1024 MB | 1536 MB | 2048 MB |
| Reserved Concurrency | 5 | 10 | Unlimited |
| Removal Policy | DESTROY | DESTROY | RETAIN |
| Log Retention | 1 week | 1 week | 6 months |

## Architecture

```
Client → API Gateway → Backend Lambda → DynamoDB/S3/Secrets

S3 (books/*.txt) → Event Handler Lambda ─┬→ DynamoDB
                                          └→ Image Gen Lambda → S3
```

**Lambda Functions:**

1. **Backend Lambda** — Spring Boot via AWS Lambda Web Adapter, SnapStart enabled
2. **Event Handler Lambda** — S3-triggered book processing, invokes image generation
3. **Image Gen Lambda** — Async image generation with QA retries

## IAM Roles

- `imaginify-backend-role-{stage}` — Full access to DynamoDB, S3, Secrets Manager
- Event handler role — DynamoDB, S3, Lambda invoke
- Image gen role — DynamoDB, S3, Secrets Manager read

## Post-Deployment Setup

After deployment, manually set API keys in Secrets Manager:

```bash
aws secretsmanager put-secret-value \
  --secret-id imaginify/api-keys-beta \
  --secret-string '{"GEMINI_API_KEY":"xxx","HUGGINGFACE_API_KEY":"xxx"}'
```

## Project Structure

```
infrastructure/
├── bin/
│   └── infrastructure.ts   # CDK app entry point
├── lib/
│   └── imaginify-stack.ts  # Stack definition
├── test/
│   └── infrastructure.test.ts
├── cdk.json
├── jest.config.js
├── package.json
└── tsconfig.json
```
