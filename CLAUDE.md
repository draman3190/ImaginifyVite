# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Imaginify is an AI-enhanced e-book reader that generates illustrations to accompany text as the user reads. It pairs AI-generated visualizations (comic panels, watercolor illustrations, etc.) with the current reading content.

**Status**: Pre-implementation phase — comprehensive documentation exists but code scaffolding is minimal (placeholder `src/Main.java` only). The `backend/`, `frontend/`, and `infrastructure/` directories are empty and awaiting implementation.

## Technology Stack

- **Frontend**: React (tablet-first, future mobile/desktop)
- **Backend**: Java + Spring Framework, Python
- **Infrastructure-as-Code**: TypeScript on AWS (Lambda, DynamoDB, S3, API Gateway, CloudFormation, IAM, KMS, Secrets Manager)
- **Image Generation APIs**: Google Gemini Nano Banana or Tesla Grok Imagine

## Build & Run

No build system is configured yet. When scaffolding is set up:
- Backend will likely use Maven or Gradle (Spring project, IntelliJ IDEA module file exists)
- Frontend will use npm/yarn
- Infrastructure will use AWS CDK or CloudFormation CLI with TypeScript

## Architecture

### System Flow
1. User clicks "Download" in Personal Library UI → triggers `POST /images/generate` via API Gateway
2. AI Visualization Generation Lambda processes the request:
   - **Metadata Processing**: splits book by chapter, binds to prompt templates
   - **Image Generation**: calls external AI API with context-bound prompts
   - **Quality Assurance**: three-layer validation (hard constraints → automated visual scoring → AI-as-a-judge)
   - **Post-Processing**: collage extraction, normalization, formatting, enhancement
   - **Storage**: optimized images saved to S3

### Data Layer
- **DynamoDB**: book metadata, chapters, image references (primary key: `bookId`)
- **S3**: EPUB files and generated images
- **Secrets Manager**: API keys (KMS-encrypted)

### Key Design Decisions
- **Serverless event-driven architecture** using AWS Lambda for async image generation
- **Image collaging** to reduce API costs (e.g., 10 images per collage instead of 30 individual calls)
- **Zero-Trust security model**: explicit IAM permissions, no wildcards, MFA enforced
- **DynamoDB chosen** for quick iteration speed; potential future migration to relational DB

## Documentation

Detailed specifications live in `docs/`:
- `docs/product.md` — product spec, business context, technology alternatives analysis
- `docs/technicalspecs.md` — module specs, DynamoDB schema, prompt engineering templates, testing strategy, quality benchmarks
- `docs/requirements.md` — functional/non-functional requirements, SLAs (99.9% uptime), security policies
- `docs/images/diagrams/` — architecture diagrams

## Key Non-Functional Requirements
- Max 10 concurrent users, 500ms image generation latency target
- Max 5 LLM API calls/minute/user
- CPU must not exceed 5% under standard load
- 100% test coverage of critical business logic
- 7-day backup retention with point-in-time recovery
- Dependency scanning must block Critical/High severity vulnerabilities with available patches

## Current Task: Infrastructure as Code (IaC)

### Status Update
- ✅ Backend API scaffolding complete (Spring Boot with DynamoDB integration, image generation endpoints)
- 🔄 Next: Infrastructure deployment
- ⏳ Pending: Frontend development

### Immediate Goals
1. Set up AWS CDK project in `infrastructure/` using TypeScript
2. Define infrastructure resources:
   - DynamoDB tables (book metadata, chapters, image references)
   - S3 buckets (EPUB storage, generated images)
   - Lambda functions (AI image generation)
   - API Gateway (REST endpoints)
   - IAM roles and policies (Zero-Trust model)
   - Secrets Manager (API keys for Gemini/Grok)
   - KMS keys (encryption)
3. Create deployment scripts for beta/gamma/prod environments
4. Set up CloudFormation stacks

### Deployment Configuration
- **AWS Account ID**: 115417277634
- **Environments**: beta, gamma, prod
- Deploy to beta first for initial testing, then gamma for pre-prod validation, then prod

### What NOT to do yet
- Do not build frontend (comes after infrastructure is verified)
- Do not create CI/CD pipelines yet (manual deployment first)
- Focus on getting resources deployed to AWS

### Testing Plan
Once infrastructure is deployed to beta:
1. Verify DynamoDB tables are created
2. Test S3 bucket access
3. Validate Lambda function deployment
4. Test backend API against deployed AWS resources
5. Confirm security policies (IAM, KMS, Secrets Manager)
6. Promote to gamma, then prod after validation

### Starting Point
Begin with AWS CDK TypeScript project setup in `infrastructure/` folder. Reference architecture in `docs/technicalspecs.md` and `docs/images/diagrams/`. Configure for AWS account 115417277634 with beta/gamma/prod stages.