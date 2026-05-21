"use strict";

/**
 * agent-config — runtime-configurable agent settings stored in DynamoDB.
 *
 * Persistence:
 *   pk = CONFIG#AGENT
 *   sk = CONFIG#AGENT
 *   { modelId: "us.anthropic.claude-haiku-4-5...", updatedAt }
 *
 * Provides a getter (with in-memory cache) + a setter. The getter falls back
 * to `deps.promptHelperModelId` (the env-backed default) when no record
 * exists or DynamoDB is unreachable — agent always boots even if config is
 * mid-migration.
 *
 * 60s cache TTL mirrors feature-flags.js; admins editing via Sanctum see
 * their changes propagate within a minute (or a redeploy).
 */

const AGENT_CONFIG_PK = "CONFIG#AGENT";
const AGENT_CONFIG_SK = "CONFIG#AGENT";
const CACHE_TTL_MS = 60 * 1000;

let _cache = null;
const invalidateCache = () => {
  _cache = null;
};

/**
 * Resolve the active agent Bedrock model id. Returns the configured override
 * if one exists, otherwise the env-backed default.
 */
async function getAgentModelId(deps) {
  if (_cache && _cache.expiresAt > Date.now()) return _cache.value;
  const fallback = deps?.promptHelperModelId || "us.anthropic.claude-haiku-4-5-20251001-v1:0";
  const { dynamoClient, mediaTable } = deps || {};
  if (!dynamoClient || !mediaTable) return fallback;
  try {
    const { GetCommand } = require("@aws-sdk/lib-dynamodb");
    const result = await dynamoClient.send(
      new GetCommand({
        TableName: mediaTable,
        Key: { pk: AGENT_CONFIG_PK, sk: AGENT_CONFIG_SK },
      })
    );
    const stored = result?.Item?.modelId;
    const value = typeof stored === "string" && stored.trim() ? stored.trim() : fallback;
    _cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return fallback;
  }
}

async function setAgentModelId(deps, modelId) {
  if (typeof modelId !== "string" || !modelId.trim()) throw new Error("modelId required");
  const { dynamoClient, mediaTable } = deps || {};
  if (!dynamoClient || !mediaTable) throw new Error("DynamoDB unavailable");
  const { PutCommand } = require("@aws-sdk/lib-dynamodb");
  await dynamoClient.send(
    new PutCommand({
      TableName: mediaTable,
      Item: {
        pk: AGENT_CONFIG_PK,
        sk: AGENT_CONFIG_SK,
        modelId: modelId.trim(),
        updatedAt: new Date().toISOString(),
      },
    })
  );
  invalidateCache();
  return modelId.trim();
}

module.exports = {
  AGENT_CONFIG_PK,
  AGENT_CONFIG_SK,
  getAgentModelId,
  setAgentModelId,
  invalidateAgentConfigCache: invalidateCache,
};
