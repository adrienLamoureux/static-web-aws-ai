#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import * as dotenv from "dotenv";
import * as path from "path";
import { StaticWebAWSAIStack } from "../lib/static-web-aws-ai-stack";
import { UiOnlyStack } from "../lib/ui-stack";
import { buildStackId, resolveStageName } from "../lib/stage";

dotenv.config({ path: path.join(__dirname, "../.env") });

const OWNER_DEFAULT = "solo";
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const ACCOUNT_ID_PATTERN = /\b\d{12}\b/;
const AWS_REGION_PATTERN = /\b[a-z]{2}-[a-z0-9-]+-\d\b/;

const parsePositiveInteger = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  if (parsed <= 0) return 0;
  return Math.floor(parsed);
};

const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

const app = new cdk.App();
const stage = resolveStageName(
  String(app.node.tryGetContext("stage") || process.env.STAGE || "")
);
const owner = String(
  app.node.tryGetContext("owner") || process.env.IDEA_OWNER || OWNER_DEFAULT
).trim() || OWNER_DEFAULT;
const ttlDays = parsePositiveInteger(
  app.node.tryGetContext("ttlDays") || process.env.IDEA_TTL_DAYS || ""
);
const resolvedAccountCandidate = String(
  process.env.CDK_DEFAULT_ACCOUNT ||
    process.env.AWS_ACCOUNT_ID ||
    process.env.AWS_DEFAULT_ACCOUNT ||
    ""
).trim();
const resolvedRegionCandidate = String(
  process.env.CDK_DEFAULT_REGION ||
    process.env.AWS_REGION ||
    process.env.AWS_DEFAULT_REGION ||
    ""
).trim();
const resolvedAccount = resolvedAccountCandidate.match(ACCOUNT_ID_PATTERN)?.[0] || "";
const resolvedRegion = resolvedRegionCandidate.match(AWS_REGION_PATTERN)?.[0] || "";
const stackEnv =
  resolvedAccount && resolvedRegion
    ? {
        account: resolvedAccount,
        region: resolvedRegion,
      }
    : undefined;
const expiresOn =
  ttlDays > 0
    ? toIsoDate(new Date(Date.now() + ttlDays * MILLISECONDS_PER_DAY))
    : "";
const stackId = buildStackId(stage);

const stackMode = String(
  app.node.tryGetContext("stackMode") || "full"
).trim();

const sharedTags = {
  Project: "static-web-aws-ai",
  Stage: stage,
  Owner: owner,
  ...(expiresOn ? { ExpiresOn: expiresOn } : {}),
};

if (stackMode === "ui-only") {
  const backendApiEndpoint = String(
    app.node.tryGetContext("backendApiEndpoint") || ""
  ).trim();
  const backendUserPoolId = String(
    app.node.tryGetContext("backendUserPoolId") || ""
  ).trim();
  const backendCognitoDomain = String(
    app.node.tryGetContext("backendCognitoDomain") || ""
  ).trim();

  if (!backendApiEndpoint || !backendUserPoolId || !backendCognitoDomain) {
    throw new Error(
      "ui-only mode requires --context backendApiEndpoint, " +
        "--context backendUserPoolId, and --context backendCognitoDomain. " +
        "Use idea:deploy --backend-stage=<stage> to populate these automatically."
    );
  }

  new UiOnlyStack(app, stackId, {
    stackName: stackId,
    env: stackEnv,
    stage,
    backendApiEndpoint,
    backendUserPoolId,
    backendCognitoDomain,
    tags: sharedTags,
  });
} else {
  new StaticWebAWSAIStack(app, stackId, {
    stackName: stackId,
    env: stackEnv,
    stage,
    tags: sharedTags,
  });
}
