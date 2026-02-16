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

const sanitizeScenePrompt = (value = "") => {
  if (!value) return "";
  const cleaned = value
    .replace(/establishing shot/gi, "")
    .replace(/extreme wide/gi, "")
    .replace(/ultra wide/gi, "")
    .replace(/medium[- ]?long shot/gi, "")
    .replace(/environment visible/gi, "")
    .replace(/balanced composition/gi, "")
    .replace(/\bwide shot\b/gi, "")
    .replace(/\blong shot\b/gi, "")
    .replace(/close[- ]?up/gi, "")
    .replace(/extreme close[- ]?up/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (cleaned.includes("?")) {
    return cleaned.split("?")[0].trim();
  }
  return cleaned;
};

const normalizePromptFragment = (value = "") =>
  value
    .replace(/[\r\n]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

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
  maxEnvironment = 6,
  maxAction = 1,
}) => {
  const env = dedupeFragments(environment)
    .map((fragment) => normalizePromptFragment(fragment))
    .filter(Boolean)
    .filter((fragment) => fragment.length <= 90);
  const act = dedupeFragments(action)
    .map((fragment) => normalizePromptFragment(fragment))
    .filter(Boolean)
    .filter((fragment) => fragment.length <= 70);

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


const buildStoryIllustrationPrompt = ({
  character,
  sessionItem,
  cleanScenePrompt,
  sceneEnvironment,
  sceneAction,
  contextMode,
}) => {
  const shotRange = character?.viewDistance || "medium shot";
  const includeScene =
    contextMode === "scene" ||
    contextMode === "summary+scene" ||
    contextMode === "summary+latest" ||
    contextMode === "recent" ||
    contextMode === "summary+recent";
  const sceneContext = includeScene
    ? {
        environment: splitPromptFragments(sceneEnvironment),
        action: splitPromptFragments(sceneAction),
      }
    : { environment: [], action: [] };
  const resolvedSceneContext =
    sceneContext.environment.length || sceneContext.action.length
      ? sceneContext
      : includeScene
        ? extractSceneContextFragments(cleanScenePrompt)
        : { environment: [], action: [] };
  const stateSceneContext = buildSceneFragmentsFromStoryState(
    sessionItem?.storyState || {},
    sessionItem?.worldPrompt || ""
  );
  const hasSceneEnvironment =
    resolvedSceneContext.environment.length > 0;
  const environmentParts = dedupeFragments([
    ...resolvedSceneContext.environment,
    ...(hasSceneEnvironment
      ? []
      : [...stateSceneContext.environment, sessionItem?.worldPrompt]),
  ]);
  const actionParts = dedupeFragments([
    ...resolvedSceneContext.action,
    ...(resolvedSceneContext.action.length > 0 ? [] : stateSceneContext.action),
  ]);
  const compactScene = buildCompactSceneContext({
    environment: environmentParts,
    action: actionParts,
  });
  const promptEnvironment = dedupeFragments(compactScene.environment).slice(0, 4);

  const characterParts = ["1girl", "solo"];
  if (character?.name) {
    const weight =
      typeof character.weight === "number" ? character.weight : 1.4;
    characterParts.push(`(${character.name}:${weight})`);
  }
  if (character?.signatureTraits) {
    characterParts.push(character.signatureTraits);
  }

  const focusActionParts = dedupeFragments([
    character?.eyeDetails,
    character?.pose,
  ]);

  const visualParts = dedupeFragments([character?.styleReference]);
  const focusParts = dedupeFragments([
    ...focusActionParts,
    ...compactScene.action.slice(0, 1),
  ]);
  const resolvedFocusParts =
    focusParts.length > 0 ? focusParts : ["visible character posture"];
  const hasFullBodyShot = /\bfull body\b/i.test(shotRange);
  const subjectFocusParts = dedupeFragments(
    hasFullBodyShot
      ? [
          "character occupies most of frame",
          "face clearly visible",
          "sharp focus on face",
        ]
      : [
          "character in foreground",
          "face clearly visible",
          "sharp focus on face",
        ]
  );
  const backgroundBalance = "background detailed but secondary";

  return [
    characterParts.join(", "),
    shotRange,
    resolvedFocusParts.join(", "),
    subjectFocusParts.join(", "),
    promptEnvironment.join(", "),
    backgroundBalance,
    visualParts.join(", "),
  ]
    .filter(Boolean)
    .join(", ");
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
  sanitizeScenePrompt,
  normalizePromptFragment,
  splitPromptFragments,
  extractSceneContextFragments,
  dedupeFragments,
  buildSceneFragmentsFromStoryState,
  buildCompactSceneContext,
  compactScenePayload,
  clipText,
  buildStoryIllustrationPrompt,
  MAX_REPLICATE_PROMPT_TOKENS,
  estimateTokenCount,
  clampPromptTokens,
};
