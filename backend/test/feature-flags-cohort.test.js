"use strict";

/**
 * Unit tests for v1.4 cohort scoping on feature-flags.js:
 *   - mergeFlags preserves valid cohort strings ("all"|"admin"|"beta")
 *   - mergeFlags coerces unknown values to true (legacy boolean fallback)
 *   - evaluateFlag returns the right boolean for each (value, user) pair
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { evaluateFlag, VALID_COHORTS, invalidateFlagsCache } = require("../lib/feature-flags");

test("VALID_COHORTS exposes the supported cohort identifiers", () => {
  assert.deepEqual(VALID_COHORTS.sort(), ["admin", "all", "beta"]);
});

test("evaluateFlag treats strict false as off", () => {
  assert.equal(evaluateFlag({ agentMode: false }, "agentMode"), false);
  assert.equal(evaluateFlag({ agentMode: false }, "agentMode", { isAdmin: true }), false);
});

test("evaluateFlag treats true / 'all' as on for any user", () => {
  assert.equal(evaluateFlag({ agentMode: true }, "agentMode"), true);
  assert.equal(evaluateFlag({ agentMode: "all" }, "agentMode"), true);
  assert.equal(evaluateFlag({ agentMode: "all" }, "agentMode", null), true);
});

test("evaluateFlag with cohort='admin' returns true only for admins", () => {
  assert.equal(evaluateFlag({ agentMode: "admin" }, "agentMode", { isAdmin: true }), true);
  assert.equal(evaluateFlag({ agentMode: "admin" }, "agentMode", { isAdmin: false }), false);
  assert.equal(evaluateFlag({ agentMode: "admin" }, "agentMode", null), false);
  assert.equal(evaluateFlag({ agentMode: "admin" }, "agentMode"), false);
});

test("evaluateFlag with cohort='beta' checks user.roles or user.groups", () => {
  assert.equal(
    evaluateFlag({ agentMode: "beta" }, "agentMode", { roles: ["beta"] }),
    true
  );
  assert.equal(
    evaluateFlag({ agentMode: "beta" }, "agentMode", { groups: ["beta"] }),
    true
  );
  assert.equal(
    evaluateFlag({ agentMode: "beta" }, "agentMode", { roles: ["other"] }),
    false
  );
  assert.equal(evaluateFlag({ agentMode: "beta" }, "agentMode", null), false);
});

test("evaluateFlag fails open on unknown cohort strings", () => {
  // Defensive — never accidentally lock everyone out due to typos / drift
  assert.equal(evaluateFlag({ agentMode: "purple" }, "agentMode"), true);
  assert.equal(evaluateFlag({ agentMode: "" }, "agentMode"), true);
});

test("getFlags / mergeFlags preserves cohort strings from storage", async () => {
  invalidateFlagsCache();
  const { getFlags } = require("../lib/feature-flags");
  const stubClient = {
    send: async () => ({
      Item: { flags: { agentMode: "admin", enableCivitaiSync: false, junkFlag: "weird" } },
    }),
  };
  const flags = await getFlags({ dynamoClient: stubClient, mediaTable: "t" });
  assert.equal(flags.agentMode, "admin", "valid cohort string preserved");
  assert.equal(flags.enableCivitaiSync, false, "strict false preserved");
  // junkFlag isn't in KNOWN_FLAGS — ignored
  assert.equal(flags.junkFlag, undefined);
  invalidateFlagsCache();
});

test("getFlags coerces unknown raw values to true (legacy/forward-compat)", async () => {
  invalidateFlagsCache();
  const { getFlags } = require("../lib/feature-flags");
  const stubClient = {
    send: async () => ({ Item: { flags: { agentMode: 42 } } }),
  };
  const flags = await getFlags({ dynamoClient: stubClient, mediaTable: "t" });
  assert.equal(flags.agentMode, true, "non-bool, non-cohort coerces to true");
  invalidateFlagsCache();
});
