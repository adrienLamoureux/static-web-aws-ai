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
  }) => {
    const fallback = compactScenePayload({
      scenePrompt,
      sceneEnvironment,
      sceneAction,
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
      return {
        positivePrompt: parsed.positivePrompt,
        negativePrompt: parsed.negativePrompt,
      };
    } catch (error) {
      return { positivePrompt: "", negativePrompt: "" };
    }
  };

module.exports = {
  createAiCraftSceneContext,
  createAiCraftIllustrationPrompts,
};
