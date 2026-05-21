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
import * as logs from "aws-cdk-lib/aws-logs";
import * as path from "path";
import { resolveStageName } from "./stage";

const COGNITO_DOMAIN_PREFIX_BASE_MAX_LENGTH = 20;
const COGNITO_DOMAIN_STAGE_MAX_LENGTH = 28;
const COGNITO_DOMAIN_FALLBACK_PREFIX = "ws";
const STAGE_FALLBACK_PREFIX = "idea";
const DEFAULT_COGNITO_DOMAIN_BASE = "whisk-studio";
const ADMIN_OUTPUT_NOT_CONFIGURED = "not-configured";
const ADMIN_TEMP_PASSWORD_MIN_LENGTH = 10;
const AWS_ACCOUNT_ID_PATTERN = /\b\d{12}\b/;
const API_GATEWAY_CORS_ERROR_ALLOW_METHODS = "'GET,POST,PUT,PATCH,DELETE,OPTIONS'";
const LOCAL_COGNITO_PORT_START = 3000;
const LOCAL_COGNITO_PORT_COUNT = 10;
const TCP_PORT_MIN = 1;
const TCP_PORT_MAX = 65535;
const DEFAULT_LOCAL_COGNITO_PORT_RANGE = Array.from(
  { length: LOCAL_COGNITO_PORT_COUNT },
  (_value, index) => String(LOCAL_COGNITO_PORT_START + index)
);
const VITE_PREVIEW_LOCAL_PORT = "4173";
const VITE_DEV_LOCAL_PORT = "5173";
const COMMON_ALT_LOCAL_COGNITO_PORTS = [
  VITE_PREVIEW_LOCAL_PORT,
  VITE_DEV_LOCAL_PORT,
] as const;
const DEFAULT_LOCAL_COGNITO_PORTS = Array.from(
  new Set([
    ...DEFAULT_LOCAL_COGNITO_PORT_RANGE,
    ...COMMON_ALT_LOCAL_COGNITO_PORTS,
  ])
);
const LOCAL_AUTH_HOSTS = ["localhost", "127.0.0.1"] as const;

/**
 * CloudFront domains of design-variant stacks that share this backend's
 * Cognito User Pool.  Each variant's config.json points at *this* client, so
 * their callback / logout URLs must be registered here.
 */
const DESIGN_VARIANT_CLOUDFRONT_DOMAINS = [
  "d3ei9r5awjyzzr.cloudfront.net", // design-fusion
  "d1ulh0ke4fvnqg.cloudfront.net", // design-kinetic
  "d21j30h6jj4n2k.cloudfront.net", // design-pixnovel
  "d3mv9zsmbqsn48.cloudfront.net", // design-atelier
  "d17qd3rx45vcxl.cloudfront.net", // design-solaris
] as const;

const sanitizeDomainPrefix = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");

const resolveLocalCognitoPorts = (value: string) => {
  const rawPorts = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!rawPorts.length) {
    return [...DEFAULT_LOCAL_COGNITO_PORTS];
  }
  const deduped = Array.from(
    new Set(
      rawPorts
        .map((item) => Number(item))
        .filter(
          (item) =>
            Number.isInteger(item) && item >= TCP_PORT_MIN && item <= TCP_PORT_MAX
        )
        .map((item) => String(item))
    )
  );
  return deduped.length ? deduped : [...DEFAULT_LOCAL_COGNITO_PORTS];
};

const trimCognitoDomainSegment = ({
  value,
  maxLength,
  fallbackValue,
  ensureLeadingLetter = true,
}: {
  value: string;
  maxLength: number;
  fallbackValue: string;
  ensureLeadingLetter?: boolean;
}) => {
  let normalized = sanitizeDomainPrefix(value);
  if (normalized.length > maxLength) {
    normalized = normalized.slice(0, maxLength).replace(/-+$/, "");
  }
  if (!normalized) {
    normalized = sanitizeDomainPrefix(fallbackValue);
  }
  if (ensureLeadingLetter && !/^[a-z]/.test(normalized)) {
    normalized = `${COGNITO_DOMAIN_FALLBACK_PREFIX}-${normalized}`;
  }
  if (normalized.length > maxLength) {
    normalized = normalized
      .slice(0, maxLength)
      .replace(/-+$/, "");
  }
  if (!normalized) {
    normalized = sanitizeDomainPrefix(fallbackValue);
  }
  if (!normalized) {
    normalized = COGNITO_DOMAIN_FALLBACK_PREFIX;
  }
  return normalized;
};

export interface StaticWebAWSAIStackProps extends cdk.StackProps {
  stage: string;
}

export class StaticWebAWSAIStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: StaticWebAWSAIStackProps) {
    super(scope, id, props);
    const stage = resolveStageName(props.stage);

    const adminEmail = String(process.env.ADMIN_EMAIL || "").trim();
    const secondaryAdminEmailRaw = String(
      process.env.SECONDARY_ADMIN_EMAIL || ""
    ).trim();
    const secondaryAdminEmail =
      secondaryAdminEmailRaw && secondaryAdminEmailRaw !== adminEmail
        ? secondaryAdminEmailRaw
        : "";
    const adminTempPassword = String(
      process.env.ADMIN_TEMP_PASSWORD || ""
    ).trim();

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

    new cognito.CfnUserPoolGroup(this, "AdminGroup", {
      groupName: "admin",
      userPoolId: userPool.userPoolId,
      description: "Administrators with access to Director/Sanctum",
      precedence: 0,
    });

    const baseDomainPrefixSource =
      process.env.COGNITO_DOMAIN_PREFIX_BASE ||
      process.env.COGNITO_DOMAIN_PREFIX ||
      DEFAULT_COGNITO_DOMAIN_BASE;
    const baseDomainPrefix = trimCognitoDomainSegment({
      value: baseDomainPrefixSource,
      maxLength: COGNITO_DOMAIN_PREFIX_BASE_MAX_LENGTH,
      fallbackValue: DEFAULT_COGNITO_DOMAIN_BASE,
    });
    const stageDomainPrefix = trimCognitoDomainSegment({
      value: stage,
      maxLength: COGNITO_DOMAIN_STAGE_MAX_LENGTH,
      fallbackValue: STAGE_FALLBACK_PREFIX,
    });
    const accountDomainPrefixSource = String(
      process.env.CDK_DEFAULT_ACCOUNT ||
        process.env.AWS_ACCOUNT_ID ||
        cdk.Stack.of(this).account
    );
    const accountIdFromSource =
      accountDomainPrefixSource.match(AWS_ACCOUNT_ID_PATTERN)?.[0] ||
      accountDomainPrefixSource;
    const accountDomainPrefix = trimCognitoDomainSegment({
      value: accountIdFromSource,
      maxLength: 12,
      fallbackValue: "000000000000",
      ensureLeadingLetter: false,
    });
    const domainPrefix = `${baseDomainPrefix}-${stageDomainPrefix}-${accountDomainPrefix}`;
    userPool.addDomain("UserPoolDomain", {
      cognitoDomain: { domainPrefix },
    });
    const cognitoDomainBaseUrl = `https://${domainPrefix}.auth.${cdk.Stack.of(this).region}.amazoncognito.com`;

    const registerDefaultAdminUser = ({
      resourceId,
      username,
    }: {
      resourceId: string;
      username: string;
    }) =>
      new cr.AwsCustomResource(this, resourceId, {
        onCreate: {
          service: "CognitoIdentityServiceProvider",
          action: "adminCreateUser",
          parameters: {
            UserPoolId: userPool.userPoolId,
            Username: username,
            TemporaryPassword: adminTempPassword,
            MessageAction: "SUPPRESS",
            UserAttributes: [
              { Name: "email", Value: username },
              { Name: "email_verified", Value: "true" },
            ],
          },
          physicalResourceId: cr.PhysicalResourceId.of(`default-admin-${username}`),
        },
        onUpdate: {
          service: "CognitoIdentityServiceProvider",
          action: "adminUpdateUserAttributes",
          parameters: {
            UserPoolId: userPool.userPoolId,
            Username: username,
            UserAttributes: [
              { Name: "email", Value: username },
              { Name: "email_verified", Value: "true" },
            ],
          },
          physicalResourceId: cr.PhysicalResourceId.of(`default-admin-${username}`),
        },
        onDelete: {
          service: "CognitoIdentityServiceProvider",
          action: "adminDeleteUser",
          parameters: {
            UserPoolId: userPool.userPoolId,
            Username: username,
          },
        },
        policy: cr.AwsCustomResourcePolicy.fromStatements([
          new iam.PolicyStatement({
            actions: [
              "cognito-idp:AdminCreateUser",
              "cognito-idp:AdminDeleteUser",
              "cognito-idp:AdminUpdateUserAttributes",
            ],
            resources: [userPool.userPoolArn],
          }),
        ]),
      });

    if (adminTempPassword && adminTempPassword.length < ADMIN_TEMP_PASSWORD_MIN_LENGTH) {
      cdk.Annotations.of(this).addWarning(
        `ADMIN_TEMP_PASSWORD should be at least ${ADMIN_TEMP_PASSWORD_MIN_LENGTH} characters to meet pool policy.`
      );
    }

    const canSeedAdminUsers = Boolean(adminTempPassword);
    if (!canSeedAdminUsers && (adminEmail || secondaryAdminEmail)) {
      cdk.Annotations.of(this).addWarning(
        "ADMIN_TEMP_PASSWORD is missing; default admin users will not be created."
      );
    }

    if (canSeedAdminUsers && adminEmail) {
      registerDefaultAdminUser({
        resourceId: "DefaultAdminUser",
        username: adminEmail,
      });
      new cr.AwsCustomResource(this, "DefaultAdminGroupMembership", {
        onCreate: {
          service: "CognitoIdentityServiceProvider",
          action: "adminAddUserToGroup",
          parameters: {
            UserPoolId: userPool.userPoolId,
            Username: adminEmail,
            GroupName: "admin",
          },
          physicalResourceId: cr.PhysicalResourceId.of(`admin-group-${adminEmail}`),
        },
        policy: cr.AwsCustomResourcePolicy.fromStatements([
          new iam.PolicyStatement({
            actions: ["cognito-idp:AdminAddUserToGroup"],
            resources: [userPool.userPoolArn],
          }),
        ]),
      });
    }

    if (canSeedAdminUsers && secondaryAdminEmail) {
      registerDefaultAdminUser({
        resourceId: "SecondaryAdminUser",
        username: secondaryAdminEmail,
      });
      new cr.AwsCustomResource(this, "SecondaryAdminGroupMembership", {
        onCreate: {
          service: "CognitoIdentityServiceProvider",
          action: "adminAddUserToGroup",
          parameters: {
            UserPoolId: userPool.userPoolId,
            Username: secondaryAdminEmail,
            GroupName: "admin",
          },
          physicalResourceId: cr.PhysicalResourceId.of(`admin-group-${secondaryAdminEmail}`),
        },
        policy: cr.AwsCustomResourcePolicy.fromStatements([
          new iam.PolicyStatement({
            actions: ["cognito-idp:AdminAddUserToGroup"],
            resources: [userPool.userPoolArn],
          }),
        ]),
      });
    }

    // Lambda Function for API.
    // `logRetention` caps the CloudWatch log group at 30 days — the agent
    // route emits a structured JSON line per /turn for Insights queries, so
    // logs would otherwise accumulate forever (cost concern as agent usage
    // grows).
    const apiLambda = new lambda.Function(this, "ApiLambda", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "lambda.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../../backend")),
      memorySize: 512,
      timeout: cdk.Duration.seconds(120),
      logRetention: logs.RetentionDays.ONE_MONTH,
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
    // Agent mode default model. `build-deps.js` resolves `promptHelperModelId`
    // (the agent's per-turn Bedrock model) via the env chain:
    //   BEDROCK_PROMPT_HELPER_INFERENCE_PROFILE_ARN →
    //   BEDROCK_PROMPT_HELPER_MODEL_ID →
    //   BEDROCK_CLAUDE_MODEL_ID →
    //   hardcoded Haiku fallback
    // Setting `BEDROCK_CLAUDE_MODEL_ID` here makes the fallback explicit and
    // gives operators a single env var to retune the agent default without
    // touching code. Distinct from `BEDROCK_STORY_MODEL_ID` (story engine).
    apiLambda.addEnvironment(
      "BEDROCK_CLAUDE_MODEL_ID",
      process.env.BEDROCK_CLAUDE_MODEL_ID ||
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
    apiLambda.addEnvironment(
      "CIVITAI_API_TOKEN",
      process.env.CIVITAI_API_TOKEN || ""
    );
    apiLambda.addEnvironment(
      "HUGGING_FACE_TOKEN",
      process.env.HUGGING_FACE_TOKEN || ""
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

    const authorizerLambdaFn = new lambda.Function(this, "AuthorizerLambda", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../../backend/authorizer")),
      environment: {
        USER_POOL_ID: userPool.userPoolId,
      },
    });

    const requestAuthorizer = new apigateway.RequestAuthorizer(this, "RequestAuthorizer", {
      handler: authorizerLambdaFn,
      identitySources: [],
      resultsCacheTtl: cdk.Duration.seconds(0),
    });

    // API Gateway — proxy:false so we can mix authenticated catch-all with public companion routes
    const lambdaInteg = new apigateway.LambdaIntegration(apiLambda);
    const authOpts = {
      authorizationType: apigateway.AuthorizationType.CUSTOM,
      authorizer: requestAuthorizer,
    };
    const noAuthOpts = { authorizationType: apigateway.AuthorizationType.NONE };

    const api = new apigateway.LambdaRestApi(this, "ApiGateway", {
      handler: apiLambda,
      proxy: false, // Manual routing — allows mixing auth/no-auth routes
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ["*"],
      },
      defaultMethodOptions: authOpts,
    });

    // Authenticated catch-all (covers all routes not explicitly listed below)
    api.root.addMethod("ANY", lambdaInteg, authOpts);
    api.root.addProxy({ defaultIntegration: lambdaInteg, anyMethod: true });

    // Public companion routes — no auth required
    const apiRes = api.root.addResource("api");
    const companionRes = apiRes.addResource("companion");
    companionRes.addResource("chat").addMethod("POST", lambdaInteg, noAuthOpts);
    companionRes.addResource("proactive").addMethod("POST", lambdaInteg, noAuthOpts);
    const companionMemoryRes = companionRes.addResource("memory");
    companionMemoryRes.addResource("status").addMethod("GET", lambdaInteg, noAuthOpts);
    companionMemoryRes.addMethod("DELETE", lambdaInteg, authOpts);
    const adminRes = apiRes.addResource("admin");
    adminRes.addResource("companion-model").addMethod("GET", lambdaInteg, noAuthOpts);

    new apigateway.GatewayResponse(this, "ApiGatewayDefault4xx", {
      restApi: api,
      type: apigateway.ResponseType.DEFAULT_4XX,
      responseHeaders: {
        "Access-Control-Allow-Origin": "'*'",
        "Access-Control-Allow-Headers": "'*'",
        "Access-Control-Allow-Methods": API_GATEWAY_CORS_ERROR_ALLOW_METHODS,
      },
    });

    new apigateway.GatewayResponse(this, "ApiGatewayDefault5xx", {
      restApi: api,
      type: apigateway.ResponseType.DEFAULT_5XX,
      responseHeaders: {
        "Access-Control-Allow-Origin": "'*'",
        "Access-Control-Allow-Headers": "'*'",
        "Access-Control-Allow-Methods": API_GATEWAY_CORS_ERROR_ALLOW_METHODS,
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

    const frontendApiUrl =
      process.env.FRONTEND_API_URL_OVERRIDE || api.url || "";
    const localCognitoPorts = resolveLocalCognitoPorts(
      String(process.env.COGNITO_LOCALHOST_PORTS || "")
    );
    const localCallbackUrls = localCognitoPorts.flatMap((port) =>
      LOCAL_AUTH_HOSTS.map((host) => `http://${host}:${port}/auth/callback`)
    );
    const localLogoutUrls = localCognitoPorts.flatMap((port) =>
      LOCAL_AUTH_HOSTS.map((host) => `http://${host}:${port}/login`)
    );

    const userPoolClient = userPool.addClient("UserPoolClient", {
      authFlows: { userPassword: true, userSrp: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: [
          ...localCallbackUrls,
          `https://${distribution.domainName}/auth/callback`,
          ...DESIGN_VARIANT_CLOUDFRONT_DOMAINS.map(
            (d) => `https://${d}/auth/callback`
          ),
        ],
        logoutUrls: [
          ...localLogoutUrls,
          `https://${distribution.domainName}/login`,
          ...DESIGN_VARIANT_CLOUDFRONT_DOMAINS.map(
            (d) => `https://${d}/login`
          ),
        ],
      },
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
      ],
      refreshTokenValidity: cdk.Duration.days(30),
    });

    // Deploy frontend to S3 (Live2D assets excluded — synced separately via aws s3 sync to avoid Lambda timeout)
    const frontendBuildDir =
      process.env.FRONTEND_BUILD_DIR ||
      path.join(__dirname, "../../frontend/build");
    new s3Deployment.BucketDeployment(this, "DeployWebsite", {
      sources: [
        s3Deployment.Source.asset(frontendBuildDir, {
          exclude: ["live2d/**"],
        }),
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
      // prune: false — live2d assets are managed separately via aws s3 sync; letting CDK
      // prune would delete them since they are excluded from the zip.
      prune: false,
      // 1024 MB gives proportionally more vCPU + network bandwidth so the Lambda can
      // upload a full React bundle within the 900s timeout (128 MB < 2 KB/s = too slow).
      memoryLimit: 1024,
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
      value: adminEmail || ADMIN_OUTPUT_NOT_CONFIGURED,
    });

    new cdk.CfnOutput(this, "SecondaryAdminUserEmail", {
      value: secondaryAdminEmail || ADMIN_OUTPUT_NOT_CONFIGURED,
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
