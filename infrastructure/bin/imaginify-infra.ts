#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ImaginifyStack } from '../lib/imaginify-stack';
import { STAGE_CONFIGS } from '../lib/stage-config';

const app = new cdk.App();

for (const [stageName, config] of Object.entries(STAGE_CONFIGS)) {
  new ImaginifyStack(app, `ImaginifyStack-${stageName}`, {
    stageConfig: config,
    env: {
      account: config.account,
      region: config.region,
    },
  });
}
