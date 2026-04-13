import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3Deployment from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as path from "path";
import { resolveStageName } from "./stage";

export interface UiOnlyStackProps extends cdk.StackProps {
  stage: string;
  /** API Gateway endpoint URL from the backend (full) stack */
  backendApiEndpoint: string;
  /** Cognito User Pool ID from the backend stack (e.g. us-east-1_XXXXXX) */
  backendUserPoolId: string;
  /** Full Cognito hosted-UI domain URL from the backend stack */
  backendCognitoDomain: string;
}

/**
 * UI-only CDK stack for design variant worktrees.
 *
 * Provisions:
 *   - S3 WebsiteBucket  (static React build)
 *   - CloudFront Distribution  (SPA routing)
 *   - Cognito UserPoolClient  (design-specific app client on the shared backend User Pool)
 *   - BucketDeployment  (frontend/build + config.json pointing to the shared backend)
 *
 * No Lambda, API Gateway, DynamoDB, Cognito User Pool, or Media S3 are created here —
 * all backend resources are owned by the main full stack.
 */
export class UiOnlyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: UiOnlyStackProps) {
    super(scope, id, props);
    const stage = resolveStageName(props.stage);

    // Reference the shared Cognito User Pool from the backend stack (no new pool)
    const userPool = cognito.UserPool.fromUserPoolId(
      this,
      "ImportedUserPool",
      props.backendUserPoolId
    );

    // S3 Bucket for static site
    const websiteBucket = new s3.Bucket(this, "WebsiteBucket", {
      websiteIndexDocument: "index.html",
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    websiteBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject"],
        resources: [`${websiteBucket.bucketArn}/*`],
        principals: [new iam.AnyPrincipal()],
      })
    );

    // CloudFront Distribution
    const distribution = new cloudfront.Distribution(
      this,
      "CloudFrontDistribution",
      {
        defaultBehavior: { origin: new origins.S3Origin(websiteBucket) },
        defaultRootObject: "index.html",
        errorResponses: [
          {
            httpStatus: 403,
            responseHttpStatus: 200,
            responsePagePath: "/index.html",
            ttl: cdk.Duration.minutes(5),
          },
          {
            httpStatus: 404,
            responseHttpStatus: 200,
            responsePagePath: "/index.html",
            ttl: cdk.Duration.minutes(5),
          },
        ],
      }
    );

    // Per-design Cognito App Client on the shared User Pool
    const userPoolClient = new cognito.UserPoolClient(
      this,
      "DesignUserPoolClient",
      {
        userPool,
        authFlows: { userPassword: true, userSrp: true },
        oAuth: {
          flows: { authorizationCodeGrant: true },
          scopes: [
            cognito.OAuthScope.OPENID,
            cognito.OAuthScope.EMAIL,
            cognito.OAuthScope.PROFILE,
          ],
          callbackUrls: [
            `https://${distribution.domainName}/auth/callback`,
            "http://localhost:3000/auth/callback",
            "http://127.0.0.1:3000/auth/callback",
          ],
          logoutUrls: [
            `https://${distribution.domainName}/login`,
            "http://localhost:3000/login",
            "http://127.0.0.1:3000/login",
          ],
        },
        supportedIdentityProviders: [
          cognito.UserPoolClientIdentityProvider.COGNITO,
        ],
        refreshTokenValidity: cdk.Duration.days(30),
      }
    );

    const frontendBuildDir =
      process.env.FRONTEND_BUILD_DIR ||
      path.join(__dirname, "../../frontend/build");

    // Deploy frontend build + config.json pointing at the shared backend
    // Live2D assets are excluded — synced separately via aws s3 sync to avoid Lambda timeout
    new s3Deployment.BucketDeployment(this, "DeployWebsite", {
      sources: [
        s3Deployment.Source.asset(frontendBuildDir, {
          exclude: ["live2d/**"],
        }),
        s3Deployment.Source.data(
          "config.json",
          JSON.stringify({
            apiBaseUrl: props.backendApiEndpoint,
            cognito: {
              domain: props.backendCognitoDomain,
              clientId: userPoolClient.userPoolClientId,
              userPoolId: props.backendUserPoolId,
              region: cdk.Stack.of(this).region,
            },
          })
        ),
      ],
      destinationBucket: websiteBucket,
      distribution,
      distributionPaths: ["/*"],
      prune: false,
      memoryLimit: 1024,
    });

    // Outputs — CloudFrontURL and APIEndpoint follow the same keys as the full
    // stack so that readCdkOutputs() in idea-env.js works unchanged.
    new cdk.CfnOutput(this, "CloudFrontURL", {
      value: distribution.domainName,
    });

    new cdk.CfnOutput(this, "APIEndpoint", {
      value: props.backendApiEndpoint,
    });

    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: userPoolClient.userPoolClientId,
    });

    new cdk.CfnOutput(this, "StageName", {
      value: stage,
    });

    new cdk.CfnOutput(this, "WebsiteBucketName", {
      value: websiteBucket.bucketName,
    });

    new cdk.CfnOutput(this, "CloudFrontDistributionId", {
      value: distribution.distributionId,
    });
  }
}
