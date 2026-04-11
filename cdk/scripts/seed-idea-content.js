#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const IDEAS_DIR = path.join(ROOT_DIR, "ideas");
const TEMPLATE_DIR_NAME = "_template";
const STACK_ID_PREFIX = "StaticWebAWSAIStack";
const DEFAULT_SOURCE_STAGE = process.env.IDEA_SOURCE_STAGE || "sandbox";
const DEFAULT_IMAGE_LIMIT = 8;
const DEFAULT_MUSIC_LIMIT = 6;
const MAX_DISCOVERY_SCAN_PAGES = 20;
const PAGE_LIMIT = 200;
const STAGE_INVALID_PATTERN = /[^a-z0-9-]/g;
const STAGE_MULTI_DASH_PATTERN = /-+/g;
const STAGE_EDGE_DASH_PATTERN = /^-+|-+$/g;
const POSITIVE_INTEGER_PATTERN = /^[0-9]+$/;
const USER_PK_PREFIX = "USER#";
const IMAGE_SK_PREFIX = "IMG#";
const MUSIC_SK_PREFIX = "MUSICLIB#";
const ACTIVITY_SEPARATOR_PATTERN = /\|/g;

const usage = `
Usage:
  npm --prefix cdk run idea:seed -- --target-stage=<idea-id> [--source-stage=<source-stage>] [--source-stack=<stack-name>] [--source-user-id=<sub>] [--seed-user-email=<email>] [--seed-user-password=<password>] [--image-limit=<n>] [--music-limit=<n>] [--dry-run]
  npm --prefix cdk run idea:seed-many -- (--all | --stages=a,b,c) [--exclude=x,y] [--source-stage=<source-stage>] [--source-stack=<stack-name>] [--source-user-id=<sub>] [--seed-user-email=<email>] [--seed-user-password=<password>] [--image-limit=<n>] [--music-limit=<n>] [--dry-run]
`;

const command = process.argv[2];
const options = parseArgs(process.argv.slice(3));
const supportedCommands = new Set(["seed", "seed-many"]);

if (!command || !supportedCommands.has(command)) {
  fail(`Unsupported or missing command.\n${usage}`);
}

if (command === "seed") {
  const targetStage = resolveRequiredStage(options.targetStage);
  const targets = [targetStage];
  executeSeedMany({
    targets,
    sourceStage: resolveOptionalStage(options.sourceStage) || DEFAULT_SOURCE_STAGE,
    sourceStack: normalizeValue(options.sourceStack),
    sourceUserId: normalizeValue(options.sourceUserId),
    seedUserEmail: normalizeValue(options.seedUserEmail),
    seedUserPassword: normalizeValue(options.seedUserPassword),
    imageLimit: resolvePositiveInteger(options.imageLimit, DEFAULT_IMAGE_LIMIT),
    musicLimit: resolvePositiveInteger(options.musicLimit, DEFAULT_MUSIC_LIMIT),
    dryRun: options.dryRun,
  });
  process.exit(0);
}

if (command === "seed-many") {
  const targets = resolveTargetStages(options);
  executeSeedMany({
    targets,
    sourceStage: resolveOptionalStage(options.sourceStage) || DEFAULT_SOURCE_STAGE,
    sourceStack: normalizeValue(options.sourceStack),
    sourceUserId: normalizeValue(options.sourceUserId),
    seedUserEmail: normalizeValue(options.seedUserEmail),
    seedUserPassword: normalizeValue(options.seedUserPassword),
    imageLimit: resolvePositiveInteger(options.imageLimit, DEFAULT_IMAGE_LIMIT),
    musicLimit: resolvePositiveInteger(options.musicLimit, DEFAULT_MUSIC_LIMIT),
    dryRun: options.dryRun,
  });
  process.exit(0);
}

function parseArgs(args) {
  const parsed = {
    targetStage: "",
    stages: "",
    exclude: "",
    sourceStage: "",
    sourceStack: "",
    sourceUserId: "",
    seedUserEmail: "",
    seedUserPassword: "",
    imageLimit: "",
    musicLimit: "",
    all: false,
    dryRun: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--all") {
      parsed.all = true;
      continue;
    }
    if (arg === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }
    if (arg.startsWith("--target-stage=")) {
      parsed.targetStage = arg.slice("--target-stage=".length);
      continue;
    }
    if (arg === "--target-stage") {
      parsed.targetStage = String(args[index + 1] || "");
      index += 1;
      continue;
    }
    if (arg.startsWith("--stages=")) {
      parsed.stages = arg.slice("--stages=".length);
      continue;
    }
    if (arg === "--stages") {
      parsed.stages = String(args[index + 1] || "");
      index += 1;
      continue;
    }
    if (arg.startsWith("--exclude=")) {
      parsed.exclude = arg.slice("--exclude=".length);
      continue;
    }
    if (arg === "--exclude") {
      parsed.exclude = String(args[index + 1] || "");
      index += 1;
      continue;
    }
    if (arg.startsWith("--source-stage=")) {
      parsed.sourceStage = arg.slice("--source-stage=".length);
      continue;
    }
    if (arg === "--source-stage") {
      parsed.sourceStage = String(args[index + 1] || "");
      index += 1;
      continue;
    }
    if (arg.startsWith("--source-stack=")) {
      parsed.sourceStack = arg.slice("--source-stack=".length);
      continue;
    }
    if (arg === "--source-stack") {
      parsed.sourceStack = String(args[index + 1] || "");
      index += 1;
      continue;
    }
    if (arg.startsWith("--source-user-id=")) {
      parsed.sourceUserId = arg.slice("--source-user-id=".length);
      continue;
    }
    if (arg === "--source-user-id") {
      parsed.sourceUserId = String(args[index + 1] || "");
      index += 1;
      continue;
    }
    if (arg.startsWith("--seed-user-email=")) {
      parsed.seedUserEmail = arg.slice("--seed-user-email=".length);
      continue;
    }
    if (arg === "--seed-user-email") {
      parsed.seedUserEmail = String(args[index + 1] || "");
      index += 1;
      continue;
    }
    if (arg.startsWith("--seed-user-password=")) {
      parsed.seedUserPassword = arg.slice("--seed-user-password=".length);
      continue;
    }
    if (arg === "--seed-user-password") {
      parsed.seedUserPassword = String(args[index + 1] || "");
      index += 1;
      continue;
    }
    if (arg.startsWith("--image-limit=")) {
      parsed.imageLimit = arg.slice("--image-limit=".length);
      continue;
    }
    if (arg === "--image-limit") {
      parsed.imageLimit = String(args[index + 1] || "");
      index += 1;
      continue;
    }
    if (arg.startsWith("--music-limit=")) {
      parsed.musicLimit = arg.slice("--music-limit=".length);
      continue;
    }
    if (arg === "--music-limit") {
      parsed.musicLimit = String(args[index + 1] || "");
      index += 1;
      continue;
    }
    fail(`Unknown argument "${arg}".\n${usage}`);
  }

  return parsed;
}

function executeSeedMany({
  targets,
  sourceStage,
  sourceStack,
  sourceUserId,
  seedUserEmail,
  seedUserPassword,
  imageLimit,
  musicLimit,
  dryRun,
}) {
  const explicitSourceStack = normalizeValue(sourceStack);
  const normalizedSourceStage = explicitSourceStack
    ? ""
    : resolveRequiredStage(sourceStage);
  const sourceStackName = explicitSourceStack || buildStackId(normalizedSourceStage);
  const sanitizedTargets = Array.from(new Set(targets)).sort();

  if (dryRun) {
    info(
      [
        "dry-run seed-many",
        `source_stage=${normalizedSourceStage || "-"}`,
        `source_stack=${sourceStackName}`,
        `targets=${sanitizedTargets.join(",")}`,
        `source_user_id=${sourceUserId || "auto"}`,
        `seed_user_email=${seedUserEmail || "auto"}`,
        `image_limit=${imageLimit}`,
        `music_limit=${musicLimit}`,
      ].join(" | ")
    );
    return;
  }

  const sourceStackResources = resolveStackResourceNames(sourceStackName);
  const sourceTable = sourceStackResources.tableName;
  const sourceBucket = sourceStackResources.bucketName;
  const sourceUserPoolId = sourceStackResources.userPoolId;

  const resolvedSourceUserId =
    sourceUserId || discoverSourceUserId({ tableName: sourceTable });
  if (!resolvedSourceUserId) {
    fail(
      `Could not resolve a source user id from stack "${sourceStackName}". Provide --source-user-id explicitly.`
    );
  }

  const sourceImages = pickSeedItems({
    items: queryUserItemsByPrefix({
      tableName: sourceTable,
      userId: resolvedSourceUserId,
      skPrefix: IMAGE_SK_PREFIX,
      limit: Math.max(imageLimit * 3, imageLimit),
    }).filter((item) => {
      const sourceKey = extractMediaKey({
        item,
        skPrefix: IMAGE_SK_PREFIX,
      });
      return sourceKey && !sourceKey.includes("/images/video-ready/");
    }),
    limit: imageLimit,
  });

  const sourceMusicTracks = pickSeedItems({
    items: queryUserItemsByPrefix({
      tableName: sourceTable,
      userId: resolvedSourceUserId,
      skPrefix: MUSIC_SK_PREFIX,
      limit: Math.max(musicLimit * 3, musicLimit),
    }),
    limit: musicLimit,
  });

  info(
    `Resolved source user "${resolvedSourceUserId}" from "${sourceStackName}" with ${sourceImages.length} image(s) and ${sourceMusicTracks.length} music track(s) selected.`
  );

  const perTargetResults = [];
  sanitizedTargets.forEach((targetStage) => {
    if (normalizedSourceStage && targetStage === normalizedSourceStage) {
      info(`Skipping target "${targetStage}" because it matches source stage.`);
      return;
    }

    const targetStack = buildStackId(targetStage);
    const targetStackResources = resolveStackResourceNames(targetStack);
    const targetTable = targetStackResources.tableName;
    const targetBucket = targetStackResources.bucketName;
    const targetUserPoolId = targetStackResources.userPoolId;

    const targetEmail =
      seedUserEmail || buildDefaultSeedEmail({ stage: targetStage });
    const targetPassword =
      seedUserPassword || process.env.SEED_USER_PASSWORD || buildGeneratedPassword();

    const targetUserId = ensureSeedUser({
      userPoolId: targetUserPoolId,
      email: targetEmail,
      password: targetPassword,
    });
    if (!targetUserId) {
      throw new Error(`Could not resolve target user id for "${targetEmail}"`);
    }

    const copiedImages = seedMediaItems({
      sourceItems: sourceImages,
      sourceBucket,
      sourceUserId: resolvedSourceUserId,
      targetBucket,
      targetTable,
      targetUserId,
      skPrefix: IMAGE_SK_PREFIX,
      type: "IMG",
      transformItem: ({ item, targetKey, nowIso }) => ({
        ...item,
        pk: buildUserPk(targetUserId),
        sk: `${IMAGE_SK_PREFIX}${targetKey}`,
        type: "IMG",
        key: targetKey,
        createdAt: item.createdAt || nowIso,
        updatedAt: nowIso,
      }),
    });

    const copiedMusic = seedMediaItems({
      sourceItems: sourceMusicTracks,
      sourceBucket,
      sourceUserId: resolvedSourceUserId,
      targetBucket,
      targetTable,
      targetUserId,
      skPrefix: MUSIC_SK_PREFIX,
      type: "STORY_MUSIC_LIBRARY_TRACK",
      transformItem: ({ item, targetKey, nowIso }) => ({
        ...item,
        pk: buildUserPk(targetUserId),
        sk: `${MUSIC_SK_PREFIX}${resolveTrackId(item)}`,
        type: "STORY_MUSIC_LIBRARY_TRACK",
        trackId: resolveTrackId(item),
        key: targetKey,
        sourceMusicKey: remapUserPrefix({
          key: String(item.sourceMusicKey || ""),
          sourceUserId: resolvedSourceUserId,
          targetUserId,
          fallback: "",
        }),
        createdAt: item.createdAt || nowIso,
        updatedAt: nowIso,
      }),
    });

    perTargetResults.push({
      targetStage,
      targetEmail,
      targetUserId,
      copiedImages,
      copiedMusic,
      sourceUserPoolId,
      targetUserPoolId,
    });

    info(
      [
        `Seeded stage "${targetStage}"`,
        `user_email=${targetEmail}`,
        `user_id=${targetUserId}`,
        `images=${copiedImages.length}`,
        `music=${copiedMusic.length}`,
      ].join(" | ")
    );
  });

  if (perTargetResults.length === 0) {
    info("No target stages were seeded.");
    return;
  }

  const summaryLines = perTargetResults.map((result) =>
    [
      `- stage=${result.targetStage}`,
      `user=${result.targetEmail}`,
      `user_id=${result.targetUserId}`,
      `images=${result.copiedImages.length}`,
      `music=${result.copiedMusic.length}`,
    ].join(" | ")
  );
  info(`Seed summary:\n${summaryLines.join("\n")}`);
}

function seedMediaItems({
  sourceItems,
  sourceBucket,
  sourceUserId,
  targetBucket,
  targetTable,
  targetUserId,
  skPrefix,
  type,
  transformItem,
}) {
  const copied = [];
  sourceItems.forEach((item) => {
    const sourceKey = extractMediaKey({
      item,
      skPrefix,
    });
    if (!sourceKey) {
      return;
    }
    const targetKey = remapUserPrefix({
      key: sourceKey,
      sourceUserId,
      targetUserId,
      fallback: `${buildUserPrefix(targetUserId)}seed/${path.basename(sourceKey)}`,
    });

    copyS3Object({
      sourceBucket,
      sourceKey,
      targetBucket,
      targetKey,
    });

    const nowIso = new Date().toISOString();
    const nextItem = sanitizeItemForWrite(
      transformItem({ item, targetKey, nowIso })
    );
    putDynamoItem({
      tableName: targetTable,
      item: nextItem,
    });

    copied.push({
      type,
      key: targetKey,
      sk: nextItem.sk,
    });
  });
  return copied;
}

function resolveTargetStages(parsedOptions) {
  const explicitStages = splitCsv(parsedOptions.stages).map((stage) =>
    resolveRequiredStage(stage)
  );
  const discoveredStages = parsedOptions.all ? listIdeaStages() : [];
  if (parsedOptions.all && discoveredStages.length === 0 && explicitStages.length === 0) {
    fail("No idea folders found for --all. Initialize at least one idea first.");
  }
  const combined = [...explicitStages, ...discoveredStages];
  if (combined.length === 0) {
    fail(`Provide --all or --stages for seed-many.\n${usage}`);
  }
  const excluded = new Set(
    splitCsv(parsedOptions.exclude).map((stage) => resolveRequiredStage(stage))
  );
  const unique = [...new Set(combined)]
    .filter((stage) => !excluded.has(stage))
    .sort();
  if (unique.length === 0) {
    fail("No target stages remain after applying include/exclude filters.");
  }
  return unique;
}

function listIdeaStages() {
  if (!fs.existsSync(IDEAS_DIR)) return [];
  return fs
    .readdirSync(IDEAS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name !== TEMPLATE_DIR_NAME && !name.startsWith("."))
    .map((name) => resolveOptionalStage(name))
    .filter(Boolean)
    .sort();
}

function getStackOutputs(stackName) {
  const response = runAwsJson([
    "cloudformation",
    "describe-stacks",
    "--stack-name",
    stackName,
    "--query",
    "Stacks[0].Outputs",
  ]);
  const outputsArray = Array.isArray(response) ? response : [];
  const outputsMap = {};
  outputsArray.forEach((entry) => {
    if (!entry || !entry.OutputKey) return;
    outputsMap[String(entry.OutputKey)] = String(entry.OutputValue || "");
  });
  return outputsMap;
}

function resolveStackResourceNames(stackName) {
  const outputs = getStackOutputs(stackName);
  const tableName =
    normalizeValue(outputs.MediaTableName) ||
    resolveStackPhysicalResourceIdByType({
      stackName,
      resourceType: "AWS::DynamoDB::Table",
      logicalPrefix: "MediaTable",
    });
  const bucketName =
    normalizeValue(outputs.MediaBucketName) ||
    resolveStackPhysicalResourceIdByType({
      stackName,
      resourceType: "AWS::S3::Bucket",
      logicalPrefix: "MediaBucket",
    });
  const userPoolId =
    normalizeValue(outputs.UserPoolId) ||
    resolveStackPhysicalResourceIdByType({
      stackName,
      resourceType: "AWS::Cognito::UserPool",
      logicalPrefix: "UserPool",
    });

  if (!tableName) {
    fail(`Missing media table name for stack "${stackName}".`);
  }
  if (!bucketName) {
    fail(`Missing media bucket name for stack "${stackName}".`);
  }
  if (!userPoolId) {
    fail(`Missing user pool id for stack "${stackName}".`);
  }

  return {
    tableName,
    bucketName,
    userPoolId,
  };
}

function resolveStackPhysicalResourceIdByType({
  stackName,
  resourceType,
  logicalPrefix,
}) {
  const response = runAwsJson([
    "cloudformation",
    "describe-stack-resources",
    "--stack-name",
    stackName,
    "--query",
    `StackResources[?ResourceType==\`${resourceType}\`].[LogicalResourceId,PhysicalResourceId]`,
  ]);
  const rows = Array.isArray(response) ? response : [];
  const entries = rows
    .filter((row) => Array.isArray(row) && row.length >= 2)
    .map((row) => ({
      logicalId: normalizeValue(row[0]),
      physicalId: normalizeValue(row[1]),
    }))
    .filter((entry) => entry.logicalId && entry.physicalId);
  if (entries.length === 0) {
    return "";
  }
  const preferred = entries.find((entry) => entry.logicalId.startsWith(logicalPrefix));
  if (preferred) {
    return preferred.physicalId;
  }
  entries.sort((left, right) => left.logicalId.localeCompare(right.logicalId));
  return entries[0].physicalId;
}

function requireOutput(outputsMap, outputKey, stackName) {
  const value = String(outputsMap[outputKey] || "");
  if (!value) {
    fail(`Missing output "${outputKey}" on stack "${stackName}".`);
  }
  return value;
}

function discoverSourceUserId({ tableName }) {
  let nextKey = null;
  const countsByUser = new Map();
  let scannedPages = 0;

  while (scannedPages < MAX_DISCOVERY_SCAN_PAGES) {
    const args = [
      "dynamodb",
      "scan",
      "--table-name",
      tableName,
      "--projection-expression",
      "#pk,#sk,#createdAt,#updatedAt",
      "--expression-attribute-names",
      JSON.stringify({
        "#pk": "pk",
        "#sk": "sk",
        "#createdAt": "createdAt",
        "#updatedAt": "updatedAt",
      }),
      "--filter-expression",
      "begins_with(#sk, :img) OR begins_with(#sk, :music)",
      "--expression-attribute-values",
      JSON.stringify({
        ":img": { S: IMAGE_SK_PREFIX },
        ":music": { S: MUSIC_SK_PREFIX },
      }),
      "--limit",
      String(PAGE_LIMIT),
    ];
    if (nextKey) {
      args.push("--exclusive-start-key", JSON.stringify(nextKey));
    }

    const response = runAwsJson(args);
    const items = Array.isArray(response.Items) ? response.Items : [];
    items.forEach((rawItem) => {
      const item = unmarshallItem(rawItem);
      const pk = String(item.pk || "");
      if (!pk.startsWith(USER_PK_PREFIX)) return;
      const userId = pk.slice(USER_PK_PREFIX.length);
      if (!userId) return;
      const current = countsByUser.get(userId) || {
        imageCount: 0,
        musicCount: 0,
        score: 0,
        latestAt: 0,
      };
      const sk = String(item.sk || "");
      if (sk.startsWith(IMAGE_SK_PREFIX)) current.imageCount += 1;
      if (sk.startsWith(MUSIC_SK_PREFIX)) current.musicCount += 1;
      current.score = current.imageCount + current.musicCount;
      const candidateTimestamp = Date.parse(item.updatedAt || item.createdAt || "");
      if (Number.isFinite(candidateTimestamp)) {
        current.latestAt = Math.max(current.latestAt, candidateTimestamp);
      }
      countsByUser.set(userId, current);
    });

    scannedPages += 1;
    nextKey = response.LastEvaluatedKey || null;
    if (!nextKey) break;
  }

  const candidates = Array.from(countsByUser.entries());
  candidates.sort((left, right) => {
    const leftStats = left[1];
    const rightStats = right[1];
    if (rightStats.score !== leftStats.score) {
      return rightStats.score - leftStats.score;
    }
    if (rightStats.latestAt !== leftStats.latestAt) {
      return rightStats.latestAt - leftStats.latestAt;
    }
    return left[0].localeCompare(right[0]);
  });
  return candidates[0]?.[0] || "";
}

function queryUserItemsByPrefix({ tableName, userId, skPrefix, limit }) {
  const pk = buildUserPk(userId);
  let nextKey = null;
  const items = [];

  while (items.length < limit) {
    const queryLimit = Math.min(limit - items.length, PAGE_LIMIT);
    const args = [
      "dynamodb",
      "query",
      "--table-name",
      tableName,
      "--key-condition-expression",
      "#pk = :pk AND begins_with(#sk, :skPrefix)",
      "--expression-attribute-names",
      JSON.stringify({
        "#pk": "pk",
        "#sk": "sk",
      }),
      "--expression-attribute-values",
      JSON.stringify({
        ":pk": { S: pk },
        ":skPrefix": { S: skPrefix },
      }),
      "--limit",
      String(queryLimit),
      "--no-scan-index-forward",
    ];
    if (nextKey) {
      args.push("--exclusive-start-key", JSON.stringify(nextKey));
    }
    const response = runAwsJson(args);
    const pageItems = Array.isArray(response.Items) ? response.Items : [];
    pageItems.forEach((rawItem) => {
      items.push(unmarshallItem(rawItem));
    });
    nextKey = response.LastEvaluatedKey || null;
    if (!nextKey) break;
  }

  return items.slice(0, limit);
}

function putDynamoItem({ tableName, item }) {
  runAwsJson(
    [
      "dynamodb",
      "put-item",
      "--table-name",
      tableName,
      "--item",
      JSON.stringify(marshallItem(item)),
    ],
    { outputJson: false }
  );
}

function copyS3Object({ sourceBucket, sourceKey, targetBucket, targetKey }) {
  runAwsJson(
    [
      "s3api",
      "copy-object",
      "--copy-source",
      buildCopySourcePath({ bucket: sourceBucket, key: sourceKey }),
      "--bucket",
      targetBucket,
      "--key",
      targetKey,
    ],
    { outputJson: false }
  );
}

function ensureSeedUser({ userPoolId, email, password }) {
  const userAttributes = [
    `Name=email,Value=${email}`,
    "Name=email_verified,Value=true",
  ];
  const createResponse = runAwsRaw([
    "cognito-idp",
    "admin-create-user",
    "--user-pool-id",
    userPoolId,
    "--username",
    email,
    "--temporary-password",
    password,
    "--message-action",
    "SUPPRESS",
    "--user-attributes",
    ...userAttributes,
  ]);
  if (!createResponse.ok) {
    const stderr = String(createResponse.stderr || "");
    if (!stderr.includes("UsernameExistsException")) {
      fail(`Failed to create seed user "${email}": ${stderr || "unknown error"}`);
    }
  }

  runAwsRaw([
    "cognito-idp",
    "admin-update-user-attributes",
    "--user-pool-id",
    userPoolId,
    "--username",
    email,
    "--user-attributes",
    ...userAttributes,
  ]);

  runAwsRaw([
    "cognito-idp",
    "admin-set-user-password",
    "--user-pool-id",
    userPoolId,
    "--username",
    email,
    "--password",
    password,
    "--permanent",
  ]);

  const userResponse = runAwsJson([
    "cognito-idp",
    "admin-get-user",
    "--user-pool-id",
    userPoolId,
    "--username",
    email,
    "--query",
    "UserAttributes",
  ]);
  const attributes = Array.isArray(userResponse) ? userResponse : [];
  const sub = attributes.find((attribute) => attribute?.Name === "sub")?.Value || "";
  return String(sub || "");
}

function pickSeedItems({ items, limit }) {
  const sortable = [...items];
  sortable.sort((left, right) => {
    const leftTimestamp = Date.parse(left.updatedAt || left.createdAt || "");
    const rightTimestamp = Date.parse(right.updatedAt || right.createdAt || "");
    if (Number.isFinite(rightTimestamp) && Number.isFinite(leftTimestamp)) {
      if (rightTimestamp !== leftTimestamp) {
        return rightTimestamp - leftTimestamp;
      }
    }
    const leftKey = String(left.key || left.sk || "");
    const rightKey = String(right.key || right.sk || "");
    return rightKey.localeCompare(leftKey);
  });
  return sortable.slice(0, limit);
}

function extractMediaKey({ item, skPrefix }) {
  const directKey = normalizeValue(item.key);
  if (directKey) return directKey;
  const sk = normalizeValue(item.sk);
  if (!sk.startsWith(skPrefix)) return "";
  return sk.slice(skPrefix.length);
}

function remapUserPrefix({ key, sourceUserId, targetUserId, fallback }) {
  const normalizedKey = String(key || "");
  if (!normalizedKey) return String(fallback || "");
  const sourcePrefix = buildUserPrefix(sourceUserId);
  const targetPrefix = buildUserPrefix(targetUserId);
  if (normalizedKey.startsWith(sourcePrefix)) {
    return `${targetPrefix}${normalizedKey.slice(sourcePrefix.length)}`;
  }
  return String(fallback || normalizedKey);
}

function resolveTrackId(item = {}) {
  const trackId = normalizeValue(item.trackId);
  if (trackId) return trackId;
  const sk = normalizeValue(item.sk);
  if (sk.startsWith(MUSIC_SK_PREFIX)) {
    return sk.slice(MUSIC_SK_PREFIX.length);
  }
  return `seed-track-${Date.now()}`;
}

function sanitizeItemForWrite(item = {}) {
  const sanitized = {};
  Object.entries(item).forEach(([key, value]) => {
    if (typeof value === "undefined") return;
    if (value === null) {
      sanitized[key] = null;
      return;
    }
    if (key === "url" && typeof value === "string") {
      return;
    }
    sanitized[key] = value;
  });
  return sanitized;
}

function buildCopySourcePath({ bucket, key }) {
  const encodedKey = encodeURIComponent(key).replace(/%2F/g, "/");
  return `${bucket}/${encodedKey}`;
}

function buildUserPk(userId = "") {
  return `${USER_PK_PREFIX}${userId}`;
}

function buildUserPrefix(userId = "") {
  return `users/${userId}/`;
}

function buildDefaultSeedEmail({ stage }) {
  return `seed+${stage}@example.com`;
}

function buildGeneratedPassword() {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const symbols = "!@#$%^&*_-+=";
  const all = `${upper}${lower}${digits}${symbols}`;
  const chars = [
    upper[randomIndex(upper.length)],
    lower[randomIndex(lower.length)],
    digits[randomIndex(digits.length)],
    symbols[randomIndex(symbols.length)],
  ];
  while (chars.length < 18) {
    chars.push(all[randomIndex(all.length)]);
  }
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    const temp = chars[index];
    chars[index] = chars[swapIndex];
    chars[swapIndex] = temp;
  }
  return chars.join("");
}

function randomIndex(maxExclusive) {
  const randomBuffer = crypto.randomBytes(4);
  const randomValue = randomBuffer.readUInt32BE(0);
  return randomValue % maxExclusive;
}

function splitCsv(rawValue) {
  return String(rawValue || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function resolveRequiredStage(rawStage) {
  const resolved = resolveOptionalStage(rawStage);
  if (!resolved) {
    fail(`A valid stage is required.\n${usage}`);
  }
  return resolved;
}

function resolveOptionalStage(rawStage) {
  const normalized = String(rawStage || "")
    .toLowerCase()
    .replace(STAGE_INVALID_PATTERN, "-")
    .replace(STAGE_MULTI_DASH_PATTERN, "-")
    .replace(STAGE_EDGE_DASH_PATTERN, "");
  if (!normalized) return "";
  if (normalized === TEMPLATE_DIR_NAME) {
    fail(`The stage name "${TEMPLATE_DIR_NAME}" is reserved.`);
  }
  return normalized;
}

function resolvePositiveInteger(rawValue, fallback) {
  const text = String(rawValue || "").trim();
  if (!text) return fallback;
  if (!POSITIVE_INTEGER_PATTERN.test(text)) {
    fail(`Expected a non-negative integer, received "${text}".`);
  }
  return Number(text);
}

function normalizeValue(value) {
  return String(value || "")
    .replace(ACTIVITY_SEPARATOR_PATTERN, "/")
    .trim();
}

function buildStackId(stage) {
  return `${STACK_ID_PREFIX}-${resolveRequiredStage(stage)}`;
}

function runAwsJson(args, options = {}) {
  const outputJson = options.outputJson !== false;
  const fullArgs = outputJson ? [...args, "--output", "json"] : args;
  const result = runAwsRaw(fullArgs);
  if (!result.ok) {
    fail(
      `AWS command failed: aws ${fullArgs.join(" ")}\n${result.stderr || result.stdout || ""}`
    );
  }
  if (!outputJson) return {};
  const stdout = String(result.stdout || "").trim();
  if (!stdout) return {};
  try {
    return JSON.parse(stdout);
  } catch (error) {
    fail(`Failed to parse AWS JSON output.\n${stdout}`);
  }
}

function runAwsRaw(args) {
  const result = spawnSync("aws", args, {
    cwd: ROOT_DIR,
    encoding: "utf8",
    env: process.env,
  });
  return {
    ok: result.status === 0,
    status: result.status || 0,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function unmarshallItem(item = {}) {
  const result = {};
  Object.entries(item).forEach(([key, value]) => {
    result[key] = unmarshallValue(value);
  });
  return result;
}

function unmarshallValue(value = {}) {
  if (Object.prototype.hasOwnProperty.call(value, "S")) return value.S;
  if (Object.prototype.hasOwnProperty.call(value, "N")) return Number(value.N);
  if (Object.prototype.hasOwnProperty.call(value, "BOOL")) return Boolean(value.BOOL);
  if (Object.prototype.hasOwnProperty.call(value, "NULL")) return null;
  if (Object.prototype.hasOwnProperty.call(value, "SS")) return [...value.SS];
  if (Object.prototype.hasOwnProperty.call(value, "NS")) {
    return value.NS.map((entry) => Number(entry));
  }
  if (Object.prototype.hasOwnProperty.call(value, "L")) {
    return value.L.map((entry) => unmarshallValue(entry));
  }
  if (Object.prototype.hasOwnProperty.call(value, "M")) {
    const mapped = {};
    Object.entries(value.M).forEach(([nestedKey, nestedValue]) => {
      mapped[nestedKey] = unmarshallValue(nestedValue);
    });
    return mapped;
  }
  return null;
}

function marshallItem(item = {}) {
  const marshalled = {};
  Object.entries(item).forEach(([key, value]) => {
    marshalled[key] = marshallValue(value);
  });
  return marshalled;
}

function marshallValue(value) {
  if (value === null) return { NULL: true };
  if (typeof value === "string") return { S: value };
  if (typeof value === "number") return { N: String(value) };
  if (typeof value === "boolean") return { BOOL: value };
  if (Array.isArray(value)) {
    return { L: value.map((entry) => marshallValue(entry)) };
  }
  if (typeof value === "object") {
    const mapped = {};
    Object.entries(value).forEach(([nestedKey, nestedValue]) => {
      if (typeof nestedValue === "undefined") return;
      mapped[nestedKey] = marshallValue(nestedValue);
    });
    return { M: mapped };
  }
  return { S: String(value) };
}

function fail(message) {
  console.error(`[seed-idea-content] ${message}`);
  process.exit(1);
}

function info(message) {
  console.log(`[seed-idea-content] ${message}`);
}
