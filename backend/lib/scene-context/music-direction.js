const { InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");

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

module.exports = { createAiCraftMusicDirection };
