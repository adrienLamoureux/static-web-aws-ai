"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createAgentSessions,
  sanitiseSessionId,
  sanitiseName,
  MAX_NAME_LEN,
} = require("../lib/agent-sessions");

const makeStub = ({ getItem = null, onPut, onUpdate, onDelete } = {}) => {
  const sent = [];
  return {
    sent,
    send: async (cmd) => {
      sent.push(cmd);
      const n = cmd?.constructor?.name || "";
      if (n === "GetCommand") return { Item: getItem };
      if (n === "PutCommand" && typeof onPut === "function") return onPut(cmd) || {};
      if (n === "UpdateCommand" && typeof onUpdate === "function") return onUpdate(cmd) || {};
      if (n === "DeleteCommand" && typeof onDelete === "function") return onDelete(cmd) || {};
      return {};
    },
  };
};

// ── sanitisers ─────────────────────────────────────────────────────────────

test("sanitiseSessionId accepts alphanumerics + hyphen + underscore, lowercased", () => {
  assert.equal(sanitiseSessionId("MyProject_42"), "myproject_42");
  assert.equal(sanitiseSessionId("foo-bar-123"), "foo-bar-123");
});

test("sanitiseSessionId rejects spaces and special chars", () => {
  assert.equal(sanitiseSessionId("foo bar"), "");
  assert.equal(sanitiseSessionId("foo/bar"), "");
  assert.equal(sanitiseSessionId(""), "");
  assert.equal(sanitiseSessionId("   "), "");
});

test("sanitiseSessionId blocks SK-injection attempts (#MSG#, #STATE, traversal)", () => {
  // Without sanitisation these would let a body.sessionId write to attacker-
  // chosen SK fragments and collide with the messages prefix that agent-
  // memory uses. agent-route now routes body.sessionId through this filter.
  assert.equal(sanitiseSessionId("evil#MSG#0000"), "");
  assert.equal(sanitiseSessionId("foo#STATE"), "");
  assert.equal(sanitiseSessionId("a/b/c"), "");
  assert.equal(sanitiseSessionId("../../etc/passwd"), "");
});

test("sanitiseSessionId caps length at 80", () => {
  const long = "a".repeat(120);
  assert.equal(sanitiseSessionId(long).length, 80);
});

test("sanitiseName trims, caps length, defaults when empty", () => {
  assert.equal(sanitiseName("  Hello  "), "Hello");
  assert.equal(sanitiseName(""), "Untitled session");
  assert.equal(sanitiseName(null), "Untitled session");
  const long = "x".repeat(200);
  assert.equal(sanitiseName(long).length, MAX_NAME_LEN);
});

// ── factory stubs ──────────────────────────────────────────────────────────

test("createAgentSessions returns no-op stubs when DynamoDB unavailable", async () => {
  const s = createAgentSessions({ dynamoClient: null, mediaTable: "" });
  assert.deepEqual(await s.list("u1"), []);
  assert.equal(await s.create("u1", { sessionId: "x", name: "X" }), null);
  await s.touch("u1", "x"); // must not throw
  assert.equal(await s.remove("u1", "x"), false);
});

// ── list ───────────────────────────────────────────────────────────────────

test("list returns [] when user has no sessions", async () => {
  const s = createAgentSessions({
    dynamoClient: makeStub(),
    mediaTable: "t",
    queryBySkPrefix: async () => [],
  });
  assert.deepEqual(await s.list("u1"), []);
});

test("list strips AGENT#SESSION# prefix from sk and sorts by lastUsedAt desc", async () => {
  const s = createAgentSessions({
    dynamoClient: makeStub(),
    mediaTable: "t",
    queryBySkPrefix: async () => [
      { sk: "AGENT#SESSION#old", name: "Old", createdAt: 1, lastUsedAt: 100 },
      { sk: "AGENT#SESSION#newer", name: "Newer", createdAt: 50, lastUsedAt: 500 },
      { sk: "AGENT#SESSION#newest", name: "Newest", createdAt: 200, lastUsedAt: 999 },
    ],
  });
  const items = await s.list("u1");
  assert.deepEqual(
    items.map((i) => i.sessionId),
    ["newest", "newer", "old"]
  );
  assert.equal(items[0].name, "Newest");
});

// ── create ─────────────────────────────────────────────────────────────────

test("create persists a metadata record with createdAt + lastUsedAt", async () => {
  let putItem = null;
  const client = makeStub({
    onPut: (cmd) => {
      putItem = cmd.input.Item;
    },
  });
  const s = createAgentSessions({ dynamoClient: client, mediaTable: "t" });
  const result = await s.create("u1", { sessionId: "myproj", name: "My Project" });
  assert.ok(result);
  assert.equal(result.sessionId, "myproj");
  assert.equal(result.name, "My Project");
  assert.equal(putItem.sk, "AGENT#SESSION#myproj");
  assert.equal(putItem.pk, "USER#u1");
  assert.ok(putItem.createdAt > 0);
  assert.equal(putItem.lastUsedAt, putItem.createdAt);
});

test("create uses ConditionExpression to avoid clobbering existing sessions", async () => {
  const client = makeStub({
    onPut: () => {
      const err = new Error("ConditionalCheckFailedException");
      err.name = "ConditionalCheckFailedException";
      throw err;
    },
    // Existing record returned on the fallback Get
    getItem: { name: "Already Here", createdAt: 50, lastUsedAt: 100 },
  });
  const s = createAgentSessions({ dynamoClient: client, mediaTable: "t" });
  const result = await s.create("u1", { sessionId: "duplicate", name: "Try Again" });
  // Duplicate id → returns the existing record, doesn't overwrite
  assert.equal(result.name, "Already Here");
});

test("create rejects the reserved 'default' id", async () => {
  const s = createAgentSessions({ dynamoClient: makeStub(), mediaTable: "t" });
  assert.equal(await s.create("u1", { sessionId: "default", name: "x" }), null);
});

test("create rejects invalid session ids", async () => {
  const s = createAgentSessions({ dynamoClient: makeStub(), mediaTable: "t" });
  assert.equal(await s.create("u1", { sessionId: "with spaces", name: "x" }), null);
  assert.equal(await s.create("u1", { sessionId: "", name: "x" }), null);
});

// ── rename ─────────────────────────────────────────────────────────────────

test("rename issues an UpdateCommand with the sanitised name", async () => {
  let updatedName = null;
  const client = makeStub({
    onUpdate: (cmd) => {
      updatedName = cmd.input.ExpressionAttributeValues[":n"];
    },
  });
  const s = createAgentSessions({ dynamoClient: client, mediaTable: "t" });
  const r = await s.rename("u1", "myproj", "  Renamed  ");
  assert.equal(r.name, "Renamed");
  assert.equal(updatedName, "Renamed");
});

test("rename returns null when DynamoDB rejects", async () => {
  const client = makeStub({
    onUpdate: () => {
      throw new Error("ConditionalCheckFailedException");
    },
  });
  const s = createAgentSessions({ dynamoClient: client, mediaTable: "t" });
  assert.equal(await s.rename("u1", "nonexistent", "x"), null);
});

// ── touch / remove ─────────────────────────────────────────────────────────

test("touch silently skips for the reserved 'default' id", async () => {
  const client = makeStub();
  const s = createAgentSessions({ dynamoClient: client, mediaTable: "t" });
  await s.touch("u1", "default");
  assert.equal(client.sent.length, 0, "must not issue a write for the implicit session");
});

test("touch updates lastUsedAt for real sessions", async () => {
  let updateExpr = null;
  const client = makeStub({
    onUpdate: (cmd) => {
      updateExpr = cmd.input.UpdateExpression;
    },
  });
  const s = createAgentSessions({ dynamoClient: client, mediaTable: "t" });
  await s.touch("u1", "myproj");
  assert.match(updateExpr, /SET lastUsedAt/);
});

test("remove refuses to delete the reserved 'default' session", async () => {
  const client = makeStub();
  const s = createAgentSessions({ dynamoClient: client, mediaTable: "t" });
  assert.equal(await s.remove("u1", "default"), false);
  assert.equal(client.sent.length, 0);
});

test("remove issues a DeleteCommand for real sessions", async () => {
  let deletedKey = null;
  const client = makeStub({
    onDelete: (cmd) => {
      deletedKey = cmd.input.Key;
    },
  });
  const s = createAgentSessions({ dynamoClient: client, mediaTable: "t" });
  const ok = await s.remove("u1", "myproj");
  assert.equal(ok, true);
  assert.equal(deletedKey.sk, "AGENT#SESSION#myproj");
});
