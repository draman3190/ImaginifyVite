import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as path from 'path';
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
  public readonly backendFunction: lambda.Function;
  public readonly httpApi: apigatewayv2.HttpApi;
  public readonly eventHandlerFunction: lambda.Function;

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
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT],
          allowedOrigins: ['*'],
          allowedHeaders: ['Content-Type'],
        },
      ],
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
        's3:HeadObject',
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

    // CloudWatch Log Group for Lambda
    const logGroup = new logs.LogGroup(this, 'BackendLogGroup', {
      logGroupName: `/aws/lambda/imaginify-backend-${stage}`,
      retention: stage === 'prod'
        ? logs.RetentionDays.SIX_MONTHS
        : logs.RetentionDays.ONE_WEEK,
      removalPolicy: stageConfig.removalPolicy,
    });

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
        logGroup.logGroupArn,
        `${logGroup.logGroupArn}:*`,
      ],
    }));

    // AWS Lambda Web Adapter layer (enables running Spring Boot in Lambda with zero code changes)
    const webAdapterLayer = lambda.LayerVersion.fromLayerVersionArn(
      this, 'WebAdapterLayer',
      `arn:aws:lambda:${stageConfig.region}:753240598075:layer:LambdaAdapterLayerX86:25`,
    );

    // Lambda Function running Spring Boot via Web Adapter
    this.backendFunction = new lambda.Function(this, 'BackendFunction', {
      functionName: `imaginify-backend-${stage}`,
      runtime: lambda.Runtime.JAVA_21,
      handler: 'run.sh',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/build/lambda')),
      memorySize: stageConfig.lambdaMemoryMb,
      timeout: cdk.Duration.seconds(stageConfig.lambdaTimeoutSeconds),
      role: this.backendRole,
      environment: {
        AWS_LAMBDA_EXEC_WRAPPER: '/opt/bootstrap',
        PORT: '8080',
        AWS_LWA_READINESS_CHECK_PATH: '/actuator/health',
        AWS_DYNAMODB_TABLE_NAME: this.table.tableName,
        AWS_S3_BUCKET_NAME: this.bucket.bucketName,
        AWS_SECRETSMANAGER_API_KEY_SECRET_ID: this.secret.secretName,
      },
      layers: [webAdapterLayer],
      logGroup,
      ...(stageConfig.lambdaReservedConcurrency !== undefined && {
        reservedConcurrentExecutions: stageConfig.lambdaReservedConcurrency,
      }),
    });

    // Lambda alias for SnapStart (SnapStart only applies to published versions)
    const liveAlias = new lambda.Alias(this, 'BackendLiveAlias', {
      aliasName: 'live',
      version: this.backendFunction.currentVersion,
    });

    // HTTP API Gateway
    this.httpApi = new apigatewayv2.HttpApi(this, 'BackendHttpApi', {
      apiName: `imaginify-api-${stage}`,
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [
          apigatewayv2.CorsHttpMethod.GET,
          apigatewayv2.CorsHttpMethod.POST,
          apigatewayv2.CorsHttpMethod.PUT,
          apigatewayv2.CorsHttpMethod.DELETE,
          apigatewayv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['Content-Type', 'Authorization'],
        maxAge: cdk.Duration.hours(1),
      },
    });

    // Catch-all route to Lambda alias
    this.httpApi.addRoutes({
      path: '/{proxy+}',
      methods: [apigatewayv2.HttpMethod.ANY],
      integration: new apigatewayv2Integrations.HttpLambdaIntegration(
        'BackendIntegration',
        liveAlias,
      ),
    });

    // --- Book Upload Event Handler ---

    // CloudWatch Log Group for event handler
    const eventHandlerLogGroup = new logs.LogGroup(this, 'EventHandlerLogGroup', {
      logGroupName: `/aws/lambda/imaginify-event-handler-${stage}`,
      retention: stage === 'prod'
        ? logs.RetentionDays.SIX_MONTHS
        : logs.RetentionDays.ONE_WEEK,
      removalPolicy: stageConfig.removalPolicy,
    });

    // Dedicated IAM Role for event handler (least-privilege)
    const eventHandlerRole = new iam.Role(this, 'EventHandlerRole', {
      roleName: `imaginify-event-handler-role-${stage}`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    eventHandlerRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
      ],
      resources: [this.table.tableArn],
    }));

    eventHandlerRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['s3:GetObject', 's3:PutObject'],
      resources: [`${this.bucket.bucketArn}/books/*`],
    }));

    eventHandlerRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
      ],
      resources: [
        eventHandlerLogGroup.logGroupArn,
        `${eventHandlerLogGroup.logGroupArn}:*`,
      ],
    }));

    // Event handler Lambda Function (plain Java, no Spring)
    this.eventHandlerFunction = new lambda.Function(this, 'EventHandlerFunction', {
      functionName: `imaginify-event-handler-${stage}`,
      runtime: lambda.Runtime.JAVA_21,
      handler: 'com.imaginify.handler.BookUploadEventHandler::handleRequest',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/build/event-handler/event-handler.zip')),
      memorySize: stageConfig.eventHandlerMemoryMb,
      timeout: cdk.Duration.seconds(stageConfig.eventHandlerTimeoutSeconds),
      role: eventHandlerRole,
      environment: {
        TABLE_NAME: this.table.tableName,
        BUCKET_NAME: this.bucket.bucketName,
      },
      logGroup: eventHandlerLogGroup,
    });

    // S3 event notification: trigger event handler on book uploads
    this.bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED_PUT,
      new s3n.LambdaDestination(this.eventHandlerFunction),
      { prefix: 'books/', suffix: '.txt' },
    );

    // Output the API Gateway URL
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.httpApi.apiEndpoint,
      description: `Imaginify API Gateway URL (${stage})`,
      exportName: `imaginify-api-url-${stage}`,
    });
  }
}
