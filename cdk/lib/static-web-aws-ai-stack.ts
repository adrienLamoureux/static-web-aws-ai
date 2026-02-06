import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3Deployment from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as cr from "aws-cdk-lib/custom-resources";
import * as path from "path";

export class StaticWebAWSAIStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const adminEmail = "vergil1534@gmail.com";
    const adminTempPassword = "WhiskStudio!2026";

    const mediaTable = new dynamodb.Table(this, "MediaTable", {
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPool = new cognito.UserPool(this, "UserPool", {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      standardAttributes: {
        email: {
          required: true,
          mutable: false,
        },
      },
      passwordPolicy: {
        minLength: 10,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
    });

    const uniqueSuffix = cdk.Names.uniqueId(this).slice(-8).toLowerCase();
    const overrideDomainPrefix = (process.env.COGNITO_DOMAIN_PREFIX || "").toLowerCase();
    let domainPrefix = overrideDomainPrefix ||
      `whisk-studio-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}-${uniqueSuffix}`;
    domainPrefix = domainPrefix
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+/, "")
      .replace(/-+$/, "");
    if (!/^[a-z]/.test(domainPrefix)) {
      domainPrefix = `ws-${domainPrefix}`;
    }
    if (domainPrefix.length > 63) {
      domainPrefix = domainPrefix.slice(0, 63).replace(/-+$/, "");
    }
    if (!domainPrefix) {
      domainPrefix = `ws-${uniqueSuffix}`;
    }
    const userPoolDomain = userPool.addDomain("UserPoolDomain", {
      cognitoDomain: { domainPrefix },
    });
    const cognitoDomainBaseUrl = `https://${domainPrefix}.auth.${cdk.Stack.of(this).region}.amazoncognito.com`;

    new cr.AwsCustomResource(this, "DefaultAdminUser", {
      onCreate: {
        service: "CognitoIdentityServiceProvider",
        action: "adminCreateUser",
        parameters: {
          UserPoolId: userPool.userPoolId,
          Username: adminEmail,
          TemporaryPassword: adminTempPassword,
          MessageAction: "SUPPRESS",
          UserAttributes: [
            { Name: "email", Value: adminEmail },
            { Name: "email_verified", Value: "true" },
          ],
        },
        physicalResourceId: cr.PhysicalResourceId.of(
          `default-admin-${adminEmail}`
        ),
      },
      onUpdate: {
        service: "CognitoIdentityServiceProvider",
        action: "adminUpdateUserAttributes",
        parameters: {
          UserPoolId: userPool.userPoolId,
          Username: adminEmail,
          UserAttributes: [
            { Name: "email", Value: adminEmail },
            { Name: "email_verified", Value: "true" },
          ],
        },
        physicalResourceId: cr.PhysicalResourceId.of(
          `default-admin-${adminEmail}`
        ),
      },
      onDelete: {
        service: "CognitoIdentityServiceProvider",
        action: "adminDeleteUser",
        parameters: {
          UserPoolId: userPool.userPoolId,
          Username: adminEmail,
        },
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: [
            "cognito-idp:AdminCreateUser",
            "cognito-idp:AdminDeleteUser",
          ],
          resources: [userPool.userPoolArn],
        }),
      ]),
    });

    // Lambda Function for API
    const apiLambda = new lambda.Function(this, "ApiLambda", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "lambda.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../../backend")),
      memorySize: 512,
      timeout: cdk.Duration.seconds(120),
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
    apiLambda.addEnvironment("MEDIA_TABLE", mediaTable.tableName);
    apiLambda.addEnvironment(
      "BEDROCK_REGION",
      process.env.BEDROCK_REGION || cdk.Stack.of(this).region
    );
    apiLambda.addEnvironment(
      "BEDROCK_MODEL_ID",
      process.env.BEDROCK_MODEL_ID || "amazon.nova-reel-v1:1"
    );
    apiLambda.addEnvironment(
      "BEDROCK_STORY_MODEL_ID",
      process.env.BEDROCK_STORY_MODEL_ID ||
        "us.anthropic.claude-haiku-4-5-20251001-v1:0"
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
    mediaBucket.grantDelete(apiLambda);
    mediaTable.grantReadWriteData(apiLambda);

    mediaBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject"],
        resources: [`${mediaBucket.bucketArn}/users/*/images/*`],
        principals: [new iam.ServicePrincipal("bedrock.amazonaws.com")],
      })
    );
    mediaBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ["s3:PutObject"],
        resources: [`${mediaBucket.bucketArn}/users/*/videos/*`],
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
        allowHeaders: ["*"],
      },
      defaultMethodOptions: {
        authorizationType: apigateway.AuthorizationType.COGNITO,
        authorizer: new apigateway.CognitoUserPoolsAuthorizer(
          this,
          "CognitoAuthorizer",
          { cognitoUserPools: [userPool] }
        ),
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
    });

    const frontendApiUrl = process.env.REACT_APP_API_URL || api.url || "";

    const userPoolClient = userPool.addClient("UserPoolClient", {
      authFlows: { userPassword: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: [
          "http://localhost:3000/auth/callback",
          `https://${distribution.domainName}/auth/callback`,
        ],
        logoutUrls: [
          "http://localhost:3000/login",
          `https://${distribution.domainName}/login`,
        ],
      },
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
      ],
      refreshTokenValidity: cdk.Duration.days(30),
    });

    // Deploy frontend to S3
    new s3Deployment.BucketDeployment(this, "DeployWebsite", {
      sources: [
        s3Deployment.Source.asset(
          path.join(__dirname, "../../frontend/build")
        ),
        s3Deployment.Source.data(
          "config.json",
          JSON.stringify({
            apiBaseUrl: frontendApiUrl,
            cognito: {
              domain: cognitoDomainBaseUrl,
              clientId: userPoolClient.userPoolClientId,
              userPoolId: userPool.userPoolId,
              region: cdk.Stack.of(this).region,
            },
          })
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

    new cdk.CfnOutput(this, "UserPoolId", {
      value: userPool.userPoolId,
    });

    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: userPoolClient.userPoolClientId,
    });

    new cdk.CfnOutput(this, "CognitoDomain", {
      value: cognitoDomainBaseUrl,
    });

    new cdk.CfnOutput(this, "CognitoDomainPrefix", {
      value: domainPrefix,
    });

    new cdk.CfnOutput(this, "AdminUserEmail", {
      value: adminEmail,
    });
  }
}
