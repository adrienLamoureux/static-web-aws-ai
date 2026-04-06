"use strict";

const createMockApp = () => {
  const routes = {
    get: new Map(),
    post: new Map(),
    put: new Map(),
  };
  return {
    get(path, handler) {
      routes.get.set(path, handler);
    },
    post(path, handler) {
      routes.post.set(path, handler);
    },
    put(path, handler) {
      routes.put.set(path, handler);
    },
    routes,
  };
};

const createMockRes = () => {
  const output = {
    statusCode: 200,
    payload: null,
  };
  return {
    status(code) {
      output.statusCode = code;
      return this;
    },
    json(payload) {
      output.payload = payload;
      return this;
    },
    output,
  };
};

const withEnv = async (entries, fn) => {
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
    return await fn();
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

// Extract the last handler function from an Express Router's stack for a given method + path.
const getRouterHandler = (router, method, routePath) => {
  const layer = router.stack.find(
    (l) =>
      l.route &&
      l.route.path === routePath &&
      l.route.methods[method.toLowerCase()]
  );
  if (!layer) return undefined;
  const handlers = layer.route.stack;
  return handlers[handlers.length - 1].handle;
};

module.exports = { createMockApp, createMockRes, withEnv, getRouterHandler };
