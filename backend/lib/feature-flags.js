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
  "agentMode",
];

// Module-level cache: { data: FlagMap, expiresAt: number } | null
let _cache = null;

/**
 * Build the default flags object (all flags = true).
 * @returns {object}
 */
const buildDefaultFlags = () => Object.fromEntries(KNOWN_FLAGS.map((k) => [k, true]));

/**
 * Cohort identifiers a flag value can take instead of a boolean. Lets a flag
 * gradually roll out to subsets of users without touching every endpoint.
 *   - "all"   → behaves like `true`
 *   - "admin" → only users whose JWT claims include admin
 *   - "beta"  → users in the "beta" Cognito group (req.user.roles)
 * Any other string falls back to `true` (fail open — never accidentally lock
 * out users with malformed flag values).
 */
const VALID_COHORTS = ["all", "admin", "beta"];

/**
 * Merge stored flags with defaults so new flags always have a value.
 * Preserves cohort strings as-is. Strict `false` becomes `false`. Anything
 * else coerces to `true` so legacy boolean-true flags keep working.
 *
 * @param {object} stored
 * @returns {object}
 */
const mergeFlags = (stored = {}) => {
  const defaults = buildDefaultFlags();
  const result = { ...defaults };
  for (const key of KNOWN_FLAGS) {
    if (!Object.prototype.hasOwnProperty.call(stored, key)) continue;
    const raw = stored[key];
    if (raw === false) {
      result[key] = false;
    } else if (typeof raw === "string" && VALID_COHORTS.includes(raw)) {
      result[key] = raw; // preserve cohort scoping
    } else {
      result[key] = true;
    }
  }
  return result;
};

/**
 * Evaluate a (possibly cohort-scoped) flag against a user.
 *
 * @param {object} flags  - the merged flag map
 * @param {string} key    - flag key
 * @param {object} user   - typically req.user; may have { isAdmin, roles?:string[] }
 * @returns {boolean}
 */
const evaluateFlag = (flags = {}, key = "", user = null) => {
  const value = flags[key];
  if (value === false) return false;
  if (value === true || value === "all") return true;
  if (value === "admin") return Boolean(user?.isAdmin);
  if (value === "beta") {
    const roles = user?.roles || user?.groups || [];
    return Array.isArray(roles) && roles.includes("beta");
  }
  // Unknown string → fail open
  return true;
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
  VALID_COHORTS,
  getFlags,
  saveFlags,
  invalidateFlagsCache,
  evaluateFlag,
};
