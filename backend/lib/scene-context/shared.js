const PROMPT_FRAGMENT_SPLIT_PATTERN = /,|;|\.(?=\s|$)/g;
const CHARACTER_NAME_TERM_MIN_LENGTH = 3;
const CHARACTER_NAME_MAX_SIGNAL_TERMS = 8;
const CHARACTER_ANCHOR_MAX_FRAGMENTS = 6;
const CHARACTER_TO_ENVIRONMENT_FRAGMENT_RATIO = 2;
const MIN_ENVIRONMENT_FRAGMENT_BUDGET = 1;
const MAX_ENVIRONMENT_FRAGMENT_BUDGET = 3;
const CHARACTER_NAME_EXACT_MATCH_BONUS = 3;
const CHARACTER_PRIORITY_NEGATIVE_GUARDS = Object.freeze([
  "scenery only",
  "no person",
  "no character",
  "distant face",
  "faceless",
]);
const CHARACTER_NAME_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "the",
  "to",
  "with",
]);
const CHARACTER_FOCUS_PATTERNS = Object.freeze([
  /\b(1girl|1boy|solo)\b/i,
  /\b(face|facial|expression|eyes?|iris|pupil|gaze)\b/i,
  /\b(hair|bangs?|fringe|braid|ponytail)\b/i,
  /\b(outfit|clothing|robe|dress|cloak|armor|jacket)\b/i,
  /\b(pose|standing|sitting|kneeling|walking|running)\b/i,
  /\b(upper body|waist[- ]up|full body|close[- ]?up|portrait)\b/i,
]);
const ENVIRONMENT_FOCUS_PATTERNS = Object.freeze([
  /\b(background|environment|scenery|landscape)\b/i,
  /\b(forest|woods?|valley|mountain|hill|field|meadow)\b/i,
  /\b(village|town|city|street|road|castle|temple|garden)\b/i,
  /\b(room|hall|interior|exterior|window|doorway)\b/i,
  /\b(sky|clouds?|sunset|sunrise|night|daylight|weather|rain|snow|fog|mist)\b/i,
  /\b(lake|river|ocean|sea|beach)\b/i,
]);
const STYLE_COHERENCE_PATTERNS = Object.freeze([
  /\b(anime|illustration|cinematic|line art|painterly|shading)\b/i,
  /\b(composition|perspective|occlusion|coherent|readability)\b/i,
  /\b(lighting|color palette|depth|detail|quality)\b/i,
]);

const parsePromptPairResponse = ({
  responseText = "",
  safeJsonParse,
  normalizePromptFragment,
}) => {
  const parsed = safeJsonParse(responseText) || {};
  const normalizedPositive = normalizePromptFragment(
    parsed.positivePrompt || parsed.positive || ""
  );
  const normalizedNegative = normalizePromptFragment(
    parsed.negativePrompt || parsed.negative || ""
  );
  if (normalizedPositive || normalizedNegative) {
    return {
      positivePrompt: normalizedPositive,
      negativePrompt: normalizedNegative,
    };
  }

  const positiveMatch = responseText.match(
    /POSITIVE:\s*([\s\S]*?)(?:\nNEGATIVE:|$)/i
  );
  const negativeMatch = responseText.match(/NEGATIVE:\s*([\s\S]*)/i);
  return {
    positivePrompt: normalizePromptFragment(positiveMatch?.[1] || ""),
    negativePrompt: normalizePromptFragment(negativeMatch?.[1] || ""),
  };
};

const escapeRegexLiteral = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const dedupePromptFragments = (fragments = []) => {
  const seen = new Set();
  return fragments.filter((fragment) => {
    const normalized = String(fragment || "").trim();
    if (!normalized) return false;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const splitPromptFragments = ({ value = "", normalizePromptFragment }) =>
  dedupePromptFragments(
    String(value || "")
      .replace(/[\r\n]+/g, ",")
      .split(PROMPT_FRAGMENT_SPLIT_PATTERN)
      .map((fragment) => normalizePromptFragment(fragment))
      .filter(Boolean)
  );

const countPatternMatches = (value = "", patterns = []) =>
  patterns.reduce(
    (count, pattern) => (pattern.test(value) ? count + 1 : count),
    0
  );

const extractCharacterNameTerms = (name = "") =>
  Array.from(
    new Set(
      String(name || "")
        .toLowerCase()
        .split(/[^a-z0-9]+/g)
        .map((term) => term.trim())
        .filter(
          (term) =>
            term.length >= CHARACTER_NAME_TERM_MIN_LENGTH &&
            !CHARACTER_NAME_STOPWORDS.has(term)
        )
    )
  ).slice(0, CHARACTER_NAME_MAX_SIGNAL_TERMS);

const countNameTermMatches = ({ value = "", terms = [] }) =>
  terms.reduce((count, term) => {
    const pattern = new RegExp(`\\b${escapeRegexLiteral(term)}\\b`, "i");
    return pattern.test(value) ? count + 1 : count;
  }, 0);

const buildPromptFocusContext = ({ character = {}, normalizePromptFragment }) => {
  const normalizedName = normalizePromptFragment(character?.name || "").toLowerCase();
  return {
    normalizedName,
    nameTerms: extractCharacterNameTerms(character?.name || ""),
  };
};

const classifyPromptFragment = ({ fragment = "", focusContext = {} }) => {
  const normalized = String(fragment || "").toLowerCase();
  if (!normalized) return "neutral";

  const characterScore =
    countPatternMatches(normalized, CHARACTER_FOCUS_PATTERNS) +
    countNameTermMatches({
      value: normalized,
      terms: focusContext.nameTerms || [],
    }) +
    (focusContext.normalizedName &&
    normalized.includes(focusContext.normalizedName)
      ? CHARACTER_NAME_EXACT_MATCH_BONUS
      : 0);
  const environmentScore = countPatternMatches(
    normalized,
    ENVIRONMENT_FOCUS_PATTERNS
  );
  const styleScore = countPatternMatches(normalized, STYLE_COHERENCE_PATTERNS);

  if (characterScore > 0 && characterScore >= environmentScore) {
    return "character";
  }
  if (environmentScore > 0 && environmentScore > characterScore) {
    return "environment";
  }
  if (styleScore > 0) {
    return "style";
  }
  return "neutral";
};

const buildCharacterAnchorFragments = ({
  character = {},
  normalizePromptFragment,
  focusContext,
}) => {
  const sourceText = [
    character?.identityPrompt,
    character?.signatureTraits,
    character?.eyeDetails,
    character?.pose,
  ]
    .filter(Boolean)
    .join(", ");
  const sourceFragments = splitPromptFragments({
    value: sourceText,
    normalizePromptFragment,
  }).filter(
    (fragment) =>
      classifyPromptFragment({ fragment, focusContext }) === "character"
  );
  return dedupePromptFragments([
    normalizePromptFragment(character?.name || ""),
    ...sourceFragments,
  ]).slice(0, CHARACTER_ANCHOR_MAX_FRAGMENTS);
};

const resolveEnvironmentFragmentBudget = ({ characterFragmentCount = 0 }) => {
  if (characterFragmentCount <= 0) {
    return MIN_ENVIRONMENT_FRAGMENT_BUDGET;
  }
  const ratioBudget = Math.floor(
    characterFragmentCount / CHARACTER_TO_ENVIRONMENT_FRAGMENT_RATIO
  );
  return Math.max(
    MIN_ENVIRONMENT_FRAGMENT_BUDGET,
    Math.min(MAX_ENVIRONMENT_FRAGMENT_BUDGET, ratioBudget)
  );
};

const rebalanceIllustrationPositivePrompt = ({
  positivePrompt = "",
  character = {},
  normalizePromptFragment,
}) => {
  const sourceFragments = splitPromptFragments({
    value: positivePrompt,
    normalizePromptFragment,
  });
  if (!sourceFragments.length) return "";

  const focusContext = buildPromptFocusContext({
    character,
    normalizePromptFragment,
  });
  const characterAnchors = buildCharacterAnchorFragments({
    character,
    normalizePromptFragment,
    focusContext,
  });
  const buckets = {
    character: [],
    style: [],
    neutral: [],
    environment: [],
  };

  sourceFragments.forEach((fragment) => {
    const category = classifyPromptFragment({
      fragment,
      focusContext,
    });
    buckets[category].push(fragment);
  });

  const characterFragments = dedupePromptFragments([
    ...characterAnchors,
    ...buckets.character,
  ]);
  const environmentBudget = resolveEnvironmentFragmentBudget({
    characterFragmentCount: characterFragments.length,
  });
  const rebalancedFragments = dedupePromptFragments([
    ...characterFragments,
    ...buckets.style,
    ...buckets.neutral,
    ...buckets.environment.slice(0, environmentBudget),
  ]);

  return (rebalancedFragments.length
    ? rebalancedFragments
    : sourceFragments
  ).join(", ");
};

const rebalanceIllustrationNegativePrompt = ({
  negativePrompt = "",
  normalizePromptFragment,
}) => {
  const sourceFragments = splitPromptFragments({
    value: negativePrompt,
    normalizePromptFragment,
  });
  return dedupePromptFragments([
    ...CHARACTER_PRIORITY_NEGATIVE_GUARDS,
    ...sourceFragments,
  ]).join(", ");
};

module.exports = {
  parsePromptPairResponse,
  dedupePromptFragments,
  splitPromptFragments,
  buildPromptFocusContext,
  classifyPromptFragment,
  buildCharacterAnchorFragments,
  resolveEnvironmentFragmentBudget,
  rebalanceIllustrationPositivePrompt,
  rebalanceIllustrationNegativePrompt,
};
