const { InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const {
  parsePromptPairResponse,
  rebalanceIllustrationPositivePrompt,
  rebalanceIllustrationNegativePrompt,
} = require("./shared");

const createAiCraftIllustrationPrompts =
  ({ bedrockClient, promptHelperModelId, safeJsonParse, normalizePromptFragment, clipText }) =>
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

module.exports = { createAiCraftIllustrationPrompts };
