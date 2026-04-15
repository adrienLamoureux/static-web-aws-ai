"use strict";

/**
 * feature-flags.js
 *
 * In-memory cache (60s TTL) backed by a DynamoDB record:
 *   pk = APP#GLOBAL, sk = CFG#FEATURES, attribute: flags (map)
 *
 * All flags default to `true` when the DynamoDB item doesn't exist yet,
 * so disabling a feature is an explicit action.
 *
 * Exported API:
 *   getFlags(deps)           → Promise<FlagMap>
 *   invalidateFlagsCache()   → void
 *   KNOWN_FLAGS              → string[]
 */

const FEATURES_PK = "APP#GLOBAL";
const FEATURES_SK = "CFG#FEATURES";
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

const KNOWN_FLAGS = [
  "enableStoryAnimations",
  "enableCivitaiSync",
  "enableNovaReelVideos",
  "enableCompanionInitiative",
];

// Module-level cache: { data: FlagMap, expiresAt: number } | null
let _cache = null;

/**
 * Build the default flags object (all flags = true).
 * @returns {object}
 */
const buildDefaultFlags = () => Object.fromEntries(KNOWN_FLAGS.map((k) => [k, true]));

/**
 * Merge stored flags with defaults so new flags always have a value.
 * Non-boolean values are coerced to true.
 * Unknown stored keys are ignored.
 *
 * @param {object} stored
 * @returns {object}
 */
const mergeFlags = (stored = {}) => {
  const defaults = buildDefaultFlags();
  const result = { ...defaults };
  for (const key of KNOWN_FLAGS) {
    if (Object.prototype.hasOwnProperty.call(stored, key)) {
      result[key] = stored[key] !== false; // coerce to bool, strict false = disabled
    }
  }
  return result;
};

/** Invalidate the in-memory cache (called after a PUT). */
const invalidateFlagsCache = () => {
  _cache = null;
};

/**
 * Get the current feature flags.
 * Uses cache when available. Falls back to all-true defaults on error.
 *
 * @param {object} deps
 * @param {object} deps.dynamoClient - DynamoDBDocumentClient
 * @param {string} deps.mediaTable   - table name
 * @returns {Promise<object>}        - { enableStoryAnimations, ... }
 */
const getFlags = async (deps = {}) => {
  const { dynamoClient, mediaTable } = deps;

  // Return cached value if still valid
  if (_cache && _cache.expiresAt > Date.now()) {
    return _cache.data;
  }

  if (!dynamoClient || !mediaTable) {
    // No DB available — return defaults without caching
    return buildDefaultFlags();
  }

  try {
    const { GetCommand } = require("@aws-sdk/lib-dynamodb");
    const result = await dynamoClient.send(
      new GetCommand({ TableName: mediaTable, Key: { pk: FEATURES_PK, sk: FEATURES_SK } })
    );
    const stored = result.Item?.flags || {};
    const flags = mergeFlags(stored);

    _cache = { data: flags, expiresAt: Date.now() + CACHE_TTL_MS };
    return flags;
  } catch {
    // On error, return defaults (fail open)
    return buildDefaultFlags();
  }
};

/**
 * Persist updated flags to DynamoDB and invalidate cache.
 *
 * @param {object} deps
 * @param {object} deps.dynamoClient
 * @param {string} deps.mediaTable
 * @param {object} patch  — partial flag object (validated caller-side)
 * @returns {Promise<object>} — the full merged flags after save
 */
const saveFlags = async (deps = {}, patch = {}) => {
  const { dynamoClient, mediaTable } = deps;

  if (!dynamoClient || !mediaTable) {
    throw new Error("DynamoDB not available");
  }

  const { GetCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");

  // Read current to merge
  const result = await dynamoClient
    .send(new GetCommand({ TableName: mediaTable, Key: { pk: FEATURES_PK, sk: FEATURES_SK } }))
    .catch(() => ({ Item: null }));

  const currentStored = result.Item?.flags || {};
  const merged = mergeFlags({ ...currentStored, ...patch });

  await dynamoClient.send(
    new PutCommand({
      TableName: mediaTable,
      Item: {
        pk: FEATURES_PK,
        sk: FEATURES_SK,
        flags: merged,
        updatedAt: new Date().toISOString(),
      },
    })
  );

  invalidateFlagsCache();
  return merged;
};

module.exports = {
  KNOWN_FLAGS,
  FEATURES_PK,
  FEATURES_SK,
  getFlags,
  saveFlags,
  invalidateFlagsCache,
};
