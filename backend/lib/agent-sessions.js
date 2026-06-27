"use strict";

/**
 * agent-sessions — named conversation sessions for Agent mode.
 *
 * A session is just a string id + a metadata record. The id doubles as the
 * memory namespace key passed to agent-memory functions, so per-session
 * conversation history works out of the box via the existing
 * `AGENT#{sessionId}#MSG#{ts}` layout.
 *
 * Storage:
 *   pk = USER#{userId}
 *   sk = AGENT#SESSION#{sessionId}
 *   { name, createdAt, lastUsedAt }
 *
 * Note: deleting a session here removes only the metadata record. Memory
 * messages live under `AGENT#{sessionId}#MSG#...`; callers should call
 * `agentMemory.clearMemory(userId, sessionId)` before delete if they want
 * the conversation history wiped too.
 */

const { buildMediaPk, buildAgentSessionSk, agentSessionPrefix } = require("./keys");

const MAX_NAME_LEN = 60;
const RESERVED_IDS = new Set(["default"]); // can be referenced but never deleted

const sanitiseName = (raw) => {
  const trimmed = String(raw || "")
    .trim()
    .slice(0, MAX_NAME_LEN);
  return trimmed || "Untitled session";
};

const sanitiseSessionId = (raw) => {
  const s = String(raw || "").trim();
  if (!s) return "";
  // Permit alphanumerics, hyphen, underscore; lowercase. Reject anything else.
  if (!/^[a-zA-Z0-9_-]+$/.test(s)) return "";
  return s.toLowerCase().slice(0, 80);
};

function createAgentSessions({ dynamoClient, mediaTable, queryBySkPrefix }) {
  if (!dynamoClient || !mediaTable) {
    return {
      list: async () => [],
      create: async () => null,
      rename: async () => null,
      touch: async () => {},
      remove: async () => false,
    };
  }
  const { PutCommand, UpdateCommand, DeleteCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");

  /**
   * List the user's sessions sorted by lastUsedAt desc. Empty list when none
   * exist; the special "default" session is implicit and not stored.
   */
  async function list(userId) {
    if (!userId || !queryBySkPrefix) return [];
    try {
      const items = await queryBySkPrefix(buildMediaPk(userId), agentSessionPrefix(), 200);
      return (items || [])
        .map((i) => ({
          sessionId: String(i.sk || "").replace(agentSessionPrefix(), ""),
          name: i.name || "Untitled",
          createdAt: i.createdAt || 0,
          lastUsedAt: i.lastUsedAt || i.createdAt || 0,
        }))
        .filter((s) => s.sessionId)
        .sort((a, b) => b.lastUsedAt - a.lastUsedAt);
    } catch {
      return [];
    }
  }

  /**
   * Create a new session with the given name. The id is caller-supplied (the
   * frontend mints a uuid) — this lets the same id be used as the memory
   * namespace immediately, without a round-trip.
   */
  async function create(userId, { sessionId, name }) {
    if (!userId) return null;
    const id = sanitiseSessionId(sessionId);
    if (!id) return null;
    if (RESERVED_IDS.has(id)) return null;
    const now = Date.now();
    const item = {
      pk: buildMediaPk(userId),
      sk: buildAgentSessionSk(id),
      name: sanitiseName(name),
      createdAt: now,
      lastUsedAt: now,
    };
    try {
      await dynamoClient.send(
        new PutCommand({
          TableName: mediaTable,
          Item: item,
          ConditionExpression: "attribute_not_exists(pk)",
        })
      );
      return { sessionId: id, name: item.name, createdAt: now, lastUsedAt: now };
    } catch {
      // Likely a duplicate id — load + return whatever's there
      try {
        const existing = await dynamoClient.send(
          new GetCommand({
            TableName: mediaTable,
            Key: { pk: buildMediaPk(userId), sk: buildAgentSessionSk(id) },
          })
        );
        if (existing?.Item) {
          return {
            sessionId: id,
            name: existing.Item.name,
            createdAt: existing.Item.createdAt,
            lastUsedAt: existing.Item.lastUsedAt,
          };
        }
      } catch {
        // ignore
      }
      return null;
    }
  }

  async function rename(userId, sessionId, name) {
    if (!userId) return null;
    const id = sanitiseSessionId(sessionId);
    if (!id) return null;
    const cleanName = sanitiseName(name);
    try {
      await dynamoClient.send(
        new UpdateCommand({
          TableName: mediaTable,
          Key: { pk: buildMediaPk(userId), sk: buildAgentSessionSk(id) },
          UpdateExpression: "SET #n = :n",
          ExpressionAttributeNames: { "#n": "name" },
          ExpressionAttributeValues: { ":n": cleanName },
          ConditionExpression: "attribute_exists(pk)",
        })
      );
      return { sessionId: id, name: cleanName };
    } catch {
      return null;
    }
  }

  /**
   * Bump lastUsedAt — called on every successful agent turn so the list
   * sort is "most recently used first".
   */
  async function touch(userId, sessionId) {
    if (!userId) return;
    const id = sanitiseSessionId(sessionId);
    if (!id || RESERVED_IDS.has(id)) return;
    try {
      await dynamoClient.send(
        new UpdateCommand({
          TableName: mediaTable,
          Key: { pk: buildMediaPk(userId), sk: buildAgentSessionSk(id) },
          UpdateExpression: "SET lastUsedAt = :u",
          ExpressionAttributeValues: { ":u": Date.now() },
          ConditionExpression: "attribute_exists(pk)",
        })
      );
    } catch {
      // Session metadata may not exist (the "default" session is implicit)
    }
  }

  async function remove(userId, sessionId) {
    if (!userId) return false;
    const id = sanitiseSessionId(sessionId);
    if (!id || RESERVED_IDS.has(id)) return false;
    try {
      await dynamoClient.send(
        new DeleteCommand({
          TableName: mediaTable,
          Key: { pk: buildMediaPk(userId), sk: buildAgentSessionSk(id) },
        })
      );
      return true;
    } catch {
      return false;
    }
  }

  return { list, create, rename, touch, remove };
}

module.exports = { createAgentSessions, sanitiseSessionId, sanitiseName, MAX_NAME_LEN };
