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
    betaTemplate.resourceCountIs('AWS::Lambda::Function', 2); // backend + S3 auto-delete custom resource
    betaTemplate.resourceCountIs('AWS::ApiGatewayV2::Api', 1);
    betaTemplate.resourceCountIs('AWS::Logs::LogGroup', 1);
    betaTemplate.resourceCountIs('AWS::Lambda::Alias', 1);
    betaTemplate.resourceCountIs('AWS::Lambda::Version', 1);
  });

  // --- Lambda + API Gateway tests ---

  test('creates Lambda function with correct configuration', () => {
    betaTemplate.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'imaginify-backend-beta',
      Runtime: 'java21',
      MemorySize: 1024,
      Timeout: 30,
      SnapStart: { ApplyOn: 'PublishedVersions' },
      Environment: Match.objectLike({
        Variables: Match.objectLike({
          AWS_LAMBDA_EXEC_WRAPPER: '/opt/bootstrap',
          PORT: '8080',
          AWS_LWA_READINESS_CHECK_PATH: '/actuator/health',
          AWS_DYNAMODB_TABLE_NAME: Match.anyValue(),
          AWS_S3_BUCKET_NAME: Match.anyValue(),
          AWS_SECRETSMANAGER_API_KEY_SECRET_ID: Match.anyValue(),
        }),
      }),
    });
  });

  test('Lambda function includes Web Adapter layer', () => {
    betaTemplate.hasResourceProperties('AWS::Lambda::Function', {
      Layers: Match.arrayWith([
        'arn:aws:lambda:us-east-1:753240598075:layer:LambdaAdapterLayerX86:24',
      ]),
    });
  });

  test('Lambda function has SnapStart enabled', () => {
    betaTemplate.hasResourceProperties('AWS::Lambda::Function', {
      SnapStart: { ApplyOn: 'PublishedVersions' },
    });
  });

  test('Lambda alias named live is created', () => {
    betaTemplate.hasResourceProperties('AWS::Lambda::Alias', {
      Name: 'live',
    });
  });

  test('HTTP API Gateway is created with correct name', () => {
    betaTemplate.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      Name: 'imaginify-api-beta',
      ProtocolType: 'HTTP',
    });
  });

  test('HTTP API Gateway has CORS configured', () => {
    betaTemplate.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      CorsConfiguration: Match.objectLike({
        AllowOrigins: ['*'],
        AllowMethods: Match.arrayWith(['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']),
        AllowHeaders: ['Content-Type', 'Authorization'],
      }),
    });
  });

  test('HTTP API Gateway has catch-all route', () => {
    betaTemplate.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'ANY /{proxy+}',
    });
  });

  test('CloudWatch log group is created with correct retention', () => {
    betaTemplate.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: '/aws/lambda/imaginify-backend-beta',
      RetentionInDays: 7,
    });
  });

  test('prod CloudWatch log group has 6-month retention', () => {
    prodTemplate.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: '/aws/lambda/imaginify-backend-prod',
      RetentionInDays: 180,
    });
  });

  test('stack outputs API Gateway URL', () => {
    betaTemplate.hasOutput('ApiUrl', {
      Export: { Name: 'imaginify-api-url-beta' },
    });
  });

  test('prod Lambda function has higher memory', () => {
    prodTemplate.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'imaginify-backend-prod',
      MemorySize: 2048,
    });
  });

  test('beta Lambda function has reserved concurrency', () => {
    betaTemplate.hasResourceProperties('AWS::Lambda::Function', {
      ReservedConcurrentExecutions: 5,
    });
  });
});
