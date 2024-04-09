import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AttributeType, Table, BillingMode, StreamViewType } from 'aws-cdk-lib/aws-dynamodb';
import {
  Cors,
  LambdaIntegration,
  RestApi,
  UsagePlan,
} from 'aws-cdk-lib/aws-apigateway';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { RemovalPolicy } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam'
import { Asset } from 'aws-cdk-lib/aws-s3-assets';


export class RestApiCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Creating the DynamoDB table
    const dbTable = new Table(this, 'FileTable', {
      partitionKey: { name: 'pk', type: AttributeType.STRING },
      removalPolicy: RemovalPolicy.DESTROY,
      billingMode: BillingMode.PAY_PER_REQUEST,
      stream: StreamViewType.NEW_AND_OLD_IMAGES
    });

    // Creating the s3 bucket
    const news3Bucket = new s3.Bucket(this, 'fovus-assignment-bucket-1234', {
      removalPolicy : RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess:{
        blockPublicAcls: false,
        blockPublicPolicy: false,
        ignorePublicAcls: false,
        restrictPublicBuckets: false
      }
    });

    
    // Creating CORS Policy for s3 bucket

    const corsConfiguration: s3.CorsRule = {
      allowedOrigins: ['*'],
      allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.POST, s3.HttpMethods.DELETE], 
      allowedHeaders: ['*'], 
      exposedHeaders: [], 
    };

    news3Bucket.addCorsRule(corsConfiguration)

    

    // Granting the access to s3

    news3Bucket.grantPublicAccess();

    // Getting the name of s3 bucket
    new cdk.CfnOutput(this, 'BucketName', {
      value: news3Bucket.bucketName,
    });

    const fileAsset = new Asset(this, 'ScriptAsset', {
      path: './script.sh'
    });


    // Creating API Gateway
    const api = new RestApi(this, 'FileDataRestAPI', {
      restApiName: 'FileDataRestAPI',
      defaultCorsPreflightOptions: {
        allowHeaders: Cors.DEFAULT_HEADERS,
        allowOrigins: Cors.ALL_ORIGINS,
        allowMethods: Cors.ALL_METHODS,
      }
    });

    // // 3. Create our API Key
    // const apiKey = new ApiKey(this, 'ApiKey');

    // Creating usage plan for the API
    const usagePlan = new UsagePlan(this, 'APIUsagePlan', {
      name: 'API Usage Plan',
      apiStages: [
        {
          api,
          stage: api.deploymentStage,
        },
      ],
    });


    // Creating Lambda Functions
    const fileDataLambda = new NodejsFunction(this, 'FileDataLambda', {
      entry: 'resources/endpoints/filedata.ts',
      handler: 'handler',
      environment: {
        TABLE_NAME: dbTable.tableName,
      },
    });

    
    // Grant Lambda functions access to DynamoDB table
    dbTable.grantReadWriteData(fileDataLambda);
    

    //  Define API Gateway endpoint for inserting data in dynamoDB
    const insert = api.root.addResource('insert');

    // Connect Lambda functions to our API Gateway endpoints
    const fileDataIntegration = new LambdaIntegration(fileDataLambda);

    // Define API Gateway methods
   
    insert.addMethod('POST', fileDataIntegration, {
      apiKeyRequired: false,
    });

    // Print the API URL
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: api.url,
    });

    // Create lambda to trigger VM after insert in dynamodb

  const dynamoDbStreamLambda = new NodejsFunction(this, 'DynamoStreamLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: 'resources/endpoints/vmcreation.js',
      environment: {
          TABLE_NAME: dbTable.tableName,
          SCRIPT_BUCKET : fileAsset.s3BucketName,
          SCRIPT_S3_URL : fileAsset.s3ObjectUrl,
          SCRIPT_S3_KEY: fileAsset.s3ObjectKey,
      }
  });
  // Add event source to the dynamodb stream
  dynamoDbStreamLambda.addEventSource(new cdk.aws_lambda_event_sources.DynamoEventSource(dbTable, {
      startingPosition: lambda.StartingPosition.TRIM_HORIZON,
      batchSize:1,
      bisectBatchOnError: true,
      retryAttempts:0,
      enabled:true,
  }));
  dbTable.grantStreamRead(dynamoDbStreamLambda);

  // Giving access for ec2 
  dynamoDbStreamLambda.role?.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2FullAccess'));
  const ec2Permission = new iam.PolicyStatement({
            actions: [
                "ec2:RunInstances",
                "ec2:TerminateInstances",
            ],
            resources: ["*"]
    });
    // Giving access to perform operations on dynamodb    
  const dynamoDbPermission = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                "dynamodb:PutItem",
                "dynamodb:GetItem",
                "dynamodb:UpdateItem",
                "dynamodb:Query",
                "dynamodb:Scan",
                "dynamodb:DeleteItem"
            ],
            resources: [dbTable.tableArn]
    });

    dynamoDbStreamLambda.addToRolePolicy(ec2Permission);
    dynamoDbStreamLambda.addToRolePolicy(dynamoDbPermission);
        // Since this lambda is used launch an Ec2 which in turn download files from S3 bucket,
        // an IAM role 'EC2S3AccessRole' is created and passed to the Ec2 by this lambda at time this is launched
    dynamoDbStreamLambda.role?.addToPrincipalPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['iam:PassRole'],
      resources: ['arn:aws:iam::471112532024:role/EC2S3AccessRole'],
      conditions: {
          StringEquals: {
            'iam:PassedToService': 'ec2.amazonaws.com',
          }
        }
    }));

  }
}
