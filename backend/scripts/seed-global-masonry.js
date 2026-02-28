#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const DEFAULT_PREFIX = "app/masonry/";
const DEFAULT_REGION = process.env.AWS_REGION || "us-east-1";
const DEFAULTS_PATH = path.join(
  ROOT_DIR,
  "frontend",
  "src",
  "data",
  "pixnovel-masonry-defaults.json"
);

const usage = `
Usage:
  npm --prefix backend run idea:masonry-seed -- --stage=<idea-id> [--prefix=app/masonry/] [--dry-run]
`;

const parseArgs = (args = []) => {
  const parsed = {
    stage: "",
    prefix: DEFAULT_PREFIX,
    dryRun: false,
  };

  args.forEach((arg, index) => {
    if (arg.startsWith("--stage=")) {
      parsed.stage = String(arg.slice("--stage=".length) || "").trim();
      return;
    }
    if (arg === "--stage") {
      parsed.stage = String(args[index + 1] || "").trim();
      return;
    }
    if (arg.startsWith("--prefix=")) {
      parsed.prefix = String(arg.slice("--prefix=".length) || "").trim();
      return;
    }
    if (arg === "--prefix") {
      parsed.prefix = String(args[index + 1] || "").trim();
      return;
    }
    if (arg === "--dry-run") {
      parsed.dryRun = true;
    }
  });

  return parsed;
};

const resolveBucketName = (stage) => {
  const outputsPath = path.join(ROOT_DIR, "ideas", stage, "cdk-outputs.json");
  if (!fs.existsSync(outputsPath)) {
    throw new Error(
      `Missing outputs file for stage "${stage}" at ${outputsPath}. Deploy the stage first.`
    );
  }
  const outputs = JSON.parse(fs.readFileSync(outputsPath, "utf8"));
  const stackKey = Object.keys(outputs).find(
    (key) => outputs[key] && outputs[key].MediaBucketName
  );
  if (!stackKey) {
    throw new Error(`No MediaBucketName found in ${outputsPath}`);
  }
  return outputs[stackKey].MediaBucketName;
};

const loadDefaultImages = () => {
  if (!fs.existsSync(DEFAULTS_PATH)) {
    throw new Error(`Missing masonry defaults file: ${DEFAULTS_PATH}`);
  }
  const raw = JSON.parse(fs.readFileSync(DEFAULTS_PATH, "utf8"));
  return (Array.isArray(raw) ? raw : [])
    .map((item, index) => ({
      id: String(item?.id || `seed-${index + 1}`),
      src: String(item?.src || "").trim(),
    }))
    .filter((item) => item.src);
};

const normalizePrefix = (value = DEFAULT_PREFIX) => {
  const trimmed = String(value || "").trim().replace(/^\/+/, "");
  if (!trimmed) return DEFAULT_PREFIX;
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
};

const resolveExtension = ({ contentType = "", sourceUrl = "" }) => {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  if (contentType.includes("avif")) return "avif";
  const urlMatch = String(sourceUrl || "").match(/\.(png|jpe?g|webp|gif|avif)(?:$|\?)/i);
  if (urlMatch) {
    const ext = urlMatch[1].toLowerCase();
    return ext === "jpeg" ? "jpg" : ext;
  }
  return "jpg";
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  if (!options.stage) {
    throw new Error(`A valid --stage is required.${usage}`);
  }

  const bucket = resolveBucketName(options.stage);
  const prefix = normalizePrefix(options.prefix);
  const seeds = loadDefaultImages();
  if (!seeds.length) {
    throw new Error("No default masonry images were found.");
  }

  const s3Client = new S3Client({ region: DEFAULT_REGION });
  let uploadedCount = 0;

  for (const seed of seeds) {
    const response = await fetch(seed.src);
    if (!response.ok) {
      throw new Error(`Failed to download ${seed.src} (${response.status})`);
    }
    const contentType = response.headers.get("content-type") || "image/jpeg";
    const extension = resolveExtension({ contentType, sourceUrl: seed.src });
    const key = `${prefix}${seed.id}.${extension}`;

    if (options.dryRun) {
      log(`dry-run upload s3://${bucket}/${key} <- ${seed.src}`);
      uploadedCount += 1;
      continue;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: "public, max-age=86400",
      })
    );
    log(`uploaded s3://${bucket}/${key}`);
    uploadedCount += 1;
  }

  log(
    `${options.dryRun ? "Prepared" : "Uploaded"} ${uploadedCount} masonry image(s) for stage "${
      options.stage
    }".`
  );
};

const log = (message) => {
  console.log(`[seed-global-masonry] ${message}`);
};

main().catch((error) => {
  console.error(`[seed-global-masonry] ${error?.message || String(error)}`);
  process.exit(1);
});
