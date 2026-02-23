const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const REPLICATE_VERSION_ID_REGEX = /^[0-9a-f]{64}$/i;

const extractRetryAfterSeconds = (errorMessage = "") => {
  const match = errorMessage.match(/retry_after\":\s*(\d+)/i);
  if (match?.[1]) {
    const value = Number(match[1]);
    return Number.isFinite(value) ? value : null;
  }
  return null;
};

const runReplicateWithRetry = async (
  replicateClient,
  modelId,
  input,
  maxAttempts = 3
) => {
  let attempt = 0;
  while (attempt < maxAttempts) {
    try {
      return await replicateClient.run(modelId, { input });
    } catch (error) {
      attempt += 1;
      const message = error?.message || String(error);
      const retryAfterSeconds = extractRetryAfterSeconds(message);
      if (attempt >= maxAttempts || retryAfterSeconds == null) {
        throw error;
      }
      await delay(Math.max(retryAfterSeconds * 1000, 1000));
    }
  }
  return null;
};

const resolveReplicatePredictionTarget = (modelId = "") => {
  const normalizedModelId = String(modelId || "").trim();
  if (!normalizedModelId) {
    return {};
  }

  if (REPLICATE_VERSION_ID_REGEX.test(normalizedModelId)) {
    return { version: normalizedModelId };
  }

  const versionSeparatorIndex = normalizedModelId.lastIndexOf(":");
  if (versionSeparatorIndex > 0) {
    const versionCandidate = normalizedModelId.slice(versionSeparatorIndex + 1);
    if (REPLICATE_VERSION_ID_REGEX.test(versionCandidate)) {
      return { version: versionCandidate };
    }
  }

  return { model: normalizedModelId };
};

const buildReplicatePredictionRequest = ({ modelId = "", input = {} } = {}) => ({
  ...resolveReplicatePredictionTarget(modelId),
  input,
});

const collectReplicateOutputUrls = (output, urls) => {
  if (!output) return;
  if (Array.isArray(output)) {
    output.forEach((item) => collectReplicateOutputUrls(item, urls));
    return;
  }
  if (typeof output === "string") {
    urls.push(output);
    return;
  }
  if (typeof output.url === "function") {
    urls.push(output.url());
    return;
  }
  if (typeof output.url === "string") {
    urls.push(output.url);
  }
};

const getReplicateOutputUrls = (output) => {
  const urls = [];
  collectReplicateOutputUrls(output, urls);
  return urls.filter(Boolean);
};

const getReplicateOutputUrl = (output) =>
  getReplicateOutputUrls(output)[0] || null;

module.exports = {
  delay,
  extractRetryAfterSeconds,
  runReplicateWithRetry,
  resolveReplicatePredictionTarget,
  buildReplicatePredictionRequest,
  collectReplicateOutputUrls,
  getReplicateOutputUrls,
  getReplicateOutputUrl,
};
