const express = require("express");

const { createDeps } = require("./lib/build-deps");
const { registerRoutes } = require("./routes");

const CORS_ALLOW_ORIGIN = "*";
const CORS_ALLOW_HEADERS = [
  "Origin",
  "X-Requested-With",
  "Content-Type",
  "Accept",
  "Authorization",
].join(", ");
const CORS_ALLOW_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].join(", ");

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", CORS_ALLOW_ORIGIN);
  res.header("Access-Control-Allow-Headers", CORS_ALLOW_HEADERS);
  res.header("Access-Control-Allow-Methods", CORS_ALLOW_METHODS);
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  return next();
});

const deps = createDeps();
app.use(deps.requireUserMiddleware);

registerRoutes(app, deps);

module.exports = app;
