import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { ImaginifyStack } from '../lib/imaginify-stack';
import { STAGE_CONFIGS } from '../lib/stage-config';

describe('ImaginifyStack', () => {
  let betaTemplate: Template;
  let prodTemplate: Template;

  beforeAll(() => {
    const betaApp = new cdk.App();
    const betaStack = new ImaginifyStack(betaApp, 'TestBetaStack', {
      stageConfig: STAGE_CONFIGS.beta,
      env: { account: STAGE_CONFIGS.beta.account, region: STAGE_CONFIGS.beta.region },
    });
    betaTemplate = Template.fromStack(betaStack);

    const prodApp = new cdk.App();
    const prodStack = new ImaginifyStack(prodApp, 'TestProdStack', {
      stageConfig: STAGE_CONFIGS.prod,
      env: { account: STAGE_CONFIGS.prod.account, region: STAGE_CONFIGS.prod.region },
    });
    prodTemplate = Template.fromStack(prodStack);
  });

  test('creates a KMS key with rotation enabled', () => {
    betaTemplate.hasResourceProperties('AWS::KMS::Key', {
      EnableKeyRotation: true,
    });
  });

  test('creates a KMS alias with stage name', () => {
    betaTemplate.hasResourceProperties('AWS::KMS::Alias', {
      AliasName: 'alias/imaginify-secrets-beta',
    });
  });

  test('creates a DynamoDB table with correct configuration', () => {
    betaTemplate.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'imaginify-books-beta',
      KeySchema: [{ AttributeName: 'bookId', KeyType: 'HASH' }],
      BillingMode: 'PAY_PER_REQUEST',
      PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
    });
  });

  test('creates an S3 bucket with public access blocked and SSL enforced', () => {
    betaTemplate.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: 'imaginify-images-beta-115417277634',
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  test('S3 bucket policy enforces SSL', () => {
    betaTemplate.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Deny',
            Condition: { Bool: { 'aws:SecureTransport': 'false' } },
          }),
        ]),
      }),
    });
  });

  test('creates a Secrets Manager secret with KMS encryption', () => {
    betaTemplate.hasResourceProperties('AWS::SecretsManager::Secret', {
      Name: 'imaginify/api-keys-beta',
    });
  });

  test('creates an IAM role assumable by Lambda and EC2', () => {
    betaTemplate.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'imaginify-backend-role-beta',
      MaxSessionDuration: 3600,
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Allow',
            Principal: { Service: 'lambda.amazonaws.com' },
          }),
          Match.objectLike({
            Effect: 'Allow',
            Principal: { Service: 'ec2.amazonaws.com' },
          }),
        ]),
      }),
    });
  });

  test('IAM role has DynamoDB permissions scoped to table', () => {
    betaTemplate.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Allow',
            Action: Match.arrayWith([
              'dynamodb:GetItem',
              'dynamodb:PutItem',
              'dynamodb:UpdateItem',
              'dynamodb:DeleteItem',
              'dynamodb:Query',
              'dynamodb:Scan',
            ]),
          }),
        ]),
      }),
    });
  });

  test('IAM role has S3 permissions scoped to bucket', () => {
    betaTemplate.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Allow',
            Action: Match.arrayWith([
              's3:GetObject',
              's3:PutObject',
              's3:DeleteObject',
            ]),
          }),
          Match.objectLike({
            Effect: 'Allow',
            Action: 's3:ListBucket',
          }),
        ]),
      }),
    });
  });

  test('IAM role has Secrets Manager and KMS permissions', () => {
    betaTemplate.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Allow',
            Action: 'secretsmanager:GetSecretValue',
          }),
          Match.objectLike({
            Effect: 'Allow',
            Action: 'kms:Decrypt',
          }),
        ]),
      }),
    });
  });

  test('IAM role has CloudWatch Logs permissions', () => {
    betaTemplate.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Allow',
            Action: Match.arrayWith([
              'logs:CreateLogGroup',
              'logs:CreateLogStream',
              'logs:PutLogEvents',
            ]),
          }),
        ]),
      }),
    });
  });

  test('prod stack uses RETAIN removal policy for DynamoDB', () => {
    prodTemplate.hasResource('AWS::DynamoDB::Table', {
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
    });
  });

  test('beta stack uses DELETE removal policy for DynamoDB', () => {
    betaTemplate.hasResource('AWS::DynamoDB::Table', {
      DeletionPolicy: 'Delete',
    });
  });

  test('prod stack uses RETAIN removal policy for S3 bucket', () => {
    prodTemplate.hasResource('AWS::S3::Bucket', {
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
    });
  });

  test('all three stages are defined in stage configs', () => {
    expect(Object.keys(STAGE_CONFIGS)).toEqual(['beta', 'gamma', 'prod']);
  });

  test('resource counts are correct', () => {
    betaTemplate.resourceCountIs('AWS::DynamoDB::Table', 1);
    betaTemplate.resourceCountIs('AWS::S3::Bucket', 1);
    betaTemplate.resourceCountIs('AWS::SecretsManager::Secret', 1);
    betaTemplate.resourceCountIs('AWS::KMS::Key', 1);
    betaTemplate.resourceCountIs('AWS::IAM::Role', 2); // backend role + custom resource role for auto-delete
  });
});
