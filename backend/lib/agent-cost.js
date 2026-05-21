"use strict";

/**
 * agent-cost — per-user running totals for agent Bedrock spend.
 *
 * Persistence:
 *   pk = USER#{userId}
 *   sk = AGENT#COST
 *   { inputTokens, outputTokens, turnCount, lastUpdatedAt }
 *
 * Atomic increments via DynamoDB `ADD` so concurrent turns can't lose counts.
 * Fail-silent — telemetry must never break a request.
 *
 * The Sanctum cost view (future) will sum these across users.
 */

const { buildMediaPk, buildAgentCostSk, buildAgentImageCountSk } = require("./keys");

// Default per-user image generation cap per UTC day. Bounds the Replicate
// spend exposure (the dominant cost driver). 50 ≈ $2.50/day at $0.05/image.
const DEFAULT_IMAGE_DAILY_CAP = 50;

function createAgentCost({ dynamoClient, mediaTable }) {
  if (!dynamoClient || !mediaTable) {
    return {
      record: async () => {},
      load: async () => null,
      scanAll: async () => ({ items: [], scannedCount: 0, truncated: false }),
      checkDailyCap: async () => ({ allowed: true, remaining: null, retryAfterMs: 0 }),
      checkDailyImageCap: async () => ({ allowed: true, remaining: null, retryAfterMs: 0 }),
      recordImage: async () => {},
    };
  }
  const { GetCommand, UpdateCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");

  // Day boundary in ms (UTC). Used by checkDailyCap to reset the
  // tokensToday counter at midnight UTC for a stable rolling window.
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const dayStart = (now = Date.now()) => now - (now % ONE_DAY_MS);

  /**
   * Record one turn's usage. Pass the aggregated input+output tokens across
   * all Bedrock calls in the turn (initial Converse + closing turn).
   *
   * Also increments `tokensToday` (after rolling at UTC midnight) so the
   * daily-cap gate has fresh numbers without a second write.
   */
  async function record(userId, { inputTokens = 0, outputTokens = 0 } = {}) {
    if (!userId) return;
    const it = Math.max(0, Math.floor(Number(inputTokens) || 0));
    const ot = Math.max(0, Math.floor(Number(outputTokens) || 0));
    if (it === 0 && ot === 0) return;

    const now = Date.now();
    const today = dayStart(now);

    // First read existing dayStartedAt so we know whether to reset or add.
    let existingDayStart = null;
    let existingTokensToday = 0;
    try {
      const result = await dynamoClient.send(
        new GetCommand({
          TableName: mediaTable,
          Key: { pk: buildMediaPk(userId), sk: buildAgentCostSk() },
        })
      );
      existingDayStart = result?.Item?.dayStartedAt || null;
      existingTokensToday = result?.Item?.tokensToday || 0;
    } catch {
      // Continue with defaults
    }

    const rolledOver = existingDayStart && existingDayStart < today;
    const newTokensToday =
      rolledOver || !existingDayStart ? it + ot : existingTokensToday + it + ot;

    try {
      await dynamoClient.send(
        new UpdateCommand({
          TableName: mediaTable,
          Key: { pk: buildMediaPk(userId), sk: buildAgentCostSk() },
          UpdateExpression:
            "ADD inputTokens :i, outputTokens :o, turnCount :one " +
            "SET lastUpdatedAt = :now, tokensToday = :tt, dayStartedAt = :ds",
          ExpressionAttributeValues: {
            ":i": it,
            ":o": ot,
            ":one": 1,
            ":now": now,
            ":tt": newTokensToday,
            ":ds": today,
          },
        })
      );
    } catch {
      // Silent — telemetry must never break a request
    }
  }

  /**
   * Check whether the user is under their daily IMAGE cap (separate from the
   * token cap). Caps the Replicate spend exposure — image generation is the
   * dominant cost driver (~90% of total per the cost model).
   *
   * Returns { allowed: true, remaining } on success;
   *         { allowed: false, capacity, imagesToday, retryAfterMs } when over.
   * Fails open on DB errors.
   */
  async function checkDailyImageCap(userId, opts = {}) {
    const cap = opts.dailyImageCap ?? DEFAULT_IMAGE_DAILY_CAP;
    if (!userId || cap <= 0) return { allowed: true, remaining: null, retryAfterMs: 0 };
    const today = dayStart();
    try {
      const result = await dynamoClient.send(
        new GetCommand({
          TableName: mediaTable,
          Key: { pk: buildMediaPk(userId), sk: buildAgentImageCountSk() },
        })
      );
      const item = result?.Item;
      const imagesToday =
        item?.dayStartedAt && item.dayStartedAt >= today ? item.imagesToday || 0 : 0;
      if (imagesToday >= cap) {
        const retryAfterMs = Math.max(1000, today + ONE_DAY_MS - Date.now());
        return { allowed: false, capacity: cap, imagesToday, retryAfterMs };
      }
      return { allowed: true, remaining: cap - imagesToday, retryAfterMs: 0 };
    } catch {
      return { allowed: true, remaining: null, retryAfterMs: 0 };
    }
  }

  /**
   * Increment the user's daily image counter. Resets at UTC midnight via the
   * same dayStart trick used by `record`. Atomic ADD for `totalImages` so
   * lifetime counts can't lose increments under concurrency.
   */
  async function recordImage(userId, count = 1) {
    if (!userId) return;
    const n = Math.max(1, Math.floor(Number(count) || 1));
    const now = Date.now();
    const today = dayStart(now);

    let existingDayStart = null;
    let existingImagesToday = 0;
    try {
      const result = await dynamoClient.send(
        new GetCommand({
          TableName: mediaTable,
          Key: { pk: buildMediaPk(userId), sk: buildAgentImageCountSk() },
        })
      );
      existingDayStart = result?.Item?.dayStartedAt || null;
      existingImagesToday = result?.Item?.imagesToday || 0;
    } catch {
      // Continue with defaults
    }
    const rolledOver = existingDayStart && existingDayStart < today;
    const newImagesToday = rolledOver || !existingDayStart ? n : existingImagesToday + n;

    try {
      await dynamoClient.send(
        new UpdateCommand({
          TableName: mediaTable,
          Key: { pk: buildMediaPk(userId), sk: buildAgentImageCountSk() },
          UpdateExpression:
            "ADD totalImages :n SET lastUpdatedAt = :now, imagesToday = :it, dayStartedAt = :ds",
          ExpressionAttributeValues: {
            ":n": n,
            ":now": now,
            ":it": newImagesToday,
            ":ds": today,
          },
        })
      );
    } catch {
      // Silent — telemetry must never break a request
    }
  }

  /**
   * Check whether the user is under their daily token cap. Returns
   *   { allowed: true, remaining }            on success
   *   { allowed: false, capacity, tokensToday, retryAfterMs } when over
   * Fails open on DB errors. Default cap is 200k tokens/day (~$0.20 at
   * Haiku prices) — tunable per call via opts.dailyCap.
   */
  async function checkDailyCap(userId, opts = {}) {
    const cap = opts.dailyCap ?? 200_000;
    if (!userId || cap <= 0) return { allowed: true, remaining: null, retryAfterMs: 0 };
    const today = dayStart();
    try {
      const result = await dynamoClient.send(
        new GetCommand({
          TableName: mediaTable,
          Key: { pk: buildMediaPk(userId), sk: buildAgentCostSk() },
        })
      );
      const item = result?.Item;
      // Counter rolls over at UTC midnight automatically by ignoring old data
      const tokensToday =
        item?.dayStartedAt && item.dayStartedAt >= today ? item.tokensToday || 0 : 0;
      if (tokensToday >= cap) {
        const retryAfterMs = Math.max(1000, today + ONE_DAY_MS - Date.now());
        return { allowed: false, capacity: cap, tokensToday, retryAfterMs };
      }
      return { allowed: true, remaining: cap - tokensToday, retryAfterMs: 0 };
    } catch {
      return { allowed: true, remaining: null, retryAfterMs: 0 };
    }
  }

  async function load(userId) {
    if (!userId) return null;
    try {
      const result = await dynamoClient.send(
        new GetCommand({
          TableName: mediaTable,
          Key: { pk: buildMediaPk(userId), sk: buildAgentCostSk() },
        })
      );
      if (!result?.Item) return null;
      return {
        inputTokens: result.Item.inputTokens || 0,
        outputTokens: result.Item.outputTokens || 0,
        turnCount: result.Item.turnCount || 0,
        lastUpdatedAt: result.Item.lastUpdatedAt || null,
      };
    } catch {
      return null;
    }
  }

  /**
   * Admin-only — scan all AGENT#COST records across users. Returns
   * `{ items, scannedCount, lastKey? }`. Uses a FilterExpression on the
   * single-table sort key; intentionally not optimised for read-heavy paths
   * since this powers the Sanctum cost dashboard (occasional access).
   *
   * Stops at `maxItems` after merging pages (default 200).
   */
  async function scanAll({ maxItems = 200 } = {}) {
    const items = [];
    let exclusiveStartKey;
    let scanned = 0;
    let pages = 0;
    const MAX_PAGES = 10; // hard ceiling so a misuse can't burn capacity

    try {
      do {
        const result = await dynamoClient.send(
          new ScanCommand({
            TableName: mediaTable,
            FilterExpression: "sk = :sk",
            ExpressionAttributeValues: { ":sk": "AGENT#COST" },
            ExclusiveStartKey: exclusiveStartKey,
          })
        );
        scanned += result?.ScannedCount || 0;
        for (const item of result?.Items || []) {
          // pk format is "USER#<sub>"
          const userId = String(item.pk || "").replace(/^USER#/, "");
          items.push({
            userId,
            inputTokens: item.inputTokens || 0,
            outputTokens: item.outputTokens || 0,
            turnCount: item.turnCount || 0,
            lastUpdatedAt: item.lastUpdatedAt || null,
          });
          if (items.length >= maxItems) break;
        }
        exclusiveStartKey = result?.LastEvaluatedKey;
        pages += 1;
      } while (exclusiveStartKey && items.length < maxItems && pages < MAX_PAGES);
    } catch {
      // Return whatever we collected
    }
    return {
      items,
      scannedCount: scanned,
      truncated: Boolean(exclusiveStartKey) && items.length >= maxItems,
    };
  }

  return { record, load, scanAll, checkDailyCap, checkDailyImageCap, recordImage };
}

module.exports = { createAgentCost, DEFAULT_IMAGE_DAILY_CAP };
