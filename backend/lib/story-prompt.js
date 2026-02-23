const safeJsonParse = (text = "") => {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (err) {
      return null;
    }
  }
};

const extractJsonStringField = (text = "", field = "") => {
  if (!text || !field) return "";
  const fieldToken = `"${field}"`;
  const fieldIndex = text.indexOf(fieldToken);
  if (fieldIndex === -1) return "";
  const colonIndex = text.indexOf(":", fieldIndex + fieldToken.length);
  if (colonIndex === -1) return "";
  let start = colonIndex + 1;
  while (start < text.length && /\s/.test(text[start])) start += 1;
  if (text[start] !== "\"") return "";
  let i = start + 1;
  let escaped = false;
  for (; i < text.length; i += 1) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === "\"") {
      const raw = text.slice(start, i + 1);
      try {
        return JSON.parse(raw);
      } catch (err) {
        return "";
      }
    }
  }
  return "";
};

const parsePromptHelperResponse = (text = "") => {
  const parsed = safeJsonParse(text);
  if (parsed?.positivePrompt || parsed?.negativePrompt) {
    return {
      positive: parsed.positivePrompt?.trim() || "",
      negative: parsed.negativePrompt?.trim() || "",
    };
  }
  const positiveMatch = text.match(/POSITIVE:\s*([\s\S]*?)(?:\nNEGATIVE:|$)/i);
  const negativeMatch = text.match(/NEGATIVE:\s*([\s\S]*)/i);
  return {
    positive: positiveMatch?.[1]?.trim() || "",
    negative: negativeMatch?.[1]?.trim() || "",
  };
};

const parseSceneHelperResponse = (text = "") => {
  const parsed = safeJsonParse(text);
  if (parsed?.scenePrompt) {
    return {
      scenePrompt: parsed.scenePrompt?.trim() || "",
    };
  }
  const sceneMatch = text.match(/SCENE:\s*([\s\S]*?)(?:\n|$)/i);
  return {
    scenePrompt: sceneMatch?.[1]?.trim() || "",
  };
};

const normalizePromptFragment = (value = "") =>
  value
    .replace(/[\r\n]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

const DEFAULT_SCENE_MAX_ENVIRONMENT_FRAGMENTS = 6;
const DEFAULT_SCENE_MAX_ACTION_FRAGMENTS = 1;
const MAX_SCENE_ENVIRONMENT_FRAGMENT_LENGTH = 90;
const MAX_SCENE_ACTION_FRAGMENT_LENGTH = 70;

const splitPromptFragments = (value = "") =>
  String(value || "")
    .replace(/[\r\n]+/g, ",")
    .split(/,|;|\.(?=\s|$)/g)
    .map((part) =>
      normalizePromptFragment(part)
        .replace(/^[,;:\-\s]+/, "")
        .replace(/[,;:\-\s]+$/, "")
    )
    .filter(Boolean);

const extractSceneContextFragments = (scenePrompt = "") => {
  // We treat scenePrompt as already compact visual context from the model.
  return {
    environment: splitPromptFragments(scenePrompt),
    action: [],
  };
};

const dedupeFragments = (parts = []) => {
  const seen = new Set();
  return parts.filter((part) => {
    const normalized = String(part || "").trim();
    if (!normalized) return false;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const buildSceneFragmentsFromStoryState = (storyState = {}, worldPrompt = "") => {
  const scene = storyState?.scene || {};
  const environment = dedupeFragments([
    scene.locationName,
    scene.description,
    scene.weather,
    scene.timeOfDay,
    worldPrompt,
  ]);
  const action = [];
  return {
    environment,
    action,
    prompt: dedupeFragments([...environment, ...action]).join(", "),
  };
};

const buildCompactSceneContext = ({
  environment = [],
  action = [],
  maxEnvironment = DEFAULT_SCENE_MAX_ENVIRONMENT_FRAGMENTS,
  maxAction = DEFAULT_SCENE_MAX_ACTION_FRAGMENTS,
}) => {
  const env = dedupeFragments(environment)
    .map((fragment) => normalizePromptFragment(fragment))
    .filter(Boolean)
    .filter((fragment) => fragment.length <= MAX_SCENE_ENVIRONMENT_FRAGMENT_LENGTH);
  const act = dedupeFragments(action)
    .map((fragment) => normalizePromptFragment(fragment))
    .filter(Boolean)
    .filter((fragment) => fragment.length <= MAX_SCENE_ACTION_FRAGMENT_LENGTH);

  const compactEnvironment = env.slice(0, maxEnvironment);
  const compactAction = act.slice(0, maxAction);
  return {
    environment: compactEnvironment,
    action: compactAction,
    prompt: dedupeFragments([...compactEnvironment, ...compactAction]).join(", "),
  };
};

const compactScenePayload = ({
  scenePrompt = "",
  sceneEnvironment = "",
  sceneAction = "",
  maxEnvironment = DEFAULT_SCENE_MAX_ENVIRONMENT_FRAGMENTS,
  maxAction = DEFAULT_SCENE_MAX_ACTION_FRAGMENTS,
}) => {
  const promptContext = extractSceneContextFragments(scenePrompt || "");
  const rawMergedEnvironment = dedupeFragments([
    ...splitPromptFragments(sceneEnvironment || ""),
    ...promptContext.environment,
  ]);
  const mergedAction = dedupeFragments([
    ...splitPromptFragments(sceneAction || ""),
    ...promptContext.action,
  ]);
  const actionSet = new Set(
    mergedAction.map((fragment) => fragment.toLowerCase())
  );
  const mergedEnvironment = rawMergedEnvironment.filter(
    (fragment) => !actionSet.has(fragment.toLowerCase())
  );
  const compact = buildCompactSceneContext({
    environment: mergedEnvironment,
    action: mergedAction,
    maxEnvironment,
    maxAction,
  });
  return {
    scenePrompt: compact.prompt,
    sceneEnvironment: compact.environment.join(", "),
    sceneAction: compact.action.join(", "),
  };
};

const clipText = (value = "", max = 1200) => {
  const normalized = normalizePromptFragment(value);
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max).trim()}...`;
};

const MAX_REPLICATE_PROMPT_TOKENS = 75;

const estimateTokenCount = (value = "") =>
  value
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

const clampPromptTokens = (value = "", maxTokens = MAX_REPLICATE_PROMPT_TOKENS) => {
  if (!value) return "";
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  let tokenCount = 0;
  const kept = [];
  for (const part of parts) {
    const partTokens = part.split(/\s+/).filter(Boolean);
    if (tokenCount + partTokens.length > maxTokens) {
      break;
    }
    kept.push(part);
    tokenCount += partTokens.length;
  }
  if (kept.length) {
    return kept.join(", ");
  }
  const fallbackTokens = parts[0]?.split(/\s+/).filter(Boolean) || [];
  return fallbackTokens.slice(0, maxTokens).join(" ");
};


module.exports = {
  safeJsonParse,
  extractJsonStringField,
  parsePromptHelperResponse,
  parseSceneHelperResponse,
  normalizePromptFragment,
  splitPromptFragments,
  extractSceneContextFragments,
  dedupeFragments,
  DEFAULT_SCENE_MAX_ENVIRONMENT_FRAGMENTS,
  DEFAULT_SCENE_MAX_ACTION_FRAGMENTS,
  MAX_SCENE_ENVIRONMENT_FRAGMENT_LENGTH,
  MAX_SCENE_ACTION_FRAGMENT_LENGTH,
  buildSceneFragmentsFromStoryState,
  buildCompactSceneContext,
  compactScenePayload,
  clipText,
  MAX_REPLICATE_PROMPT_TOKENS,
  estimateTokenCount,
  clampPromptTokens,
};
