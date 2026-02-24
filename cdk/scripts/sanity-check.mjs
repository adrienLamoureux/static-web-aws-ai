#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_TIMEOUT_MS = 12000;
const STATUS_OK = 200;
const STATUS_UNAUTHORIZED = 401;
const STACK_PREFIX = "StaticWebAWSAIStack";
const OUTPUTS_FILE_NAME = "cdk-outputs.json";

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..", "..");
const IDEAS_DIR = path.join(ROOT_DIR, "ideas");

const args = parseArgs(process.argv.slice(2));
const stage = resolveStage(args.stage);

if (!stage) {
  fail('Missing required "--stage=<idea-id>" argument.');
}

const stackId = normalizeValue(args.stackId) || `${STACK_PREFIX}-${stage}`;
const timeoutMs = resolveTimeoutMs(args.timeoutMs);
const authToken = resolveAuthToken(args.authToken);
const hasAuthToken = Boolean(authToken);
const apiExpectedStatuses = hasAuthToken ? [STATUS_OK] : [STATUS_OK, STATUS_UNAUTHORIZED];
const authHeaders = hasAuthToken ? { Authorization: `Bearer ${authToken}` } : {};
const outputUrls = readStageOutputs({ stage, stackId });

const cloudfrontUrl = normalizeUrl(args.cloudfront || outputUrls.cloudfrontUrl);
const apiUrl = normalizeUrl(args.api || outputUrls.apiEndpoint);

if (!cloudfrontUrl || !apiUrl) {
  fail(
    [
      "Unable to resolve CloudFront/API URLs for sanity checks.",
      `stage=${stage}`,
      `stackId=${stackId}`,
      `cloudfront=${cloudfrontUrl || "-"}`,
      `api=${apiUrl || "-"}`,
    ].join(" | ")
  );
}

const checks = [
  {
    id: "frontend-root",
    run: () => expectHtml({ url: cloudfrontUrl, timeoutMs }),
  },
  {
    id: "frontend-login",
    run: () => expectHtml({ url: `${cloudfrontUrl}/login`, timeoutMs }),
  },
  {
    id: "frontend-config",
    run: () => expectConfigJson({ url: `${cloudfrontUrl}/config.json`, apiUrl, timeoutMs }),
  },
  {
    id: "api-root",
    run: () =>
      expectJsonStatus({
        url: `${apiUrl}/`,
        expectedStatuses: apiExpectedStatuses,
        timeoutMs,
        headers: authHeaders,
      }),
  },
  {
    id: "api-health",
    run: () =>
      expectJsonStatus({
        url: `${apiUrl}/health`,
        expectedStatuses: apiExpectedStatuses,
        timeoutMs,
        headers: authHeaders,
      }),
  },
  {
    id: "api-auth-guard",
    run: () =>
      expectJsonStatus({
        url: `${apiUrl}/story/sessions`,
        expectedStatuses: hasAuthToken ? [STATUS_OK] : [STATUS_UNAUTHORIZED],
        timeoutMs,
        headers: authHeaders,
      }),
  },
];

const failures = [];
for (const check of checks) {
  const startedAt = Date.now();
  try {
    await check.run();
    const elapsedMs = Date.now() - startedAt;
    info(`PASS ${check.id} (${elapsedMs}ms)`);
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : String(error);
    failures.push({ id: check.id, message, elapsedMs });
    errorLog(`FAIL ${check.id} (${elapsedMs}ms) ${message}`);
  }
}

if (failures.length > 0) {
  const summary = failures
    .map((item) => `${item.id}: ${item.message}`)
    .join(" | ");
  fail(`Sanity checks failed for stage=${stage}. ${summary}`);
}

info(`All sanity checks passed for stage=${stage}.`);

function parseArgs(rawArgs) {
  const parsed = {
    stage: "",
    stackId: "",
    cloudfront: "",
    api: "",
    timeoutMs: "",
    authToken: "",
  };
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg.startsWith("--stage=")) {
      parsed.stage = arg.slice("--stage=".length);
      continue;
    }
    if (arg === "--stage") {
      parsed.stage = String(rawArgs[index + 1] || "");
      index += 1;
      continue;
    }
    if (arg.startsWith("--stack-id=")) {
      parsed.stackId = arg.slice("--stack-id=".length);
      continue;
    }
    if (arg === "--stack-id") {
      parsed.stackId = String(rawArgs[index + 1] || "");
      index += 1;
      continue;
    }
    if (arg.startsWith("--cloudfront=")) {
      parsed.cloudfront = arg.slice("--cloudfront=".length);
      continue;
    }
    if (arg === "--cloudfront") {
      parsed.cloudfront = String(rawArgs[index + 1] || "");
      index += 1;
      continue;
    }
    if (arg.startsWith("--api=")) {
      parsed.api = arg.slice("--api=".length);
      continue;
    }
    if (arg === "--api") {
      parsed.api = String(rawArgs[index + 1] || "");
      index += 1;
      continue;
    }
    if (arg.startsWith("--timeout-ms=")) {
      parsed.timeoutMs = arg.slice("--timeout-ms=".length);
      continue;
    }
    if (arg === "--timeout-ms") {
      parsed.timeoutMs = String(rawArgs[index + 1] || "");
      index += 1;
      continue;
    }
    if (arg.startsWith("--auth-token=")) {
      parsed.authToken = arg.slice("--auth-token=".length);
      continue;
    }
    if (arg === "--auth-token") {
      parsed.authToken = String(rawArgs[index + 1] || "");
      index += 1;
      continue;
    }
    fail(`Unknown argument "${arg}".`);
  }
  return parsed;
}

function resolveStage(rawStage) {
  return String(rawStage || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveTimeoutMs(rawValue) {
  const normalized = String(rawValue || "").trim();
  if (!normalized) return DEFAULT_TIMEOUT_MS;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    fail(`Invalid --timeout-ms value "${rawValue}".`);
  }
  return Math.round(parsed);
}

function resolveAuthToken(rawValue) {
  const directValue = normalizeValue(rawValue);
  if (directValue) return directValue;
  return normalizeValue(process.env.IDEA_SANITY_BEARER_TOKEN || "");
}

function normalizeValue(rawValue) {
  return String(rawValue || "").trim();
}

function normalizeUrl(rawValue) {
  const value = normalizeValue(rawValue);
  if (!value || value === "-") return "";
  const noTrailingSlash = value.replace(/\/+$/, "");
  if (/^https?:\/\//.test(noTrailingSlash)) {
    return noTrailingSlash;
  }
  return `https://${noTrailingSlash}`;
}

function readStageOutputs({ stage, stackId }) {
  const outputsPath = path.join(IDEAS_DIR, stage, OUTPUTS_FILE_NAME);
  if (!fs.existsSync(outputsPath)) {
    return { cloudfrontUrl: "", apiEndpoint: "" };
  }
  const raw = fs.readFileSync(outputsPath, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_error) {
    return { cloudfrontUrl: "", apiEndpoint: "" };
  }
  const stackOutputs = parsed[stackId] || parsed[Object.keys(parsed)[0] || ""];
  return {
    cloudfrontUrl: stackOutputs?.CloudFrontURL || "",
    apiEndpoint: stackOutputs?.APIEndpoint || "",
  };
}

async function expectHtml({ url, timeoutMs }) {
  const { status, headers, bodyText } = await requestText({ url, timeoutMs });
  if (status !== STATUS_OK) {
    throw new Error(`Expected HTTP ${STATUS_OK} at ${url}, received ${status}.`);
  }
  const contentType = String(headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("text/html")) {
    throw new Error(`Expected text/html at ${url}, received "${contentType || "-"}".`);
  }
  const looksLikeHtml =
    bodyText.toLowerCase().includes("<!doctype html") || bodyText.toLowerCase().includes("<html");
  if (!looksLikeHtml) {
    throw new Error(`HTML marker not found in response body for ${url}.`);
  }
}

async function expectConfigJson({ url, apiUrl, timeoutMs }) {
  const payload = await expectJsonStatus({
    url,
    expectedStatuses: [STATUS_OK],
    timeoutMs,
  });

  const configuredApi = normalizeUrl(payload?.apiBaseUrl || "");
  if (!configuredApi) {
    throw new Error(`config.json is missing "apiBaseUrl".`);
  }
  if (configuredApi !== normalizeUrl(apiUrl)) {
    throw new Error(
      `config.json apiBaseUrl mismatch. expected=${normalizeUrl(apiUrl)} actual=${configuredApi}`
    );
  }

  const cognito = payload?.cognito || {};
  const requiredCognitoFields = ["domain", "clientId", "userPoolId", "region"];
  const missing = requiredCognitoFields.filter((key) => !normalizeValue(cognito[key]));
  if (missing.length > 0) {
    throw new Error(`config.json missing cognito fields: ${missing.join(", ")}`);
  }
}

async function expectJsonStatus({ url, expectedStatuses, timeoutMs, headers = {} }) {
  const { status, headers: responseHeaders, bodyText } = await requestText({
    url,
    timeoutMs,
    headers,
  });
  if (!expectedStatuses.includes(status)) {
    throw new Error(
      `Expected HTTP ${expectedStatuses.join(" or ")} at ${url}, received ${status}.`
    );
  }
  const contentType = String(responseHeaders.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    throw new Error(`Expected application/json at ${url}, received "${contentType || "-"}".`);
  }
  try {
    return JSON.parse(bodyText || "{}");
  } catch (_error) {
    throw new Error(`Invalid JSON payload from ${url}.`);
  }
}

async function requestText({ url, timeoutMs, headers = {} }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers,
    });
    const bodyText = await response.text();
    return {
      status: response.status,
      headers: response.headers,
      bodyText,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function info(message) {
  console.log(`[idea-sanity] ${message}`);
}

function errorLog(message) {
  console.error(`[idea-sanity] ${message}`);
}

function fail(message) {
  errorLog(message);
  process.exit(1);
}
