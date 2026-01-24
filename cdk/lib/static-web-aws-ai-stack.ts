import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3Deployment from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as iam from "aws-cdk-lib/aws-iam";
import * as path from "path";

export class StaticWebAWSAIStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Lambda Function for API
    const apiLambda = new lambda.Function(this, "ApiLambda", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "lambda.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../../backend")),
      memorySize: 512,
      timeout: cdk.Duration.seconds(60),
    });

    const mediaBucket = new s3.Bucket(this, "MediaBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      publicReadAccess: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
        },
      ],
    });

    apiLambda.addEnvironment("MEDIA_BUCKET", mediaBucket.bucketName);
    apiLambda.addEnvironment(
      "BEDROCK_REGION",
      process.env.BEDROCK_REGION || cdk.Stack.of(this).region
    );
    apiLambda.addEnvironment(
      "BEDROCK_MODEL_ID",
      process.env.BEDROCK_MODEL_ID || "amazon.nova-reel-v1:1"
    );
    apiLambda.addEnvironment(
      "BEDROCK_TITAN_IMAGE_MODEL_ID",
      process.env.BEDROCK_TITAN_IMAGE_MODEL_ID ||
        "amazon.titan-image-generator-v2:0"
    );
    apiLambda.addEnvironment(
      "REPLICATE_API_TOKEN",
      process.env.REPLICATE_API_TOKEN || ""
    );

    apiLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "bedrock:InvokeModel",
          "bedrock:StartAsyncInvoke",
          "bedrock:GetAsyncInvoke",
        ],
        resources: ["*"],
      })
    );

    mediaBucket.grantPut(apiLambda);
    mediaBucket.grantRead(apiLambda);

    mediaBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject"],
        resources: [`${mediaBucket.bucketArn}/images/*`],
        principals: [new iam.ServicePrincipal("bedrock.amazonaws.com")],
      })
    );
    mediaBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ["s3:PutObject"],
        resources: [`${mediaBucket.bucketArn}/videos/*`],
        principals: [new iam.ServicePrincipal("bedrock.amazonaws.com")],
      })
    );

    // API Gateway
    const api = new apigateway.LambdaRestApi(this, "ApiGateway", {
      handler: apiLambda,
      proxy: true, // Direct all API Gateway traffic to Lambda
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    new apigateway.GatewayResponse(this, "ApiGatewayDefault4xx", {
      restApi: api,
      type: apigateway.ResponseType.DEFAULT_4XX,
      responseHeaders: {
        "Access-Control-Allow-Origin": "'*'",
        "Access-Control-Allow-Headers": "'*'",
        "Access-Control-Allow-Methods": "'GET,POST,OPTIONS'",
      },
    });

    new apigateway.GatewayResponse(this, "ApiGatewayDefault5xx", {
      restApi: api,
      type: apigateway.ResponseType.DEFAULT_5XX,
      responseHeaders: {
        "Access-Control-Allow-Origin": "'*'",
        "Access-Control-Allow-Headers": "'*'",
        "Access-Control-Allow-Methods": "'GET,POST,OPTIONS'",
      },
    });

    // S3 Bucket for static site
    const websiteBucket = new s3.Bucket(this, "WebsiteBucket", {
      websiteIndexDocument: "index.html",
      publicReadAccess: false, // Keep this false and use a bucket policy instead
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS, // Block ACLs but allow bucket policy
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Change in production
    });
    
    // Add a bucket policy to allow public read access
    websiteBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject"],
        resources: [`${websiteBucket.bucketArn}/*`],
        principals: [new iam.AnyPrincipal()],
      })
    );

    // CloudFront Distribution
    const distribution = new cloudfront.Distribution(this, "CloudFrontDistribution", {
      defaultBehavior: { origin: new origins.S3Origin(websiteBucket) },
    });

    const frontendApiUrl = process.env.REACT_APP_API_URL || "";

    // Deploy frontend to S3
    new s3Deployment.BucketDeployment(this, "DeployWebsite", {
      sources: [
        s3Deployment.Source.asset(
          path.join(__dirname, "../../frontend/build")
        ),
        s3Deployment.Source.data(
          "config.json",
          JSON.stringify({ apiBaseUrl: frontendApiUrl })
        ),
      ],
      destinationBucket: websiteBucket,
      distribution,
      distributionPaths: ["/*"],
    });

    // Outputs
    new cdk.CfnOutput(this, "CloudFrontURL", {
      value: distribution.domainName,
    });

    new cdk.CfnOutput(this, "APIEndpoint", {
      value: api.url!,
    });

    new cdk.CfnOutput(this, "MediaBucketName", {
      value: mediaBucket.bucketName,
    });
  }
}
