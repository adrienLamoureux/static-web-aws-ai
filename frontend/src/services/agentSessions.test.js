import { mintSessionId } from "./agentSessions";

describe("mintSessionId", () => {
  it("returns a non-empty string", () => {
    const id = mintSessionId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("returns unique ids on consecutive calls", () => {
    const ids = new Set();
    for (let i = 0; i < 50; i += 1) ids.add(mintSessionId());
    expect(ids.size).toBe(50);
  });

  it("returns an id matching the backend's [a-zA-Z0-9_-]+ validator", () => {
    for (let i = 0; i < 20; i += 1) {
      const id = mintSessionId();
      expect(id).toMatch(/^[a-zA-Z0-9_-]+$/);
    }
  });

  it("falls back gracefully when crypto.randomUUID is unavailable", () => {
    const originalCrypto = global.crypto;
    // Force the fallback path
    try {
      delete global.crypto;
    } catch {
      // some environments make global.crypto non-configurable; skip the test
      // body but don't fail
      return;
    }
    try {
      const id = mintSessionId();
      expect(typeof id).toBe("string");
      expect(id).toMatch(/^s[a-z0-9]+$/);
    } finally {
      if (originalCrypto) global.crypto = originalCrypto;
    }
  });
});
