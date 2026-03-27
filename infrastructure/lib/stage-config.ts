import { RemovalPolicy } from 'aws-cdk-lib';

export interface StageConfig {
  readonly stageName: string;
  readonly account: string;
  readonly region: string;
  readonly removalPolicy: RemovalPolicy;
  readonly autoDeleteObjects: boolean;
  readonly lambdaMemoryMb: number;
  readonly lambdaTimeoutSeconds: number;
  readonly lambdaReservedConcurrency?: number;
  readonly eventHandlerMemoryMb: number;
  readonly eventHandlerTimeoutSeconds: number;
  readonly imageGenerationMemoryMb: number;
  readonly imageGenerationTimeoutSeconds: number;
}

const ACCOUNT = '115417277634';
const REGION = 'us-east-1';

export const STAGE_CONFIGS: Record<string, StageConfig> = {
  beta: {
    stageName: 'beta',
    account: ACCOUNT,
    region: REGION,
    removalPolicy: RemovalPolicy.DESTROY,
    autoDeleteObjects: true,
    lambdaMemoryMb: 1024,
    lambdaTimeoutSeconds: 30,
    eventHandlerMemoryMb: 512,
    eventHandlerTimeoutSeconds: 900,  // 15 min for AI summarization with rate limit waits
    imageGenerationMemoryMb: 1024,
    imageGenerationTimeoutSeconds: 900,  // 15 min for image generation pipeline
  },
  gamma: {
    stageName: 'gamma',
    account: ACCOUNT,
    region: REGION,
    removalPolicy: RemovalPolicy.DESTROY,
    autoDeleteObjects: true,
    lambdaMemoryMb: 1536,
    lambdaTimeoutSeconds: 30,
    lambdaReservedConcurrency: 10,
    eventHandlerMemoryMb: 768,
    eventHandlerTimeoutSeconds: 900,  // 15 min for AI summarization with rate limit waits
    imageGenerationMemoryMb: 1536,
    imageGenerationTimeoutSeconds: 900,  // 15 min for image generation pipeline
  },
  prod: {
    stageName: 'prod',
    account: ACCOUNT,
    region: REGION,
    removalPolicy: RemovalPolicy.RETAIN,
    autoDeleteObjects: false,
    lambdaMemoryMb: 2048,
    lambdaTimeoutSeconds: 30,
    eventHandlerMemoryMb: 1024,
    eventHandlerTimeoutSeconds: 900,  // 15 min for AI summarization with rate limit waits
    imageGenerationMemoryMb: 2048,
    imageGenerationTimeoutSeconds: 900,  // 15 min for image generation pipeline
  },
};
