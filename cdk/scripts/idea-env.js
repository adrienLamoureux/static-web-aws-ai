#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const CDK_DIR = path.resolve(__dirname, "..");
const IDEAS_DIR = path.join(ROOT_DIR, "ideas");
const TEMPLATE_DIR_NAME = "_template";
const TEMPLATE_DIR = path.join(IDEAS_DIR, TEMPLATE_DIR_NAME);
const INDEX_PATH = path.join(ROOT_DIR, "IDEAS.md");
const GLOBAL_IMPROVEMENTS_PATH = path.join(ROOT_DIR, "IMPROVEMENTS.md");
const LOCK_PATH = path.join(ROOT_DIR, ".cdk-idea-lock");
const OUTPUTS_FILE_NAME = "cdk-outputs.json";
const STATUS_FILE_NAME = "STATUS.md";
const IMPROVEMENTS_FILE_NAME = "IMPROVEMENTS.md";
const STACK_PREFIX = "StaticWebAWSAIStack";
const SANITY_SCRIPT_RELATIVE_PATH = path.join("scripts", "sanity-check.mjs");
const UI_SMOKE_SCRIPT_RELATIVE_PATH = path.join("scripts", "ui-smoke.mjs");
const INDEX_START_MARKER = "<!-- IDEA_REGISTRY_START -->";
const INDEX_END_MARKER = "<!-- IDEA_REGISTRY_END -->";
const LOG_VALUE_SPACE_PATTERN = /\s+/g;
const LOG_VALUE_SEPARATOR_PATTERN = /\|/g;
const STAGE_INVALID_PATTERN = /[^a-z0-9-]/g;
const STAGE_MULTI_DASH_PATTERN = /-+/g;
const STAGE_EDGE_DASH_PATTERN = /^-+|-+$/g;
const TTL_DAYS_PATTERN = /^[0-9]+$/;
const TEMPLATE_FILES = [
  "README.md",
  "DECISIONS.md",
  "RUNBOOK.md",
  "STATUS.md",
  "IMPROVEMENTS.md",
];
const SUPPORTED_COMMANDS = new Set([
  "init",
  "deploy",
  "ui-local",
  "destroy",
  "diff",
  "synth",
  "list",
  "rollout",
  "deploy-many",
  "sanity",
  "ui-smoke",
  "diff-many",
  "synth-many",
]);
const WINDOWS_CDK_BIN = "cdk.cmd";
const POSIX_CDK_BIN = "cdk";

const usage = `
Usage:
  npm --prefix cdk run idea:list
  npm --prefix cdk run idea:init -- --stage=<idea-id> [--title="<idea title>"]
  npm --prefix cdk run idea:deploy -- --stage=<idea-id> [--improvement="<name>"] [--owner="<owner>"] [--ttl-days=<days>] [--skip-build] [--skip-sanity] [--dry-run]
  npm --prefix cdk run idea:ui-local -- --stage=<idea-id> [--port=<port>] [--open] [--print-env] [--dry-run]
  npm --prefix cdk run idea:sanity -- --stage=<idea-id>
  npm --prefix cdk run idea:ui-smoke -- --stage=<idea-id>
  npm --prefix cdk run idea:destroy -- --stage=<idea-id> [--dry-run]
  npm --prefix cdk run idea:diff -- --stage=<idea-id> [--owner="<owner>"] [--ttl-days=<days>] [--dry-run]
  npm --prefix cdk run idea:synth -- --stage=<idea-id> [--owner="<owner>"] [--ttl-days=<days>] [--dry-run]
  npm --prefix cdk run idea:rollout -- --improvement="<name>" [--exclude=x,y] [--owner="<owner>"] [--ttl-days=<days>] [--skip-build] [--skip-sanity] [--dry-run]
  npm --prefix cdk run idea:deploy-many -- (--all | --stages=a,b,c) [--exclude=x,y] --improvement="<name>" [--owner="<owner>"] [--ttl-days=<days>] [--skip-build] [--skip-sanity] [--continue-on-error] [--dry-run]
  npm --prefix cdk run idea:diff-many -- (--all | --stages=a,b,c) [--exclude=x,y] [--owner="<owner>"] [--ttl-days=<days>] [--dry-run]
  npm --prefix cdk run idea:synth-many -- (--all | --stages=a,b,c) [--exclude=x,y] [--owner="<owner>"] [--ttl-days=<days>] [--dry-run]
`;

const cdkInvocation = resolveCdkInvocation();

const command = process.argv[2];
const options = parseArgs(process.argv.slice(3));

if (!command || !SUPPORTED_COMMANDS.has(command)) {
  fail(`Unsupported or missing command.\n${usage}`);
}

if (command === "list") {
  printIdeaList();
  process.exit(0);
}

if (command === "init") {
  const stage = resolveRequiredStage(options.stage);
  const title = normalizeLogValue(options.title || stage);
  const stackId = buildStackId(stage);
  const ideaContext = ensureIdeaContext({ stage, title, stackId });
  upsertIndexEntry({
    stage,
    stackId,
    status: "PLANNED",
    cloudfront: "-",
    api: "-",
    note: "Initialized",
  });
  appendStatusLog({
    statusPath: ideaContext.statusPath,
    event: "init",
    detail: "Idea workspace initialized",
  });
  info(`Initialized idea context for "${stage}" at ${ideaContext.ideaDir}`);
  process.exit(0);
}

if (command === "deploy") {
  ensureUiSmokeNotSkipped({ commandName: "deploy", skipUiSmoke: options.skipUiSmoke });
  const stage = resolveRequiredStage(options.stage);
  const improvement = resolveImprovementLabel({
    raw: options.improvement,
    required: false,
  });
  const owner = resolveOptionalOwner(options.owner);
  const ttlDays = resolveOptionalTtlDays(options.ttlDays);
  const contextArgs = buildCdkContextArgs({ stage, owner, ttlDays });
  if (options.dryRun) {
    printDryRun({
      action: "deploy",
      stages: [stage],
      improvement,
      skipBuild: options.skipBuild,
      skipSanity: options.skipSanity,
      skipUiSmoke: options.skipUiSmoke,
      owner,
      ttlDays,
    });
    process.exit(0);
  }

  withLock(() => {
    runOrFail("npm", ["--prefix", "cdk", "run", "build"], ROOT_DIR);
    if (!options.skipBuild) {
      runOrFail("npm", ["--prefix", "frontend", "run", "build"], ROOT_DIR);
    }
    const deployResult = deployStage({
      stage,
      improvement,
      event: "deploy",
      contextArgs,
      skipSanity: options.skipSanity,
      skipUiSmoke: options.skipUiSmoke,
    });
    if (improvement) {
      appendGlobalImprovementLog({
        action: "deploy",
        improvement,
        targets: [stage],
        succeeded: [stage],
        failed: [],
        commit: deployResult.commit,
      });
    }
  });
  process.exit(0);
}

if (command === "ui-local") {
  const stage = resolveRequiredStage(options.stage);
  const port = resolveOptionalPort(options.port);
  runUiLocal({
    stage,
    port,
    openBrowser: options.open,
    printEnv: options.printEnv,
    dryRun: options.dryRun,
  });
  process.exit(0);
}

if (command === "destroy") {
  const stage = resolveRequiredStage(options.stage);
  const owner = resolveOptionalOwner(options.owner);
  const ttlDays = resolveOptionalTtlDays(options.ttlDays);
  const contextArgs = buildCdkContextArgs({ stage, owner, ttlDays });
  if (options.dryRun) {
    printDryRun({
      action: "destroy",
      stages: [stage],
      improvement: "",
      skipBuild: false,
      skipSanity: false,
      skipUiSmoke: false,
      owner,
      ttlDays,
    });
    process.exit(0);
  }
  withLock(() => {
    runOrFail("npm", ["--prefix", "cdk", "run", "build"], ROOT_DIR);
    runCdkOrFail(["destroy", "--force", ...contextArgs], CDK_DIR);
    const gitCommit = resolveGitCommit();
    const stackId = buildStackId(stage);
    const ideaContext = ensureIdeaContext({
      stage,
      title: stage,
      stackId,
    });
    upsertIndexEntry({
      stage,
      stackId,
      status: "DESTROYED",
      cloudfront: "-",
      api: "-",
      note: `Destroyed ${gitCommit}`,
    });
    appendStatusLog({
      statusPath: ideaContext.statusPath,
      event: "destroy",
      detail: `stack=${stackId} | commit=${gitCommit}`,
    });
    info(`Destroyed "${stage}" (${stackId})`);
  });
  process.exit(0);
}

if (command === "sanity") {
  const stage = resolveRequiredStage(options.stage);
  if (options.dryRun) {
    printDryRun({
      action: "sanity",
      stages: [stage],
      improvement: "",
      skipBuild: false,
      skipSanity: false,
      skipUiSmoke: false,
      owner: "",
      ttlDays: "",
    });
    process.exit(0);
  }
  withLock(() => {
    runSanityChecks({ stage, stackId: buildStackId(stage) });
    appendStatusLog({
      statusPath: ensureIdeaContext({
        stage,
        title: stage,
        stackId: buildStackId(stage),
      }).statusPath,
      event: "sanity",
      detail: `stage=${stage} | result=passed`,
    });
    info(`sanity completed for "${stage}"`);
  });
  process.exit(0);
}

if (command === "diff" || command === "synth") {
  const stage = resolveRequiredStage(options.stage);
  const subcommand = command === "diff" ? "diff" : "synth";
  const owner = resolveOptionalOwner(options.owner);
  const ttlDays = resolveOptionalTtlDays(options.ttlDays);
  const contextArgs = buildCdkContextArgs({ stage, owner, ttlDays });
  if (options.dryRun) {
    printDryRun({
      action: subcommand,
      stages: [stage],
      improvement: "",
      skipBuild: false,
      skipSanity: false,
      skipUiSmoke: false,
      owner,
      ttlDays,
    });
    process.exit(0);
  }
  withLock(() => {
    runOrFail("npm", ["--prefix", "cdk", "run", "build"], ROOT_DIR);
    runCdkOrFail([subcommand, ...contextArgs], CDK_DIR);
    appendStatusLog({
      statusPath: ensureIdeaContext({
        stage,
        title: stage,
        stackId: buildStackId(stage),
      }).statusPath,
      event: subcommand,
      detail: `stage=${stage}`,
    });
    info(`${subcommand} completed for "${stage}"`);
  });
  process.exit(0);
}

if (command === "ui-smoke") {
  const stage = resolveRequiredStage(options.stage);
  if (options.dryRun) {
    printDryRun({
      action: "ui-smoke",
      stages: [stage],
      improvement: "",
      skipBuild: false,
      skipSanity: false,
      skipUiSmoke: false,
      owner: "",
      ttlDays: "",
    });
    process.exit(0);
  }
  withLock(() => {
    runUiSmokeChecks({ stage, stackId: buildStackId(stage) });
    appendStatusLog({
      statusPath: ensureIdeaContext({
        stage,
        title: stage,
        stackId: buildStackId(stage),
      }).statusPath,
      event: "ui-smoke",
      detail: `stage=${stage} | result=passed`,
    });
    info(`ui-smoke completed for "${stage}"`);
  });
  process.exit(0);
}

if (command === "rollout") {
  ensureUiSmokeNotSkipped({ commandName: "rollout", skipUiSmoke: options.skipUiSmoke });
  const stages = resolveTargetStages({
    ...options,
    all: true,
  });
  const improvement = resolveImprovementLabel({
    raw: options.improvement,
    required: true,
  });
  const owner = resolveOptionalOwner(options.owner);
  const ttlDays = resolveOptionalTtlDays(options.ttlDays);
  executeDeployMany({
    stages,
    improvement,
    owner,
    ttlDays,
    skipBuild: options.skipBuild,
    skipSanity: options.skipSanity,
    skipUiSmoke: options.skipUiSmoke,
    continueOnError: true,
    dryRun: options.dryRun,
    action: "rollout",
  });
  process.exit(0);
}

if (command === "deploy-many") {
  ensureUiSmokeNotSkipped({
    commandName: "deploy-many",
    skipUiSmoke: options.skipUiSmoke,
  });
  const stages = resolveTargetStages(options);
  const improvement = resolveImprovementLabel({
    raw: options.improvement,
    required: true,
  });
  const owner = resolveOptionalOwner(options.owner);
  const ttlDays = resolveOptionalTtlDays(options.ttlDays);
  executeDeployMany({
    stages,
    improvement,
    owner,
    ttlDays,
    skipBuild: options.skipBuild,
    skipSanity: options.skipSanity,
    skipUiSmoke: options.skipUiSmoke,
    continueOnError: options.continueOnError,
    dryRun: options.dryRun,
    action: "deploy-many",
  });
  process.exit(0);
}

if (command === "diff-many" || command === "synth-many") {
  const stages = resolveTargetStages(options);
  const subcommand = command === "diff-many" ? "diff" : "synth";
  const owner = resolveOptionalOwner(options.owner);
  const ttlDays = resolveOptionalTtlDays(options.ttlDays);
  if (options.dryRun) {
    printDryRun({
      action: command,
      stages,
      improvement: "",
      skipBuild: false,
      skipSanity: false,
      skipUiSmoke: false,
      owner,
      ttlDays,
    });
    process.exit(0);
  }

  withLock(() => {
    runOrFail("npm", ["--prefix", "cdk", "run", "build"], ROOT_DIR);
    stages.forEach((stage) => {
      runCdkOrFail(
        [subcommand, ...buildCdkContextArgs({ stage, owner, ttlDays })],
        CDK_DIR
      );
      appendStatusLog({
        statusPath: ensureIdeaContext({
          stage,
          title: stage,
          stackId: buildStackId(stage),
        }).statusPath,
        event: `${subcommand}-many`,
        detail: `stage=${stage}`,
      });
    });
  });
  info(`${command} completed across: ${stages.join(", ")}`);
  process.exit(0);
}

function parseArgs(args) {
  const parsed = {
    stage: "",
    stages: "",
    title: "",
    exclude: "",
    improvement: "",
    owner: "",
    ttlDays: "",
    port: "",
    skipBuild: false,
    skipSanity: false,
    skipUiSmoke: false,
    open: false,
    printEnv: false,
    all: false,
    continueOnError: false,
    dryRun: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--skip-build") {
      parsed.skipBuild = true;
      continue;
    }
    if (arg === "--skip-sanity") {
      parsed.skipSanity = true;
      continue;
    }
    if (arg === "--skip-ui-smoke") {
      parsed.skipUiSmoke = true;
      continue;
    }
    if (arg === "--all") {
      parsed.all = true;
      continue;
    }
    if (arg === "--open") {
      parsed.open = true;
      continue;
    }
    if (arg === "--print-env") {
      parsed.printEnv = true;
      continue;
    }
    if (arg === "--continue-on-error") {
      parsed.continueOnError = true;
      continue;
    }
    if (arg === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }
    if (arg.startsWith("--stage=")) {
      parsed.stage = arg.slice("--stage=".length);
      continue;
    }
    if (arg === "--stage") {
      parsed.stage = String(args[index + 1] || "");
      index += 1;
      continue;
    }
    if (arg.startsWith("--stages=")) {
      parsed.stages = arg.slice("--stages=".length);
      continue;
    }
    if (arg === "--stages") {
      parsed.stages = String(args[index + 1] || "");
      index += 1;
      continue;
    }
    if (arg.startsWith("--title=")) {
      parsed.title = arg.slice("--title=".length);
      continue;
    }
    if (arg === "--title") {
      parsed.title = String(args[index + 1] || "");
      index += 1;
      continue;
    }
    if (arg.startsWith("--exclude=")) {
      parsed.exclude = arg.slice("--exclude=".length);
      continue;
    }
    if (arg === "--exclude") {
      parsed.exclude = String(args[index + 1] || "");
      index += 1;
      continue;
    }
    if (arg.startsWith("--improvement=")) {
      parsed.improvement = arg.slice("--improvement=".length);
      continue;
    }
    if (arg === "--improvement") {
      parsed.improvement = String(args[index + 1] || "");
      index += 1;
      continue;
    }
    if (arg.startsWith("--owner=")) {
      parsed.owner = arg.slice("--owner=".length);
      continue;
    }
    if (arg === "--owner") {
      parsed.owner = String(args[index + 1] || "");
      index += 1;
      continue;
    }
    if (arg.startsWith("--ttl-days=")) {
      parsed.ttlDays = arg.slice("--ttl-days=".length);
      continue;
    }
    if (arg === "--ttl-days") {
      parsed.ttlDays = String(args[index + 1] || "");
      index += 1;
      continue;
    }
    if (arg.startsWith("--port=")) {
      parsed.port = arg.slice("--port=".length);
      continue;
    }
    if (arg === "--port") {
      parsed.port = String(args[index + 1] || "");
      index += 1;
      continue;
    }
    fail(`Unknown argument "${arg}".\n${usage}`);
  }

  return parsed;
}

function splitCsv(rawValue) {
  return String(rawValue || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeLogValue(rawValue) {
  return String(rawValue || "")
    .replace(LOG_VALUE_SEPARATOR_PATTERN, "/")
    .replace(LOG_VALUE_SPACE_PATTERN, " ")
    .trim();
}

function resolveRequiredStage(rawStage) {
  const resolved = resolveStage(rawStage);
  if (!resolved) {
    fail(`A stage is required.\n${usage}`);
  }
  return resolved;
}

function resolveStage(rawStage) {
  const normalized = String(rawStage || "")
    .toLowerCase()
    .replace(STAGE_INVALID_PATTERN, "-")
    .replace(STAGE_MULTI_DASH_PATTERN, "-")
    .replace(STAGE_EDGE_DASH_PATTERN, "");
  if (!normalized) return "";
  if (normalized === TEMPLATE_DIR_NAME) {
    fail(`The stage name "${TEMPLATE_DIR_NAME}" is reserved.`);
  }
  return normalized;
}

function resolveImprovementLabel({ raw, required }) {
  const value = normalizeLogValue(raw || "");
  if (required && !value) {
    fail(`An improvement label is required.\n${usage}`);
  }
  return value;
}

function resolveOptionalOwner(rawOwner) {
  const value = normalizeLogValue(rawOwner || "");
  return value;
}

function resolveOptionalTtlDays(rawTtlDays) {
  const value = String(rawTtlDays || "").trim();
  if (!value) return "";
  if (!TTL_DAYS_PATTERN.test(value)) {
    fail(`--ttl-days must be a non-negative integer, received "${value}".`);
  }
  return value;
}

function resolveOptionalPort(rawPort) {
  const value = String(rawPort || "").trim();
  if (!value) return "";
  if (!/^[0-9]+$/.test(value)) {
    fail(`--port must be a numeric TCP port, received "${value}".`);
  }
  const asNumber = Number(value);
  if (!Number.isInteger(asNumber) || asNumber < 1 || asNumber > 65535) {
    fail(`--port must be within 1-65535, received "${value}".`);
  }
  return value;
}

function ensureUiSmokeNotSkipped({ commandName, skipUiSmoke }) {
  if (!skipUiSmoke) return;
  fail(
    [
      `--skip-ui-smoke is not allowed for "${commandName}".`,
      "UI smoke is mandatory after successful deploy commands.",
      "Use `npm --prefix cdk run idea:sanity` and `npm --prefix cdk run idea:ui-smoke` for standalone reruns.",
    ].join(" ")
  );
}

function buildCdkContextArgs({ stage, owner, ttlDays }) {
  const args = ["--context", `stage=${stage}`];
  if (owner) {
    args.push("--context", `owner=${owner}`);
  }
  if (ttlDays) {
    args.push("--context", `ttlDays=${ttlDays}`);
  }
  return args;
}

function listIdeaStages() {
  if (!fs.existsSync(IDEAS_DIR)) return [];
  return fs
    .readdirSync(IDEAS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name !== TEMPLATE_DIR_NAME && !name.startsWith("."))
    .map((name) => resolveStage(name))
    .filter(Boolean)
    .sort();
}

function resolveTargetStages(parsedOptions) {
  const explicitStages = splitCsv(parsedOptions.stages).map((stage) =>
    resolveRequiredStage(stage)
  );
  const discoveredStages = parsedOptions.all ? listIdeaStages() : [];
  if (parsedOptions.all && discoveredStages.length === 0 && explicitStages.length === 0) {
    fail("No idea folders found for --all. Initialize at least one idea first.");
  }
  const combined = [...explicitStages, ...discoveredStages];
  if (combined.length === 0) {
    fail(`Provide --all or --stages for batch commands.\n${usage}`);
  }
  const excluded = new Set(
    splitCsv(parsedOptions.exclude).map((stage) => resolveRequiredStage(stage))
  );
  const unique = [...new Set(combined)]
    .filter((stage) => !excluded.has(stage))
    .sort();
  if (unique.length === 0) {
    fail("No target stages remain after applying include/exclude filters.");
  }
  return unique;
}

function buildStackId(stage) {
  return `${STACK_PREFIX}-${stage}`;
}

function ensureIdeaContext({ stage, title, stackId }) {
  ensureDir(IDEAS_DIR);
  ensureTemplateFiles();
  ensureIndexFile();
  ensureGlobalImprovementsFile();

  const ideaDir = path.join(IDEAS_DIR, stage);
  const statusPath = path.join(ideaDir, STATUS_FILE_NAME);
  const outputsPath = path.join(ideaDir, OUTPUTS_FILE_NAME);
  ensureDir(ideaDir);

  const replacements = {
    IDEA_ID: stage,
    TITLE: title,
    STACK_ID: stackId,
    CREATED_AT: new Date().toISOString(),
    IDEA_DIR: `ideas/${stage}`,
  };

  TEMPLATE_FILES.forEach((name) => {
    const targetPath = path.join(ideaDir, name);
    if (fs.existsSync(targetPath)) return;
    const templatePath = path.join(TEMPLATE_DIR, name);
    const templateContent = fs.readFileSync(templatePath, "utf8");
    fs.writeFileSync(targetPath, applyTemplate(templateContent, replacements), "utf8");
  });

  return {
    ideaDir,
    statusPath,
    outputsPath,
  };
}

function ensureTemplateFiles() {
  ensureDir(TEMPLATE_DIR);
  const missing = TEMPLATE_FILES.filter(
    (name) => !fs.existsSync(path.join(TEMPLATE_DIR, name))
  );
  if (missing.length > 0) {
    fail(
      `Missing template files under ideas/${TEMPLATE_DIR_NAME}: ${missing.join(", ")}.`
    );
  }
}

function ensureIndexFile() {
  if (fs.existsSync(INDEX_PATH)) return;
  const content = `# Idea Environments

Use this file as the top-level overview for all parallel full-stack idea environments.

## Registry
${INDEX_START_MARKER}
${INDEX_END_MARKER}
`;
  fs.writeFileSync(INDEX_PATH, content, "utf8");
}

function ensureGlobalImprovementsFile() {
  if (fs.existsSync(GLOBAL_IMPROVEMENTS_PATH)) return;
  const content = `# Cross-Idea Improvements

Track rollouts of the same improvement across multiple idea stacks.

## Rollout Log
`;
  fs.writeFileSync(GLOBAL_IMPROVEMENTS_PATH, content, "utf8");
}

function deployStage({
  stage,
  improvement,
  event,
  contextArgs,
  skipSanity,
  skipUiSmoke,
}) {
  const stackId = buildStackId(stage);
  const ideaContext = ensureIdeaContext({
    stage,
    title: stage,
    stackId,
  });
  runCdkOrFail(
    [
      "deploy",
      "--require-approval",
      "never",
      ...contextArgs,
      "--outputs-file",
      ideaContext.outputsPath,
    ],
    CDK_DIR
  );

  const outputs = readCdkOutputs({
    outputsPath: ideaContext.outputsPath,
    stackId,
  });
  if (!skipSanity) {
    runSanityChecks({
      stage,
      stackId,
      cloudfrontUrl: outputs.cloudfrontUrl,
      apiEndpoint: outputs.apiEndpoint,
    });
  }
  if (!skipUiSmoke) {
    runUiSmokeChecks({
      stage,
      stackId,
      cloudfrontUrl: outputs.cloudfrontUrl,
    });
  }
  const commit = resolveGitCommit();
  const improvementSuffix = improvement ? ` (${improvement})` : "";

  upsertIndexEntry({
    stage,
    stackId,
    status: "LIVE",
    cloudfront: outputs.cloudfrontUrl,
    api: outputs.apiEndpoint,
    note: `Deployed ${commit}${improvementSuffix}`,
  });
  appendStatusLog({
    statusPath: ideaContext.statusPath,
    event,
    detail: [
      `stack=${stackId}`,
      `cloudfront=${outputs.cloudfrontUrl}`,
      `api=${outputs.apiEndpoint}`,
      `commit=${commit}`,
      `sanity=${skipSanity ? "skipped" : "passed"}`,
      `ui_smoke=${skipUiSmoke ? "skipped" : "passed"}`,
      improvement ? `improvement=${improvement}` : "",
    ]
      .filter(Boolean)
      .join(" | "),
  });
  if (improvement) {
    appendIdeaImprovementLog({
      ideaDir: ideaContext.ideaDir,
      improvement,
      commit,
      result: "deployed",
      detail: `stack=${stackId}`,
    });
  }
  info(`Deployed "${stage}" (${stackId})`);

  return {
    stage,
    stackId,
    commit,
  };
}

function executeDeployMany({
  stages,
  improvement,
  owner,
  ttlDays,
  skipBuild,
  skipSanity,
  skipUiSmoke,
  continueOnError,
  dryRun,
  action,
}) {
  if (dryRun) {
    printDryRun({
      action,
      stages,
      improvement,
      skipBuild,
      skipSanity,
      skipUiSmoke,
      owner,
      ttlDays,
    });
    return;
  }

  const succeeded = [];
  const failed = [];
  let commitForRollout = resolveGitCommit();

  withLock(() => {
    runOrFail("npm", ["--prefix", "cdk", "run", "build"], ROOT_DIR);
    if (!skipBuild) {
      runOrFail("npm", ["--prefix", "frontend", "run", "build"], ROOT_DIR);
    }

    stages.forEach((stage) => {
      try {
        const result = deployStage({
          stage,
          improvement,
          event: action,
          contextArgs: buildCdkContextArgs({ stage, owner, ttlDays }),
          skipSanity,
          skipUiSmoke,
        });
        succeeded.push(stage);
        if (result.commit && result.commit !== "-") {
          commitForRollout = result.commit;
        }
      } catch (error) {
        const message = normalizeLogValue(error?.message || "Unknown deploy error");
        failed.push({ stage, message });
        const stackId = buildStackId(stage);
        const ideaContext = ensureIdeaContext({
          stage,
          title: stage,
          stackId,
        });
        upsertIndexEntry({
          stage,
          stackId,
          status: "ERROR",
          cloudfront: "-",
          api: "-",
          note: `Deploy failed ${commitForRollout} (${improvement})`,
        });
        appendStatusLog({
          statusPath: ideaContext.statusPath,
          event: `${action}-error`,
          detail: `stack=${stackId} | improvement=${improvement} | error=${message}`,
        });
        appendIdeaImprovementLog({
          ideaDir: ideaContext.ideaDir,
          improvement,
          commit: commitForRollout,
          result: "failed",
          detail: message,
        });
        if (!continueOnError) {
          throw error instanceof Error ? error : new Error(message);
        }
      }
    });
  });

  appendGlobalImprovementLog({
    action,
    improvement,
    targets: stages,
    succeeded,
    failed: failed.map((item) => item.stage),
    commit: commitForRollout,
  });

  if (failed.length > 0) {
    fail(
      `${action} completed with failures: ${failed
        .map((item) => `${item.stage} (${item.message})`)
        .join(", ")}`
    );
  }

  info(
    `${action} completed for improvement "${improvement}" across: ${stages.join(", ")}`
  );
}

function appendGlobalImprovementLog({
  action,
  improvement,
  targets,
  succeeded,
  failed,
  commit,
}) {
  ensureGlobalImprovementsFile();
  const line = [
    `- ${new Date().toISOString()}`,
    `action=${normalizeLogValue(action)}`,
    `improvement=${normalizeLogValue(improvement)}`,
    `targets=${targets.join(",")}`,
    `succeeded=${succeeded.join(",") || "-"}`,
    `failed=${failed.join(",") || "-"}`,
    `commit=${normalizeLogValue(commit || "-")}`,
  ].join(" | ");

  const current = fs.readFileSync(GLOBAL_IMPROVEMENTS_PATH, "utf8");
  const updated = `${current.trimEnd()}\n${line}\n`;
  fs.writeFileSync(GLOBAL_IMPROVEMENTS_PATH, updated, "utf8");
}

function appendIdeaImprovementLog({ ideaDir, improvement, commit, result, detail }) {
  const improvementPath = path.join(ideaDir, IMPROVEMENTS_FILE_NAME);
  const line = [
    `- ${new Date().toISOString()}`,
    `improvement=${normalizeLogValue(improvement)}`,
    `result=${normalizeLogValue(result)}`,
    `commit=${normalizeLogValue(commit || "-")}`,
    `detail=${normalizeLogValue(detail || "-")}`,
  ].join(" | ");

  if (!fs.existsSync(improvementPath)) {
    const content = `# Improvements

## Log
${line}
`;
    fs.writeFileSync(improvementPath, content, "utf8");
    return;
  }

  const current = fs.readFileSync(improvementPath, "utf8");
  if (!current.includes("## Log")) {
    const updated = `${current.trimEnd()}\n\n## Log\n${line}\n`;
    fs.writeFileSync(improvementPath, updated, "utf8");
    return;
  }

  const updated = `${current.trimEnd()}\n${line}\n`;
  fs.writeFileSync(improvementPath, updated, "utf8");
}

function upsertIndexEntry({
  stage,
  stackId,
  status,
  cloudfront,
  api,
  note,
}) {
  const current = fs.readFileSync(INDEX_PATH, "utf8");
  const startIndex = current.indexOf(INDEX_START_MARKER);
  const endIndex = current.indexOf(INDEX_END_MARKER);
  if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
    fail(
      `Invalid index markers in ${INDEX_PATH}. Expected ${INDEX_START_MARKER} and ${INDEX_END_MARKER}.`
    );
  }
  const blockStart = startIndex + INDEX_START_MARKER.length;
  const block = current.slice(blockStart, endIndex).trim();
  const lines = block
    ? block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    : [];

  const entry = [
    `- idea=${normalizeLogValue(stage)}`,
    `stack=${normalizeLogValue(stackId)}`,
    `status=${normalizeLogValue(status)}`,
    `last_action=${new Date().toISOString()}`,
    `cloudfront=${normalizeLogValue(cloudfront || "-")}`,
    `api=${normalizeLogValue(api || "-")}`,
    `folder=ideas/${normalizeLogValue(stage)}`,
    `note=${normalizeLogValue(note || "-")}`,
  ].join(" | ");

  const prefix = `- idea=${normalizeLogValue(stage)} |`;
  const existingIndex = lines.findIndex((line) => line.startsWith(prefix));
  if (existingIndex >= 0) {
    lines[existingIndex] = entry;
  } else {
    lines.push(entry);
  }
  lines.sort((left, right) => left.localeCompare(right));

  const replacementBlock = lines.length ? `\n${lines.join("\n")}\n` : "\n";
  const updated =
    current.slice(0, blockStart) +
    replacementBlock +
    current.slice(endIndex);

  fs.writeFileSync(INDEX_PATH, updated, "utf8");
}

function appendStatusLog({ statusPath, event, detail }) {
  const now = new Date().toISOString();
  const line = `- ${now} | event=${normalizeLogValue(event)} | ${normalizeLogValue(
    detail
  )}`;
  const current = fs.existsSync(statusPath)
    ? fs.readFileSync(statusPath, "utf8")
    : "";

  if (!current.trim()) {
    const seed = `# Status

## Activity Log
${line}
`;
    fs.writeFileSync(statusPath, seed, "utf8");
    return;
  }

  const activityHeader = "## Activity Log";
  if (!current.includes(activityHeader)) {
    const updated = `${current.trimEnd()}\n\n${activityHeader}\n${line}\n`;
    fs.writeFileSync(statusPath, updated, "utf8");
    return;
  }

  const updated = `${current.trimEnd()}\n${line}\n`;
  fs.writeFileSync(statusPath, updated, "utf8");
}

function readCdkOutputs({ outputsPath, stackId }) {
  const stackOutputs = readStackOutputsFile({ outputsPath, stackId });
  const cloudfrontDomain = stackOutputs.CloudFrontURL || "-";
  const cloudfrontUrl =
    cloudfrontDomain && cloudfrontDomain !== "-"
      ? cloudfrontDomain.startsWith("http")
        ? cloudfrontDomain
        : `https://${cloudfrontDomain}`
      : "-";
  return {
    cloudfrontUrl,
    apiEndpoint: stackOutputs.APIEndpoint || "-",
  };
}

function readStackOutputsFile({ outputsPath, stackId }) {
  if (!fs.existsSync(outputsPath)) return {};
  const raw = fs.readFileSync(outputsPath, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {};
  }
  if (!parsed || typeof parsed !== "object") return {};
  const stackOutputs = parsed[stackId] || parsed[Object.keys(parsed)[0] || ""];
  if (!stackOutputs || typeof stackOutputs !== "object") return {};
  return stackOutputs;
}

function readStackOutputsFromAws({ stackId }) {
  const result = spawnSync(
    "aws",
    [
      "cloudformation",
      "describe-stacks",
      "--stack-name",
      stackId,
      "--output",
      "json",
    ],
    {
      cwd: ROOT_DIR,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    }
  );
  if (result.error || result.status !== 0) {
    return {};
  }

  let parsed;
  try {
    parsed = JSON.parse(result.stdout || "{}");
  } catch (error) {
    return {};
  }
  const outputsList = parsed?.Stacks?.[0]?.Outputs;
  if (!Array.isArray(outputsList)) return {};

  return outputsList.reduce((accumulator, output) => {
    if (!output?.OutputKey) return accumulator;
    accumulator[String(output.OutputKey)] = String(output.OutputValue || "");
    return accumulator;
  }, {});
}

function normalizeCloudfrontUrl(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value || value === "-") return "";
  return value.startsWith("http") ? value : `https://${value}`;
}

function normalizeCognitoDomain(rawValue) {
  const value = String(rawValue || "").trim().replace(/\/+$/, "");
  if (!value || value === "-") return "";
  return value.startsWith("http") ? value : `https://${value}`;
}

function resolveUiRuntimeConfig({ stage, stackId, outputsPath }) {
  const fileOutputs = readStackOutputsFile({ outputsPath, stackId });
  const awsOutputs = readStackOutputsFromAws({ stackId });
  const combined = {
    ...fileOutputs,
    ...awsOutputs,
  };

  const apiEndpoint = String(
    combined.APIEndpoint ||
      combined.ApiGatewayEndpoint5AA8EC3A ||
      combined.ApiGatewayEndpoint ||
      ""
  ).trim();
  const cognitoDomain = normalizeCognitoDomain(combined.CognitoDomain);
  const clientId = String(combined.UserPoolClientId || "").trim();
  const userPoolId = String(combined.UserPoolId || "").trim();
  const region = String(combined.Region || combined.AWS_REGION || "").trim() ||
    (userPoolId.includes("_") ? userPoolId.split("_")[0] : "");
  const cloudfrontUrl = normalizeCloudfrontUrl(combined.CloudFrontURL);
  const source = Object.keys(awsOutputs).length > 0 ? "aws-cloudformation" : "local-outputs";

  const missing = [
    apiEndpoint ? "" : "APIEndpoint",
    cognitoDomain ? "" : "CognitoDomain",
    clientId ? "" : "UserPoolClientId",
    userPoolId ? "" : "UserPoolId",
    region ? "" : "Region",
  ].filter(Boolean);

  if (missing.length > 0) {
    fail(
      [
        `Cannot start local UI for stage "${stage}" because runtime outputs are incomplete.`,
        `Missing: ${missing.join(", ")}.`,
        `Deploy or refresh stack outputs first: npm --prefix cdk run idea:deploy -- --stage=${stage} --improvement="refresh-runtime-outputs"`,
      ].join(" ")
    );
  }

  return {
    source,
    apiEndpoint,
    cognitoDomain,
    clientId,
    userPoolId,
    region,
    cloudfrontUrl,
  };
}

function runUiLocal({ stage, port, openBrowser, printEnv, dryRun }) {
  const stackId = buildStackId(stage);
  const ideaDir = path.join(IDEAS_DIR, stage);
  if (!fs.existsSync(ideaDir)) {
    fail(
      [
        `Unknown idea stage "${stage}".`,
        `Initialize and deploy first: npm --prefix cdk run idea:init -- --stage=${stage} --title="${stage}"`,
      ].join(" ")
    );
  }
  const runtime = resolveUiRuntimeConfig({
    stage,
    stackId,
    outputsPath: path.join(ideaDir, OUTPUTS_FILE_NAME),
  });
  const resolvedPort = port || String(process.env.PORT || "3000");
  const envForFrontend = {
    ...process.env,
    REACT_APP_API_URL: runtime.apiEndpoint,
    REACT_APP_COGNITO_DOMAIN: runtime.cognitoDomain,
    REACT_APP_COGNITO_CLIENT_ID: runtime.clientId,
    REACT_APP_COGNITO_USER_POOL_ID: runtime.userPoolId,
    REACT_APP_COGNITO_REGION: runtime.region,
    PORT: resolvedPort,
    BROWSER: openBrowser ? String(process.env.BROWSER || "") : "none",
  };

  const envLines = [
    `REACT_APP_API_URL=${runtime.apiEndpoint}`,
    `REACT_APP_COGNITO_DOMAIN=${runtime.cognitoDomain}`,
    `REACT_APP_COGNITO_CLIENT_ID=${runtime.clientId}`,
    `REACT_APP_COGNITO_USER_POOL_ID=${runtime.userPoolId}`,
    `REACT_APP_COGNITO_REGION=${runtime.region}`,
    `PORT=${resolvedPort}`,
    `BROWSER=${envForFrontend.BROWSER || "(default)"}`,
  ];

  info(
    `ui-local stage=${stage} | stack=${stackId} | source=${runtime.source} | cloudfront=${
      runtime.cloudfrontUrl || "-"
    }`
  );
  envLines.forEach((line) => info(line));

  if (dryRun || printEnv) {
    return;
  }

  info(`Starting local frontend at http://localhost:${resolvedPort}`);
  const result = spawnSync("npm", ["--prefix", "frontend", "run", "start"], {
    cwd: ROOT_DIR,
    stdio: "inherit",
    env: envForFrontend,
  });
  if (result.error) {
    throw new Error(`Failed to start local frontend: ${result.error.message}`);
  }
  if (result.signal && (result.signal === "SIGINT" || result.signal === "SIGTERM")) {
    return;
  }
  if (result.status !== 0) {
    throw new Error(`Local frontend exited with code ${String(result.status || 1)}`);
  }
}

function runSanityChecks({ stage, stackId, cloudfrontUrl, apiEndpoint }) {
  const sanityArgs = [SANITY_SCRIPT_RELATIVE_PATH, "--stage", stage, "--stack-id", stackId];
  if (cloudfrontUrl && cloudfrontUrl !== "-") {
    sanityArgs.push("--cloudfront", cloudfrontUrl);
  }
  if (apiEndpoint && apiEndpoint !== "-") {
    sanityArgs.push("--api", apiEndpoint);
  }
  runOrFail("node", sanityArgs, CDK_DIR);
}

function runUiSmokeChecks({ stage, stackId, cloudfrontUrl }) {
  const uiSmokeArgs = [UI_SMOKE_SCRIPT_RELATIVE_PATH, "--stage", stage, "--stack-id", stackId];
  if (cloudfrontUrl && cloudfrontUrl !== "-") {
    uiSmokeArgs.push("--cloudfront", cloudfrontUrl);
  }
  runOrFail("node", uiSmokeArgs, CDK_DIR);
}

function resolveGitCommit() {
  const result = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
    cwd: ROOT_DIR,
    encoding: "utf8",
  });
  if (result.status !== 0) return "-";
  return (result.stdout || "").trim() || "-";
}

function withLock(callback) {
  let acquired = false;
  try {
    acquired = tryAcquireLock();
    if (!acquired && clearStaleLock()) {
      acquired = tryAcquireLock();
    }
    if (!acquired) {
      fail(
        `Another CDK idea operation is already running. Wait and retry. Lock: ${LOCK_PATH}`
      );
    }
    callback();
  } catch (error) {
    if (error instanceof Error) {
      fail(error.message);
    }
    fail("Unknown execution error.");
  } finally {
    if (acquired && fs.existsSync(LOCK_PATH)) {
      fs.unlinkSync(LOCK_PATH);
    }
  }
}

function tryAcquireLock() {
  try {
    fs.writeFileSync(LOCK_PATH, `${process.pid}`, { flag: "wx" });
    return true;
  } catch (error) {
    if (error && error.code === "EEXIST") {
      return false;
    }
    throw error;
  }
}

function clearStaleLock() {
  if (!fs.existsSync(LOCK_PATH)) return false;
  const pidRaw = fs.readFileSync(LOCK_PATH, "utf8").trim();
  const pid = Number(pidRaw);
  if (!Number.isInteger(pid) || pid <= 0) {
    fs.unlinkSync(LOCK_PATH);
    return true;
  }
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    if (error && error.code === "ESRCH") {
      fs.unlinkSync(LOCK_PATH);
      return true;
    }
    return false;
  }
}

function resolveCdkInvocation() {
  const localCdkPath = path.join(
    CDK_DIR,
    "node_modules",
    ".bin",
    process.platform === "win32" ? WINDOWS_CDK_BIN : POSIX_CDK_BIN
  );
  if (fs.existsSync(localCdkPath)) {
    return {
      commandName: localCdkPath,
      commandArgs: [],
    };
  }

  const globalCheck = spawnSync(POSIX_CDK_BIN, ["--version"], {
    cwd: CDK_DIR,
    stdio: "ignore",
    env: process.env,
  });
  if (globalCheck.status === 0) {
    return {
      commandName: POSIX_CDK_BIN,
      commandArgs: [],
    };
  }

  return {
    commandName: "npx",
    commandArgs: [POSIX_CDK_BIN],
  };
}

function runCdkOrFail(args, cwd) {
  runOrFail(cdkInvocation.commandName, [...cdkInvocation.commandArgs, ...args], cwd);
}

function runOrFail(commandName, args, cwd) {
  const result = spawnSync(commandName, args, {
    cwd,
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) {
    throw new Error(`Failed to run ${commandName}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `${commandName} exited with code ${String(result.status || 1)}`
    );
  }
}

function applyTemplate(template, replacements) {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (match, token) => {
    if (Object.prototype.hasOwnProperty.call(replacements, token)) {
      return replacements[token];
    }
    return match;
  });
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function printIdeaList() {
  const stages = listIdeaStages();
  if (stages.length === 0) {
    info("No idea folders found.");
    return;
  }
  info(`Ideas: ${stages.join(", ")}`);
}

function printDryRun({
  action,
  stages,
  improvement,
  skipBuild,
  skipSanity,
  skipUiSmoke,
  owner,
  ttlDays,
}) {
  const lines = [
    `dry-run action=${action}`,
    `targets=${stages.join(",")}`,
    `skip_build=${skipBuild ? "true" : "false"}`,
    `skip_sanity=${skipSanity ? "true" : "false"}`,
    `skip_ui_smoke=${skipUiSmoke ? "true" : "false"}`,
    improvement ? `improvement=${improvement}` : "",
    owner ? `owner=${owner}` : "",
    ttlDays ? `ttl_days=${ttlDays}` : "",
  ].filter(Boolean);
  info(lines.join(" | "));
}

function fail(message) {
  console.error(`[idea-env] ${message}`);
  process.exit(1);
}

function info(message) {
  console.log(`[idea-env] ${message}`);
}
