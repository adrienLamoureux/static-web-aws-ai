"use strict";

/**
 * usage-helpers.js — cost estimation utilities for the usage dashboard.
 *
 * MODEL_COSTS maps model keys (or provider prefixes) to an estimated USD cost
 * per output unit. Values approximate public Replicate / Bedrock / CivitAI
 * pricing as of 2026.
 */

// Cost per output unit in USD. Keys match the `model` field on JOB# items.
const MODEL_COSTS = {
  // Replicate image models
  animagine: 0.003,
  "wai-nsfw-illustrious-v11": 0.004,
  "wai-nsfw-illustrious-v12": 0.004,
  "seedream-4.5": 0.005,
  // Replicate video models
  "wan-2.2-i2v-fast": 0.04,
  "kling-v2.6": 0.08,
  "seedance-1.5-pro": 0.06,
  // Bedrock
  "titan-image": 0.01,
  "nova-reel": 0.08,
  // CivitAI
  civitai: 0.005,
  // Gradio
  gradio: 0.002,
};

// Provider-level fallback costs (used when model key isn't found).
const PROVIDER_FALLBACK_COSTS = {
  replicate: 0.004,
  bedrock: 0.01,
  civitai: 0.005,
  gradio: 0.002,
};

/**
 * Estimate cost for one job item based on model + provider fields.
 * Returns 0 for unknown models/providers.
 *
 * @param {object} item - DynamoDB JOB# item
 * @param {string} [item.model]
 * @param {string} [item.provider]
 * @returns {number} estimated cost in USD
 */
const estimateJobCost = (item = {}) => {
  const model = String(item.model || "")
    .toLowerCase()
    .trim();
  const provider = String(item.provider || "")
    .toLowerCase()
    .trim();

  if (model && model in MODEL_COSTS) {
    return MODEL_COSTS[model];
  }
  if (provider && provider in PROVIDER_FALLBACK_COSTS) {
    return PROVIDER_FALLBACK_COSTS[provider];
  }
  return 0;
};

/**
 * Parse a window string ("24h", "7d", "30d") into a "since" ISO timestamp.
 * Defaults to 24h if unrecognised.
 *
 * @param {string} window
 * @returns {string} ISO timestamp
 */
const parseUsageWindow = (window = "24h") => {
  const now = Date.now();
  if (window === "7d") return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  if (window === "30d") return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  // Default: 24h
  return new Date(now - 24 * 60 * 60 * 1000).toISOString();
};

/**
 * Aggregate JOB# items into a usage summary.
 *
 * @param {Array<object>} items - JOB# DynamoDB items
 * @returns {object} aggregated usage data
 */
const aggregateUsage = (items = []) => {
  let jobCount = 0;
  let failedCount = 0;
  let totalUsd = 0;
  const byProviderMap = new Map();
  const byModelMap = new Map();

  for (const item of items) {
    jobCount += 1;
    const status = String(item.status || "").toLowerCase();
    if (status === "failed") failedCount += 1;

    const provider = String(item.provider || "unknown").toLowerCase();
    const model = String(item.model || "unknown").toLowerCase();
    const cost = estimateJobCost(item);
    totalUsd += cost;

    // by provider
    const provEntry = byProviderMap.get(provider) || { provider, count: 0, usd: 0 };
    provEntry.count += 1;
    provEntry.usd += cost;
    byProviderMap.set(provider, provEntry);

    // by model
    const modelEntry = byModelMap.get(model) || { model, count: 0, usd: 0 };
    modelEntry.count += 1;
    modelEntry.usd += cost;
    byModelMap.set(model, modelEntry);
  }

  const recentFailureRate = jobCount > 0 ? failedCount / jobCount : 0;

  const byProvider = Array.from(byProviderMap.values()).sort((a, b) => b.count - a.count);
  const byModel = Array.from(byModelMap.values()).sort((a, b) => b.count - a.count);

  return {
    jobCount,
    failedCount,
    recentFailureRate: Math.round(recentFailureRate * 1000) / 1000,
    totalUsd: Math.round(totalUsd * 10000) / 10000,
    byProvider,
    byModel,
  };
};

module.exports = {
  MODEL_COSTS,
  PROVIDER_FALLBACK_COSTS,
  estimateJobCost,
  parseUsageWindow,
  aggregateUsage,
};
