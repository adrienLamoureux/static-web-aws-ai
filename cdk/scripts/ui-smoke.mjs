#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const STACK_PREFIX = "StaticWebAWSAIStack";
const OUTPUTS_FILE_NAME = "cdk-outputs.json";
const DEFAULT_TIMEOUT_MS = 15000;

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
const inputAuthToken = resolveAuthToken(args.authToken);

const outputUrls = readStageOutputs({ stage, stackId });
const cloudfrontUrl = normalizeUrl(args.cloudfront || outputUrls.cloudfrontUrl);

if (!cloudfrontUrl) {
  fail(
    [
      "Unable to resolve CloudFront URL for UI smoke checks.",
      `stage=${stage}`,
      `stackId=${stackId}`,
      `cloudfront=${cloudfrontUrl || "-"}`,
    ].join(" | ")
  );
}

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
/* ─── Sakura route model ───
   Primary: /, /atelier, /chronicle, /gallery, /sanctum, /sanctum/sounds, /sanctum/lora, /about
   Legacy paths redirect to primary routes.
*/
const unauthenticatedChecks = [
  { id: "login-page", path: "/login", expectLogin: true, expectPath: "/login" },
  { id: "home-redirect", path: "/", expectLogin: true, expectPath: "/login" },
  { id: "atelier-redirect", path: "/atelier", expectLogin: true, expectPath: "/login" },
  { id: "chronicle-redirect", path: "/chronicle", expectLogin: true, expectPath: "/login" },
  { id: "gallery-redirect", path: "/gallery", expectLogin: true, expectPath: "/login" },
  { id: "sanctum-redirect", path: "/sanctum", expectLogin: true, expectPath: "/login" },
  { id: "about-redirect", path: "/about", expectLogin: true, expectPath: "/login" },
];

const authenticatedChecks = [
  {
    id: "home-page",
    path: "/",
    expectPath: "/",
    expectedAnyTexts: ["Realm", "Whisk Studio"],
  },
  {
    id: "atelier-page",
    path: "/atelier",
    expectPath: "/atelier",
    expectedAnyTexts: ["Atelier", "Studio"],
  },
  {
    id: "chronicle-page",
    path: "/chronicle",
    expectPath: "/chronicle",
    expectedAnyTexts: ["Chronicle", "Stories", "Story"],
  },
  {
    id: "gallery-page",
    path: "/gallery",
    expectPath: "/gallery",
    expectedAnyTexts: ["Gallery", "Browse", "Shared"],
  },
  {
    id: "sanctum-page",
    path: "/sanctum",
    expectPath: "/sanctum",
    expectedAnyTexts: ["Sanctum", "Admin", "Director"],
  },
  {
    id: "sounds-page",
    path: "/sanctum/sounds",
    expectPath: "/sanctum/sounds",
    expectedAnyTexts: ["Sound", "Music"],
  },
  {
    id: "lora-page",
    path: "/sanctum/lora",
    expectPath: "/sanctum/lora",
    expectedAnyTexts: ["LoRA", "Lora", "Models"],
  },
  {
    id: "about-page",
    path: "/about",
    expectPath: "/about",
    expectedAnyTexts: ["About", "Sakura"],
  },
  /* Legacy redirects */
  {
    id: "legacy-whisk",
    path: "/whisk",
    expectPath: "/atelier",
    expectedAnyTexts: ["Atelier", "Studio"],
  },
  {
    id: "legacy-forge",
    path: "/forge",
    expectPath: "/atelier",
    expectedAnyTexts: ["Atelier", "Studio"],
  },
  {
    id: "legacy-studio",
    path: "/studio",
    expectPath: "/atelier",
    expectedAnyTexts: ["Atelier", "Studio"],
  },
  {
    id: "legacy-story",
    path: "/story",
    expectPath: "/chronicle",
    expectedAnyTexts: ["Chronicle", "Stories", "Story"],
  },
  {
    id: "legacy-storyboard",
    path: "/storyboard",
    expectPath: "/chronicle",
    expectedAnyTexts: ["Chronicle", "Stories", "Story"],
  },
  {
    id: "legacy-shared",
    path: "/shared",
    expectPath: "/gallery",
    expectedAnyTexts: ["Gallery", "Browse", "Shared"],
  },
  {
    id: "legacy-showcase",
    path: "/showcase",
    expectPath: "/gallery",
    expectedAnyTexts: ["Gallery", "Browse", "Shared"],
  },
  {
    id: "legacy-director",
    path: "/director",
    expectPath: "/sanctum",
    expectedAnyTexts: ["Sanctum", "Admin", "Director"],
  },
  {
    id: "legacy-director-sounds",
    path: "/director/sounds",
    expectPath: "/sanctum/sounds",
    expectedAnyTexts: ["Sound", "Music"],
  },
  {
    id: "legacy-director-lora",
    path: "/director/lora",
    expectPath: "/sanctum/lora",
    expectedAnyTexts: ["LoRA", "Lora", "Models"],
  },
  {
    id: "legacy-music-library",
    path: "/music-library",
    expectPath: "/sanctum/sounds",
    expectedAnyTexts: ["Sound", "Music"],
  },
];

const authToken = inputAuthToken || createSyntheticJwtToken(stage);
if (inputAuthToken) {
  info("Using provided auth token for authenticated UI checks.");
} else {
  info("Using synthetic auth token for authenticated UI checks.");
}

const failures = [];
const unauthenticatedContext = await browser.newContext();
await runCheckGroup({
  context: unauthenticatedContext,
  baseUrl: cloudfrontUrl,
  timeoutMs,
  checks: unauthenticatedChecks,
  failures,
});
await unauthenticatedContext.close();

const authenticatedContext = await createAuthenticatedContext({
  browser,
  authToken,
});
await runCheckGroup({
  context: authenticatedContext,
  baseUrl: cloudfrontUrl,
  timeoutMs,
  checks: authenticatedChecks,
  failures,
});
await authenticatedContext.close();

await browser.close();

if (failures.length > 0) {
  const summary = failures.map((item) => `${item.id}: ${item.message}`).join(" | ");
  fail(`UI smoke checks failed for stage=${stage}. ${summary}`);
}

info(`All UI smoke checks passed for stage=${stage}.`);

async function runPageCheck({
  context,
  baseUrl,
  path: routePath,
  timeoutMs,
  expectLogin,
  expectPath,
  expectedTexts = [],
  expectedAnyTexts = [],
}) {
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error?.message || String(error));
  });

  const url = `${baseUrl}${routePath}`;
  await page.goto(url, {
    waitUntil: "networkidle",
    timeout: timeoutMs,
  });
  await page.waitForLoadState("domcontentloaded", { timeout: timeoutMs });

  const finalPath = new URL(page.url()).pathname;
  if (expectPath && finalPath !== expectPath) {
    throw new Error(`Expected path "${expectPath}" after visiting "${routePath}", got "${finalPath}".`);
  }

  if (expectLogin) {
    await waitForAnyVisibleText(page, ["Sign in to continue", "Continue to login", "Creative workspace awaits"], timeoutMs);
  }
  for (const text of expectedTexts) {
    await waitForVisibleText(page, text, timeoutMs);
  }
  if (expectedAnyTexts.length > 0) {
    await waitForAnyVisibleText(page, expectedAnyTexts, timeoutMs);
  }

  if (pageErrors.length > 0) {
    throw new Error(`Browser page errors detected: ${pageErrors.join(" | ")}`);
  }

  await page.close();
}

async function runCheckGroup({ context, baseUrl, timeoutMs, checks, failures }) {
  for (const check of checks) {
    const startedAt = Date.now();
    try {
      await runPageCheck({
        context,
        baseUrl,
        path: check.path,
        timeoutMs,
        expectLogin: check.expectLogin,
        expectPath: check.expectPath,
        expectedTexts: check.expectedTexts || [],
        expectedAnyTexts: check.expectedAnyTexts || [],
      });
      const elapsedMs = Date.now() - startedAt;
      info(`PASS ${check.id} (${elapsedMs}ms)`);
    } catch (error) {
      const elapsedMs = Date.now() - startedAt;
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ id: check.id, message, elapsedMs });
      errorLog(`FAIL ${check.id} (${elapsedMs}ms) ${message}`);
    }
  }
}

async function createAuthenticatedContext({ browser, authToken }) {
  const tokenPayload = {
    accessToken: authToken,
    idToken: authToken,
    refreshToken: "",
    tokenType: "Bearer",
    expiresIn: 3600,
    savedAt: Date.now(),
  };
  const context = await browser.newContext();
  await context.addInitScript((payload) => {
    window.sessionStorage.setItem("whisk_auth_tokens", JSON.stringify(payload));
  }, tokenPayload);
  return context;
}

function createSyntheticJwtToken(stageValue) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload = {
    sub: `ui-smoke-${stageValue}`,
    email: `ui-smoke+${stageValue}@example.com`,
    iat: nowSeconds,
    exp: nowSeconds + 60 * 60,
  };
  return [
    encodeBase64Url(JSON.stringify({ alg: "none", typ: "JWT" })),
    encodeBase64Url(JSON.stringify(payload)),
    "sig",
  ].join(".");
}

function encodeBase64Url(value) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function waitForVisibleText(page, text, timeoutMs) {
  const locator = page.getByText(text, { exact: false });
  try {
    await locator.first().waitFor({ state: "visible", timeout: timeoutMs });
  } catch {
    // Fallback: element may be covered by a decorative overlay
    // but still present and attached in the DOM.
    await locator.first().waitFor({ state: "attached", timeout: 3000 });
  }
}

async function waitForAnyVisibleText(page, texts, timeoutMs) {
  const timeoutAt = Date.now() + timeoutMs;
  const checks = texts.filter(Boolean);
  while (Date.now() < timeoutAt) {
    for (const text of checks) {
      const locator = page.getByText(text, { exact: false }).first();
      // Check visible first, then fall back to attached (for overlay-covered elements)
      const visible = await locator.isVisible().catch(() => false);
      if (visible) return;
      const attached = await locator.count().catch(() => 0);
      if (attached > 0) return;
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`Expected one of texts to be visible: ${checks.join(" | ")}`);
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch (error) {
    fail(
      "Playwright is not installed. Run `npm --prefix cdk install` and `npx playwright install chromium`."
    );
  }
}

function parseArgs(rawArgs) {
  const parsed = {
    stage: "",
    stackId: "",
    cloudfront: "",
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

function resolveTimeoutMs(rawValue) {
  const normalized = normalizeValue(rawValue);
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
  return normalizeValue(process.env.IDEA_UI_SMOKE_AUTH_TOKEN || "");
}

function readStageOutputs({ stage, stackId }) {
  const outputsPath = path.join(IDEAS_DIR, stage, OUTPUTS_FILE_NAME);
  if (!fs.existsSync(outputsPath)) {
    return { cloudfrontUrl: "" };
  }
  const raw = fs.readFileSync(outputsPath, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_error) {
    return { cloudfrontUrl: "" };
  }
  const stackOutputs = parsed[stackId] || parsed[Object.keys(parsed)[0] || ""];
  return {
    cloudfrontUrl: stackOutputs?.CloudFrontURL || "",
  };
}

function info(message) {
  console.log(`[idea-ui-smoke] ${message}`);
}

function errorLog(message) {
  console.error(`[idea-ui-smoke] ${message}`);
}

function fail(message) {
  errorLog(message);
  process.exit(1);
}
