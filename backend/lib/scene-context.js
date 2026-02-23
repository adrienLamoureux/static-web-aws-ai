const { InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");

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

const createAiCraftSceneContext = ({
  bedrockClient,
  promptHelperModelId,
  uniqueStringArray,
  safeJsonParse,
  normalizePromptFragment,
  compactScenePayload,
  clipText,
}) =>
  async ({
    scenePrompt = "",
    sceneEnvironment = "",
    sceneAction = "",
    contextText = "",
    storyState = {},
    lorebook = {},
    maxEnvironmentFragments,
    maxActionFragments,
  }) => {
    const fallback = compactScenePayload({
      scenePrompt,
      sceneEnvironment,
      sceneAction,
      maxEnvironment: maxEnvironmentFragments,
      maxAction: maxActionFragments,
    });
    const signalText = clipText(contextText, 1200);
    const sourcePayload = {
      scenePrompt: clipText(scenePrompt, 600),
      sceneEnvironment: clipText(sceneEnvironment, 600),
      sceneAction: clipText(sceneAction, 300),
      context: signalText,
      currentScene: {
        locationName: storyState?.scene?.locationName || "",
        description: storyState?.scene?.description || "",
        weather: storyState?.scene?.weather || "",
        timeOfDay: storyState?.scene?.timeOfDay || "",
        mood: storyState?.scene?.mood || "",
        tags: uniqueStringArray(storyState?.scene?.tags || []),
      },
      knownLocations: Array.isArray(lorebook?.locations)
        ? lorebook.locations.map((location) => ({
            id: location.id,
            name: location.name,
            tags: uniqueStringArray(location.tags || []),
          }))
        : [],
    };

    try {
      const command = new InvokeModelCommand({
        modelId: promptHelperModelId,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: 260,
          temperature: 0.1,
          system: [
            "You compress scene context for anime illustration prompts with strong character-fidelity priority.",
            "Return ONLY valid JSON object with keys: scenePrompt, sceneEnvironment, sceneAction.",
            "Use `context` as highest-priority truth (what is visible now). Use `currentScene` only if context is missing.",
            "Assume the protagonist is on-screen for this frame; choose context that keeps a single visible subject readable.",
            "Choose ONE dominant setting cluster for this frame.",
            "Do not mix indoor and outdoor clusters unless the context explicitly says both are visible in one shot.",
            "Use only visually observable details. Remove pure audio/smell cues.",
            "Translate non-visual sensory cues into visual context only when it is directly inferable; otherwise drop them.",
            "Do not invent canned fallback phrases; only use concrete details supported by the input payload.",
            "Avoid relational wording (for example: together, with someone, with the player). Keep action phrasing for one visible protagonist only.",
            "Prefer one cohesive room description over disconnected prop lists.",
            "Use one consistent moment; avoid contradictory action states (for example sleeping and waking in the same frame).",
            "Drop narrative/meta information: mood labels, directions, goals, future plans, summaries, off-screen events.",
            "Do not include location IDs or abstract tokens.",
            "Each fragment should be 2-6 words and concrete visual language.",
            "sceneEnvironment: 3-6 short visual fragments, comma-separated, no duplicates.",
            "sceneAction: 0-1 short visible protagonist action/pose fragment, comma-separated (e.g., seated by hearth, standing at counter, walking on road).",
            "scenePrompt: concise merge of sceneEnvironment then sceneAction.",
          ].join("\n"),
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: JSON.stringify(sourcePayload),
                },
              ],
            },
          ],
        }),
      });
      const response = await bedrockClient.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      const responseText = (responseBody?.content || [])
        .map((item) => item?.text)
        .filter(Boolean)
        .join("")
        .trim();
      const parsed = safeJsonParse(responseText) || {};
      const aiScenePrompt = normalizePromptFragment(parsed.scenePrompt || "");
      const aiSceneEnvironment = normalizePromptFragment(
        parsed.sceneEnvironment || ""
      );
      const aiSceneAction = normalizePromptFragment(parsed.sceneAction || "");
      if (!aiScenePrompt && !aiSceneEnvironment && !aiSceneAction) {
        return fallback;
      }
      const compact = compactScenePayload({
        scenePrompt: aiScenePrompt || fallback.scenePrompt,
        sceneEnvironment: aiSceneEnvironment || fallback.sceneEnvironment,
        sceneAction: aiSceneAction || fallback.sceneAction,
        maxEnvironment: maxEnvironmentFragments,
        maxAction: maxActionFragments,
      });
      return compact.scenePrompt || compact.sceneEnvironment || compact.sceneAction
        ? compact
        : fallback;
    } catch (error) {
      return fallback;
    }
  };

const createAiCraftIllustrationPrompts = ({
  bedrockClient,
  promptHelperModelId,
  safeJsonParse,
  normalizePromptFragment,
  clipText,
}) =>
  async ({
    character = {},
    scenePrompt = "",
    sceneEnvironment = "",
    sceneAction = "",
    summary = "",
    latest = "",
    recent = "",
    contextMode = "summary+scene",
  }) => {
    const sourcePayload = {
      character: {
        name: character?.name || "",
        identityPrompt: clipText(character?.identityPrompt || "", 350),
        signatureTraits: clipText(character?.signatureTraits || "", 200),
        styleReference: clipText(character?.styleReference || "", 200),
        viewDistance: clipText(character?.viewDistance || "", 80),
        eyeDetails: clipText(character?.eyeDetails || "", 120),
        pose: clipText(character?.pose || "", 120),
      },
      contextMode,
      scene: {
        scenePrompt: clipText(scenePrompt, 500),
        sceneEnvironment: clipText(sceneEnvironment, 500),
        sceneAction: clipText(sceneAction, 300),
      },
      textContext: {
        summary: clipText(summary, 700),
        latest: clipText(latest, 900),
        recent: clipText(recent, 1400),
      },
    };

    try {
      const command = new InvokeModelCommand({
        modelId: promptHelperModelId,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: 360,
          temperature: 0.2,
          system: [
            "You generate concise anime image prompts for a single-character story illustration workflow.",
            "Return ONLY valid JSON with keys: positivePrompt, negativePrompt.",
            "positivePrompt: comma-separated phrases, no sentences, no markdown, no quotes.",
            "negativePrompt: comma-separated phrases, no sentences, no markdown, no quotes.",
            "Prioritize character identity and facial readability.",
            "Character-focused fragments must dominate environment fragments (roughly 2:1 or higher).",
            "If prompt budget is tight, drop environment/background details before any character identity, face, hair, or pose details.",
            "Do not rely on fixed fragment positions; semantically group character identity/facial/pose first and keep environment secondary.",
            "Choose framing based on pose and scene geometry; do not force one shot distance.",
            "When the pose implies full-body posture or furniture contact, prefer framing that keeps torso and limbs visibly continuous.",
            "Use concise coherence cues in positivePrompt: consistent perspective, natural occlusion, anatomically connected body.",
            "Keep one dominant coherent environment cluster; avoid patchwork composition.",
            "Convert non-visual cues into visible cues only when directly inferable from payload, otherwise omit.",
            "Do not hardcode assumptions not present in payload.",
            "Avoid introducing extra characters or companions.",
            "Avoid conflicting scene details.",
            "Include artifact guards in negativePrompt when relevant: cut-off body, missing limbs, fused body with furniture, broken perspective.",
            "Keep both prompts compact and model-friendly.",
          ].join("\n"),
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: JSON.stringify(sourcePayload),
                },
              ],
            },
          ],
        }),
      });
      const response = await bedrockClient.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      const responseText = (responseBody?.content || [])
        .map((item) => item?.text)
        .filter(Boolean)
        .join("")
        .trim();
      if (!responseText) {
        return { positivePrompt: "", negativePrompt: "" };
      }

      const parsed = parsePromptPairResponse({
        responseText,
        safeJsonParse,
        normalizePromptFragment,
      });
      const rebalancedPositivePrompt = rebalanceIllustrationPositivePrompt({
        positivePrompt: parsed.positivePrompt,
        character,
        normalizePromptFragment,
      });
      const rebalancedNegativePrompt = rebalanceIllustrationNegativePrompt({
        negativePrompt: parsed.negativePrompt,
        normalizePromptFragment,
      });
      return {
        positivePrompt: rebalancedPositivePrompt || parsed.positivePrompt,
        negativePrompt: rebalancedNegativePrompt || parsed.negativePrompt,
      };
    } catch (error) {
      return { positivePrompt: "", negativePrompt: "" };
    }
  };

const createAiCraftMusicDirection = ({
  bedrockClient,
  promptHelperModelId,
  safeJsonParse,
  normalizePromptFragment,
  clipText,
}) =>
  async ({
    scene = {},
    summary = "",
    latest = "",
    overridePrompt = "",
  }) => {
    const MUSIC_DIRECTION_MAX_TAGS = 6;
    const MUSIC_DIRECTION_MAX_PROMPT_CHARS = 260;
    const MUSIC_DIRECTION_ALLOWED_ENERGY = new Set(["low", "medium", "high"]);

    const normalizeMusicTags = (value = []) =>
      Array.isArray(value)
        ? value
            .map((item) => normalizePromptFragment(String(item || "")).toLowerCase())
            .filter(Boolean)
            .slice(0, MUSIC_DIRECTION_MAX_TAGS)
        : [];

    const buildMusicPrompt = ({
      basePrompt = "",
      mood = "",
      energy = "",
      tempoBpm = null,
      tags = [],
    }) => {
      const parts = [];
      const normalizedBase = normalizePromptFragment(basePrompt || "")
        .replace(/[.;\s]+$/g, "")
        .trim();
      if (normalizedBase) {
        parts.push(normalizedBase);
      }
      if (!/\binstrumental\b/i.test(normalizedBase)) {
        parts.push("instrumental underscore");
      }
      if (!/\b(no vocals|without vocals|no singing)\b/i.test(normalizedBase)) {
        parts.push("no vocals");
      }
      if (Number.isFinite(Number(tempoBpm))) {
        parts.push(`around ${Math.round(Number(tempoBpm))} BPM`);
      }
      if (mood) parts.push(`${mood} mood`);
      if (MUSIC_DIRECTION_ALLOWED_ENERGY.has(energy)) parts.push(`${energy} energy`);
      const normalizedTags = normalizeMusicTags(tags).filter(
        (tag) => !normalizedBase.toLowerCase().includes(tag)
      );
      if (normalizedTags.length > 0) {
        parts.push(normalizedTags.join(", "));
      }
      return clipText(parts.join(", "), MUSIC_DIRECTION_MAX_PROMPT_CHARS);
    };

    const fallbackPrompt = normalizePromptFragment(
      overridePrompt ||
        [
          "cinematic fantasy ambient score",
          scene?.sceneEnvironment,
          scene?.sceneAction,
        ]
          .filter(Boolean)
          .join(", ")
    );
    const fallback = {
      prompt:
        buildMusicPrompt({
          basePrompt:
            fallbackPrompt || "cinematic fantasy ambience, gentle orchestral movement",
          mood: "neutral",
          energy: "medium",
          tempoBpm: 96,
          tags: [],
        }) || "cinematic fantasy ambience, instrumental underscore, no vocals",
      mood: "neutral",
      energy: "medium",
      tempoBpm: 96,
      tags: [],
      source: overridePrompt ? "manual" : "fallback",
    };

    const sourcePayload = {
      scene: {
        title: clipText(scene?.title || "", 120),
        description: clipText(scene?.description || "", 320),
        prompt: clipText(scene?.prompt || "", 300),
        sceneEnvironment: clipText(scene?.sceneEnvironment || "", 260),
        sceneAction: clipText(scene?.sceneAction || "", 160),
      },
      context: {
        summary: clipText(summary, 500),
        latest: clipText(latest, 700),
      },
      overridePrompt: clipText(overridePrompt || "", 220),
    };

    try {
      const command = new InvokeModelCommand({
        modelId: promptHelperModelId,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: 220,
          temperature: 0.2,
          system: [
            "You output compact soundtrack direction for a story scene.",
            "Return ONLY valid JSON with keys: prompt, mood, energy, tempoBpm, tags.",
            "prompt: one concise text-to-music prompt in English, no markdown.",
            "Write in a compact descriptor style: genre/style + instrumentation + movement/arc + texture.",
            "Keep prompt specific and musical; avoid plot summaries, character names, and dialogue.",
            "Prefer 1-2 coherent style families and 2-4 concrete instruments/timbres.",
            "Include rhythmic feel or tempo intent, and keep it instrumental.",
            "mood: one word (calm, tense, hopeful, melancholic, neutral, etc.).",
            "energy: low, medium, or high.",
            "tempoBpm: integer between 60 and 180.",
            "tags: array of up to 6 short lowercase tags.",
            "If overridePrompt is provided, preserve its intent.",
            "Avoid vocals unless explicitly requested.",
          ].join("\n"),
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: JSON.stringify(sourcePayload),
                },
              ],
            },
          ],
        }),
      });
      const response = await bedrockClient.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      const responseText = (responseBody?.content || [])
        .map((item) => item?.text)
        .filter(Boolean)
        .join("")
        .trim();
      if (!responseText) return fallback;

      const parsed = safeJsonParse(responseText) || {};
      const prompt = normalizePromptFragment(parsed.prompt || "");
      const mood = normalizePromptFragment(parsed.mood || "").toLowerCase();
      const energy = normalizePromptFragment(parsed.energy || "").toLowerCase();
      const parsedTempo = Number(parsed.tempoBpm);
      const tempoBpm =
        Number.isFinite(parsedTempo) && parsedTempo >= 60 && parsedTempo <= 180
          ? Math.round(parsedTempo)
          : fallback.tempoBpm;
      const tags = normalizeMusicTags(parsed.tags);
      const resolvedMood = mood || fallback.mood;
      const resolvedEnergy = MUSIC_DIRECTION_ALLOWED_ENERGY.has(energy)
        ? energy
        : fallback.energy;
      const resolvedPrompt = buildMusicPrompt({
        basePrompt: prompt || fallback.prompt,
        mood: resolvedMood,
        energy: resolvedEnergy,
        tempoBpm,
        tags,
      });

      return {
        prompt: resolvedPrompt || fallback.prompt,
        mood: resolvedMood,
        energy: resolvedEnergy,
        tempoBpm,
        tags,
        source: overridePrompt ? "manual+haiku" : "haiku",
      };
    } catch (error) {
      return fallback;
    }
  };

module.exports = {
  createAiCraftSceneContext,
  createAiCraftIllustrationPrompts,
  createAiCraftMusicDirection,
};
