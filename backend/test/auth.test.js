const test = require("node:test");
const assert = require("node:assert/strict");

const { getUserFromRequest } = require("../lib/auth");

const toUnsignedToken = (payload = {}) => {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString(
    "base64url"
  );
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.`;
};

const withEnv = (entries, fn) => {
  const previous = new Map();
  Object.keys(entries).forEach((key) => {
    previous.set(key, process.env[key]);
    const value = entries[key];
    if (typeof value === "undefined") {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  });
  try {
    return fn();
  } finally {
    Object.keys(entries).forEach((key) => {
      const value = previous.get(key);
      if (typeof value === "undefined") {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  }
};

test("uses API Gateway Cognito claims when present", () => {
  const req = {
    apiGateway: {
      event: {
        requestContext: {
          authorizer: {
            claims: {
              sub: "user-1",
              email: "user@example.com",
            },
          },
        },
      },
    },
  };
  const user = getUserFromRequest(req);
  assert.equal(user?.sub, "user-1");
  assert.equal(user?.email, "user@example.com");
});

test("does not accept unsigned bearer payloads by default", () => {
  withEnv(
    {
      ALLOW_UNSIGNED_JWT_FALLBACK: undefined,
      NODE_ENV: "development",
    },
    () => {
      const req = {
        headers: {
          authorization: `Bearer ${toUnsignedToken({
            sub: "user-2",
            email: "unsafe@example.com",
          })}`,
        },
      };
      const user = getUserFromRequest(req);
      assert.equal(user, null);
    }
  );
});

test("accepts unsigned bearer payload only when explicitly enabled in non-production", () => {
  withEnv(
    {
      ALLOW_UNSIGNED_JWT_FALLBACK: "true",
      NODE_ENV: "development",
    },
    () => {
      const req = {
        headers: {
          authorization: `Bearer ${toUnsignedToken({
            sub: "user-3",
            email: "safe-dev@example.com",
          })}`,
        },
      };
      const user = getUserFromRequest(req);
      assert.equal(user?.sub, "user-3");
      assert.equal(user?.email, "safe-dev@example.com");
    }
  );
});

test("never accepts unsigned bearer payload in production", () => {
  withEnv(
    {
      ALLOW_UNSIGNED_JWT_FALLBACK: "true",
      NODE_ENV: "production",
    },
    () => {
      const req = {
        headers: {
          authorization: `Bearer ${toUnsignedToken({
            sub: "user-4",
            email: "blocked@example.com",
          })}`,
        },
      };
      const user = getUserFromRequest(req);
      assert.equal(user, null);
    }
  );
});
