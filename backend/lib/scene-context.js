const { InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");

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
            "Do not invent canned fallback phrases; only use concrete details supported by the input payload.",
            "Avoid relational wording (for example: together, with someone, with the player). Keep action phrasing for one visible protagonist only.",
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

module.exports = {
  createAiCraftSceneContext,
};
