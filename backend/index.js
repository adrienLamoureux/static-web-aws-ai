const express = require("express");

const { createDeps } = require("./lib/build-deps");
const { registerRoutes } = require("./routes");

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  const allowedOrigin = "*";
  res.header("Access-Control-Allow-Origin", allowedOrigin);
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  return next();
});

const deps = createDeps();
app.use(deps.requireUserMiddleware);

registerRoutes(app, deps);

module.exports = app;
