import { RemovalPolicy } from 'aws-cdk-lib';

export interface StageConfig {
  readonly stageName: string;
  readonly account: string;
  readonly region: string;
  readonly removalPolicy: RemovalPolicy;
  readonly autoDeleteObjects: boolean;
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
  },
  gamma: {
    stageName: 'gamma',
    account: ACCOUNT,
    region: REGION,
    removalPolicy: RemovalPolicy.DESTROY,
    autoDeleteObjects: true,
  },
  prod: {
    stageName: 'prod',
    account: ACCOUNT,
    region: REGION,
    removalPolicy: RemovalPolicy.RETAIN,
    autoDeleteObjects: false,
  },
};
