"use strict";

/**
 * agent-rate-limit — token bucket per user for the agent endpoints.
 *
 * Implementation: one record at `(USER#{userId}, AGENT#RATE)` holding
 *   { tokens: number, refilledAt: epoch_ms, updatedAt: epoch_ms }
 *
 * On every call:
 *   1. Read the bucket (GetCommand).
 *   2. Refill: add `(now - refilledAt) / REFILL_INTERVAL_MS * REFILL_PER_INTERVAL`
 *      tokens, capped at `BUCKET_CAPACITY`. First-time users start with a full
 *      bucket.
 *   3. If `tokens >= 1`, decrement and write back. Allow the request.
 *   4. Otherwise, deny (429).
 *
 * Defaults: 30-token bucket, refilled at 1 token / 2s ⇒ sustains ~30 req/min
 * burst, ~30 req/min steady-state. Tunable per-call via opts.
 *
 * Fail-open: if DynamoDB is unavailable or the read/write fails, we allow the
 * request. This is a guardrail against abuse, not a hard correctness invariant.
 */

const { buildMediaPk, buildAgentRateLimitSk } = require("./keys");

const DEFAULTS = {
  capacity: 30,
  refillPerInterval: 1,
  refillIntervalMs: 2000,
};

function createAgentRateLimit({ dynamoClient, mediaTable }) {
  if (!dynamoClient || !mediaTable) {
    return {
      check: async () => ({ allowed: true, remaining: null, retryAfterMs: 0 }),
    };
  }
  const { GetCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

  /**
   * Check + consume one token. Returns
   *   { allowed: true,  remaining }              on success
   *   { allowed: false, retryAfterMs, remaining: 0 }  when over limit
   */
  async function check(userId, opts = {}) {
    if (!userId) return { allowed: true, remaining: null, retryAfterMs: 0 };
    const cap = opts.capacity ?? DEFAULTS.capacity;
    const refillPer = opts.refillPerInterval ?? DEFAULTS.refillPerInterval;
    const refillMs = opts.refillIntervalMs ?? DEFAULTS.refillIntervalMs;
    const pk = buildMediaPk(userId);
    const sk = buildAgentRateLimitSk();
    const now = Date.now();

    let existing = null;
    try {
      const result = await dynamoClient.send(
        new GetCommand({ TableName: mediaTable, Key: { pk, sk } })
      );
      existing = result?.Item || null;
    } catch {
      // Fail open — never block traffic on a DynamoDB read hiccup
      return { allowed: true, remaining: null, retryAfterMs: 0 };
    }

    // Compute refilled balance
    const lastRefill = existing?.refilledAt || now;
    const lastTokens = typeof existing?.tokens === "number" ? existing.tokens : cap;
    const elapsedIntervals = Math.floor((now - lastRefill) / refillMs);
    const refilled = Math.min(cap, lastTokens + elapsedIntervals * refillPer);

    if (refilled < 1) {
      // No tokens — denied. Estimate retry-after as the time until next token.
      const sinceLastInterval = (now - lastRefill) % refillMs;
      const retryAfterMs = Math.max(refillMs - sinceLastInterval, 100);
      return { allowed: false, remaining: 0, retryAfterMs };
    }

    // Spend one and persist. UpdateCommand with conditional check would be
    // bulletproof against concurrent requests, but a simple write is fine
    // here: worst case two concurrent requests each consume a token they
    // weren't supposed to — the bucket converges within one refill cycle.
    const newTokens = refilled - 1;
    const newRefilledAt = lastRefill + elapsedIntervals * refillMs;

    try {
      await dynamoClient.send(
        new UpdateCommand({
          TableName: mediaTable,
          Key: { pk, sk },
          UpdateExpression: "SET tokens = :t, refilledAt = :r, updatedAt = :u",
          ExpressionAttributeValues: {
            ":t": newTokens,
            ":r": newRefilledAt,
            ":u": now,
          },
        })
      );
    } catch {
      // Best-effort; still allow this request
    }
    return { allowed: true, remaining: newTokens, retryAfterMs: 0 };
  }

  return { check };
}

module.exports = { createAgentRateLimit, RATE_LIMIT_DEFAULTS: DEFAULTS };
