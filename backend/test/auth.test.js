const test = require("node:test");
const assert = require("node:assert/strict");

const { requireUserMiddleware, optionalUserMiddleware, requireAdminMiddleware, getUserFromRequest } = require("../lib/auth");

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

test("optionalUserMiddleware sets req.user to null for anonymous requests (no sub)", () => {
  const req = {
    method: "GET",
    apiGateway: {
      event: {
        requestContext: {
          authorizer: { anonymous: "true", sub: "", email: "", groups: "" },
        },
      },
    },
  };
  const res = {};
  const next = (() => {
    let called = false;
    const fn = () => {
      called = true;
    };
    fn.wasCalled = () => called;
    return fn;
  })();
  optionalUserMiddleware(req, res, next);
  assert.equal(req.user, null);
  assert.equal(next.wasCalled(), true);
});

test("optionalUserMiddleware sets req.user for authenticated requests", () => {
  const req = {
    method: "GET",
    apiGateway: {
      event: {
        requestContext: {
          authorizer: {
            anonymous: "false",
            sub: "user-123",
            email: "test@example.com",
            groups: "user",
          },
        },
      },
    },
  };
  const res = {};
  const next = (() => {
    let called = false;
    const fn = () => {
      called = true;
    };
    fn.wasCalled = () => called;
    return fn;
  })();
  optionalUserMiddleware(req, res, next);
  assert.equal(req.user?.sub, "user-123");
  assert.equal(req.user?.email, "test@example.com");
  assert.equal(next.wasCalled(), true);
});

test("optionalUserMiddleware passes OPTIONS requests through without setting user", () => {
  const req = { method: "OPTIONS" };
  const res = {};
  const next = (() => {
    let called = false;
    const fn = () => {
      called = true;
    };
    fn.wasCalled = () => called;
    return fn;
  })();
  optionalUserMiddleware(req, res, next);
  assert.equal(next.wasCalled(), true);
});

test("requireAdminMiddleware allows requests from admin users", () => {
  const req = { method: "GET", user: { sub: "admin-123", email: "a@b.com", groups: ["admin"] } };
  const res = {};
  const next = (() => {
    let called = false;
    const fn = () => {
      called = true;
    };
    fn.wasCalled = () => called;
    return fn;
  })();
  requireAdminMiddleware(req, res, next);
  assert.equal(next.wasCalled(), true);
});

test("requireAdminMiddleware returns 403 for authenticated non-admin users", () => {
  let statusCode = null;
  let jsonData = null;
  const req = { method: "GET", user: { sub: "user-123", email: "u@b.com", groups: [] } };
  const res = {
    status: (code) => {
      statusCode = code;
      return res;
    },
    json: (data) => {
      jsonData = data;
      return res;
    },
  };
  const next = (() => {
    let called = false;
    const fn = () => {
      called = true;
    };
    fn.wasCalled = () => called;
    return fn;
  })();
  requireAdminMiddleware(req, res, next);
  assert.equal(statusCode, 403);
  assert.equal(jsonData?.message, "Admin access required");
  assert.equal(next.wasCalled(), false);
});

test("requireAdminMiddleware returns 403 for users with other groups but not admin", () => {
  let statusCode = null;
  const req = { method: "GET", user: { sub: "user-123", email: "u@b.com", groups: ["user"] } };
  const res = {
    status: (code) => {
      statusCode = code;
      return res;
    },
    json: () => res,
  };
  const next = (() => {
    let called = false;
    const fn = () => {
      called = true;
    };
    fn.wasCalled = () => called;
    return fn;
  })();
  requireAdminMiddleware(req, res, next);
  assert.equal(statusCode, 403);
  assert.equal(next.wasCalled(), false);
});

test("requireAdminMiddleware passes OPTIONS requests through", () => {
  const req = { method: "OPTIONS" };
  const res = {};
  const next = (() => {
    let called = false;
    const fn = () => {
      called = true;
    };
    fn.wasCalled = () => called;
    return fn;
  })();
  requireAdminMiddleware(req, res, next);
  assert.equal(next.wasCalled(), true);
});
