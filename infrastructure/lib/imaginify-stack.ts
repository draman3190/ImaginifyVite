import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { StageConfig } from './stage-config';

export interface ImaginifyStackProps extends cdk.StackProps {
  readonly stageConfig: StageConfig;
}

export class ImaginifyStack extends cdk.Stack {
  public readonly table: dynamodb.Table;
  public readonly bucket: s3.Bucket;
  public readonly secret: secretsmanager.Secret;
  public readonly encryptionKey: kms.Key;
  public readonly backendRole: iam.Role;

  constructor(scope: Construct, id: string, props: ImaginifyStackProps) {
    super(scope, id, props);

    const { stageConfig } = props;
    const stage = stageConfig.stageName;

    // KMS Key for Secrets Manager encryption
    this.encryptionKey = new kms.Key(this, 'SecretsEncryptionKey', {
      alias: `alias/imaginify-secrets-${stage}`,
      description: `Imaginify Secrets Manager encryption key (${stage})`,
      enableKeyRotation: true,
      removalPolicy: stageConfig.removalPolicy,
    });

    // DynamoDB Table
    this.table = new dynamodb.Table(this, 'BooksTable', {
      tableName: `imaginify-books-${stage}`,
      partitionKey: { name: 'bookId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: stageConfig.removalPolicy,
    });

    // S3 Bucket
    this.bucket = new s3.Bucket(this, 'ImagesBucket', {
      bucketName: `imaginify-images-${stage}-${stageConfig.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: stageConfig.removalPolicy,
      autoDeleteObjects: stageConfig.autoDeleteObjects,
    });

    // Secrets Manager Secret
    this.secret = new secretsmanager.Secret(this, 'ApiKeysSecret', {
      secretName: `imaginify/api-keys-${stage}`,
      description: `Imaginify AI provider API keys (${stage})`,
      encryptionKey: this.encryptionKey,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          geminiApiKey: 'PLACEHOLDER',
          grokApiKey: 'PLACEHOLDER',
        }),
        generateStringKey: '_rotation_token',
      },
    });

    // IAM Role for backend
    this.backendRole = new iam.Role(this, 'BackendRole', {
      roleName: `imaginify-backend-role-${stage}`,
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal('lambda.amazonaws.com'),
        new iam.ServicePrincipal('ec2.amazonaws.com'),
      ),
      maxSessionDuration: cdk.Duration.hours(1),
    });

    // DynamoDB policy
    this.backendRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
        'dynamodb:Query',
        'dynamodb:Scan',
      ],
      resources: [this.table.tableArn],
    }));

    // S3 policy
    this.backendRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:DeleteObject',
      ],
      resources: [`${this.bucket.bucketArn}/*`],
    }));

    this.backendRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['s3:ListBucket'],
      resources: [this.bucket.bucketArn],
    }));

    // Secrets Manager policy
    this.backendRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['secretsmanager:GetSecretValue'],
      resources: [this.secret.secretArn],
    }));

    // KMS policy
    this.backendRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['kms:Decrypt'],
      resources: [this.encryptionKey.keyArn],
    }));

    // CloudWatch Logs policy
    this.backendRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
      ],
      resources: [
        `arn:aws:logs:${stageConfig.region}:${stageConfig.account}:log-group:/aws/imaginify/*`,
      ],
    }));
  }
}
