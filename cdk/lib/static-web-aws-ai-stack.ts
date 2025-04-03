import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3Deployment from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
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
    });

    // API Gateway
    const api = new apigateway.LambdaRestApi(this, "ApiGateway", {
      handler: apiLambda,
      proxy: true, // Direct all API Gateway traffic to Lambda
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
      new cdk.aws_iam.PolicyStatement({
        actions: ["s3:GetObject"],
        resources: [`${websiteBucket.bucketArn}/*`],
        principals: [new cdk.aws_iam.AnyPrincipal()],
      })
    );

    // CloudFront Distribution
    const distribution = new cloudfront.Distribution(this, "CloudFrontDistribution", {
      defaultBehavior: { origin: new origins.S3Origin(websiteBucket) },
    });

    // Deploy frontend to S3
    new s3Deployment.BucketDeployment(this, "DeployWebsite", {
      sources: [s3Deployment.Source.asset(path.join(__dirname, "../../frontend/build"))],
      destinationBucket: websiteBucket,
    });

    // Outputs
    new cdk.CfnOutput(this, "CloudFrontURL", {
      value: distribution.domainName,
    });

    new cdk.CfnOutput(this, "APIEndpoint", {
      value: api.url!,
    });
  }
}
