"use strict";

/**
 * createTestApp — builds a minimal Express-like test harness that mirrors the
 * real app's routing surface without starting an HTTP server.
 *
 * The companion route (and other route modules) follow the signature:
 *   module.exports = (app, deps) => { app.get|post|put|delete(...) }
 *
 * Instead of a full Express app we wire up a lightweight router so tests can
 * call handlers directly without any network I/O.
 *
 * For more complete integration tests that need real HTTP, import the existing
 * `getRouterHandler` helper from test-utils.js and mount the routes on a real
 * Express Router.
 */

const { getRouterHandler } = require("./test-utils");

/**
 * createTestRouter — creates a real Express Router instance and registers
 * routes by calling registerRoutes(router, deps).
 *
 * Returns { router, getHandler(method, path) } so tests can extract and invoke
 * individual handlers without spinning up an HTTP server.
 *
 * @param {function} registerRoutes  — e.g. require("../../routes/companion-route")
 * @param {object}   deps            — mock deps from createMockDeps()
 */
const createTestRouter = (registerRoutes, deps) => {
  const express = require("express");
  const router = express.Router();
  registerRoutes(router, deps);

  return {
    router,
    getHandler: (method, path) => getRouterHandler(router, method, path),
  };
};

/**
 * createMockReq — builds a minimal mock request object suitable for calling
 * route handlers directly.
 *
 * @param {object} opts
 * @param {object} [opts.body]    — parsed JSON body
 * @param {object} [opts.query]   — query-string params
 * @param {object} [opts.params]  — URL params
 * @param {object} [opts.user]    — authenticated user (req.user)
 * @param {string} [opts.method]  — HTTP method (default "GET")
 */
const createMockReq = ({
  body = {},
  query = {},
  params = {},
  user = undefined,
  method = "GET",
} = {}) => ({
  body,
  query,
  params,
  user,
  method,
});

/**
 * createMockRes — builds a minimal mock response object that captures
 * statusCode and JSON payload so assertions can be made without HTTP.
 */
const createMockRes = () => {
  const output = { statusCode: 200, payload: null };
  const res = {
    status(code) {
      output.statusCode = code;
      return res;
    },
    json(payload) {
      output.payload = payload;
      return res;
    },
    output,
  };
  return res;
};

module.exports = { createTestRouter, createMockReq, createMockRes };
