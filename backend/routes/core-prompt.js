module.exports = (app, deps) => {
  const {
    mediaTable,
    ensurePromptHelperOptions,
    promptHelperDefaults,
    DEFAULT_NEGATIVE_PROMPT,
    promptHelperModelId,
    bedrockClient,
    InvokeModelCommand,
  } = deps;

app.get("/", (req, res) => {
  res.json({ message: "Hello from Express API on AWS Lambda!" });
});

app.get("/health", (req, res) => {
  res.json({ message: `available` });
});

app.get("/hello/:name", (req, res) => {
  res.json({ message: `Hello, ${req.params.name}!` });
});

app.get("/prompt-helper/options", async (req, res) => {
  if (!mediaTable) {
    return res.status(500).json({ message: "MEDIA_TABLE is not set" });
  }
  try {
    const items = await ensurePromptHelperOptions();
    const optionMap = new Map(
      items.map((item) => [item.key || "", item.options || []])
    );
    const getOption = (key) =>
      Array.isArray(optionMap.get(key))
        ? optionMap.get(key)
        : promptHelperDefaults[key] || [];
    res.json({
      backgrounds: getOption("backgrounds"),
      poses: getOption("poses"),
      traits: getOption("traits"),
      faceDetails: getOption("faceDetails"),
      eyeDetails: getOption("eyeDetails"),
      breastSizes: getOption("breastSizes"),
      ears: getOption("ears"),
      tails: getOption("tails"),
      horns: getOption("horns"),
      wings: getOption("wings"),
      hairStyles: getOption("hairStyles"),
      viewDistance: getOption("viewDistance"),
      accessories: getOption("accessories"),
      markings: getOption("markings"),
      outfits: getOption("outfits"),
      styles: getOption("styles"),
      negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to load prompt helper options",
      error: error?.message || String(error),
    });
  }
});

app.post("/bedrock/prompt-helper", async (req, res) => {
  const background = req.body?.background?.trim();
  const character = req.body?.character?.trim();
  const pose = req.body?.pose?.trim();
  const signatureTraits = req.body?.signatureTraits?.trim();
  const faceDetails = req.body?.faceDetails?.trim();
  const eyeDetails = req.body?.eyeDetails?.trim();
  const breastSize = req.body?.breastSize?.trim();
  const ears = req.body?.ears?.trim();
  const tails = req.body?.tails?.trim();
  const horns = req.body?.horns?.trim();
  const wings = req.body?.wings?.trim();
  const hairStyles = req.body?.hairStyles?.trim();
  const viewDistance = req.body?.viewDistance?.trim();
  const accessories = req.body?.accessories?.trim();
  const markings = req.body?.markings?.trim();
  const outfitMaterials = req.body?.outfitMaterials?.trim();
  const styleReference = req.body?.styleReference?.trim();

  const hasSelection = Boolean(
      background ||
      character ||
      pose ||
      signatureTraits ||
      faceDetails ||
      eyeDetails ||
      breastSize ||
      ears ||
      tails ||
      horns ||
      wings ||
      hairStyles ||
      viewDistance ||
      accessories ||
      markings ||
      outfitMaterials ||
      styleReference
  );
  if (!hasSelection) {
    return res.status(400).json({
      message: "At least one selection is required.",
    });
  }

  const selectionLines = [
    background ? `Background: ${background}` : null,
    character ? `Character: ${character}` : null,
    outfitMaterials ? `Outfit/materials: ${outfitMaterials}` : null,
    pose ? `Pose: ${pose}` : null,
    signatureTraits ? `Signature traits: ${signatureTraits}` : null,
    faceDetails ? `Face details: ${faceDetails}` : null,
    eyeDetails ? `Eye details: ${eyeDetails}` : null,
    breastSize ? `Breast size: ${breastSize}` : null,
    ears ? `Ears: ${ears}` : null,
    tails ? `Tail: ${tails}` : null,
    horns ? `Horns: ${horns}` : null,
    wings ? `Wings: ${wings}` : null,
    hairStyles ? `Hair style: ${hairStyles}` : null,
    viewDistance ? `View distance: ${viewDistance}` : null,
    accessories ? `Accessories: ${accessories}` : null,
    markings ? `Markings: ${markings}` : null,
    styleReference ? `Style reference: ${styleReference}` : null,
  ].filter(Boolean);

  const userPrompt = [
    "Create two outputs for AI image generation.",
    "1) A compact positive prompt under 650 characters.",
    "2) A concise negative prompt under 200 characters.",
    "Avoid bullet lists or quotes. Use comma-separated keywords/phrases.",
    "Depict a single character only; do not introduce additional characters or companions.",
    "Treat all provided traits as belonging to the same single character.",
    "Use short, punchy phrases; avoid full sentences.",
    "Do not include the model preprompt tokens: masterpiece, high score, great score, absurdres.",
    "Do not include the model negative preprompt tokens: lowres, bad anatomy, bad hands, text, error, missing finger, extra digits, fewer digits, cropped, worst quality, low quality, low score, bad score, average score, signature, watermark, username, blurry, bad_fingers, extra_fingers, mutated_fingers, mutated_hands, six_fingers.",
    "Do not use bracketed placeholders or section headers.",
    "Start with: 1girl, solo, then outfit/materials (if provided), then the character name and core identity.",
    "Place outfit/materials immediately after 1girl, solo and before the character name.",
    "Include these phrases verbatim early in the prompt: anime cinematic illustration; faithful anime character design; accurate facial features; consistent identity.",
    "Follow this order of information after the opening identity:",
    "camera & framing, character placement, pose & body dynamics, hair/fabric motion, action/interaction, effects (controlled), background type, environment details, depth/lighting, art quality & style, image clarity & coherence.",
    "For named characters, explicitly call out facial details first (eye color/shape, face structure, expression) and hair color/style.",
    "Use the following selections when present:",
    selectionLines.join("\n"),
    "Keep it as a single comma-separated line with those sections implied by order.",
    "Return in this exact format:",
    "POSITIVE: <text>",
    "NEGATIVE: <text>",
    
  ].join("\n");

  try {
    const command = new InvokeModelCommand({
      modelId: promptHelperModelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 300,
        temperature: 0.2,
        system:
          "You write concise, expressive positive prompts for AI image generation.",
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: userPrompt }],
          },
        ],
      }),
    });
    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(
      new TextDecoder().decode(response.body)
    );
    const responseText = (responseBody?.content || [])
      .map((item) => item?.text)
      .filter(Boolean)
      .join("")
      .trim();

    if (!responseText) {
      return res.status(500).json({
        message: "Prompt helper returned an empty response.",
        response: responseBody,
      });
    }

    const positiveMatch = responseText.match(/POSITIVE:\s*(.*)/i);
    const negativeMatch = responseText.match(/NEGATIVE:\s*(.*)/i);
    const positivePrompt = positiveMatch?.[1]?.trim() || "";
    const negativePrompt = negativeMatch?.[1]?.trim() || "";
    const singleCharacterNegative =
      "multiple characters, crowd, group, duo, twins, background characters, extra people, two people";

    if (!positivePrompt) {
      return res.status(500).json({
        message: "Prompt helper did not return a positive prompt.",
        response: responseBody,
      });
    }
    res.json({
      prompt: positivePrompt,
      negativePrompt: [
        negativePrompt,
        singleCharacterNegative,
      ]
        .filter(Boolean)
        .join(", "),
      modelId: promptHelperModelId,
    });
  } catch (error) {
    console.error("Prompt helper error details:", {
      name: error?.name,
      message: error?.message,
      metadata: error?.$metadata,
      cause: error?.cause,
    });
    res.status(500).json({
      message: "Prompt helper request failed",
      error: error?.message || String(error),
    });
  }
});

};
