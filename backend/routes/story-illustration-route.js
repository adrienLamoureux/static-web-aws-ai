module.exports = (app, deps) => {
  const {
    mediaTable,
    getItem,
    buildMediaPk,
    buildStorySessionSk,
    buildStorySceneSk,
    queryBySkPrefix,
    storyMessagePrefix,
    buildSceneFragmentsFromStoryState,
    dedupeFragments,
    aiCraftSceneContext,
    normalizePromptFragment,
    dynamoClient,
    PutCommand,
    getSignedUrl,
    s3Client,
    GetObjectCommand,
    ensureStoryCharacters,
    buildStoryCharacterPk,
    buildStoryCharacterSk,
    clampPromptTokens,
    replicateModelConfig,
    replicateVideoConfig,
    replicateClient,
    buildSeedList,
    runReplicateWithRetry,
    getReplicateOutputUrl,
    fetchImageBuffer,
    fetchS3ImageBuffer,
    buildUserPrefix,
    PutObjectCommand,
    MAX_REPLICATE_PROMPT_TOKENS,
    aiCraftIllustrationPrompts,
  } = deps;

  const DEFAULT_STORY_ILLUSTRATION_MODEL = "wai-nsfw-illustrious-v11";
  const STORY_ILLUSTRATION_MODEL_KEYS = new Set([
    "animagine",
    "wai-nsfw-illustrious-v11",
  ]);
  const STORY_ANIMATION_MODEL_KEY = "wan-2.2-i2v-fast";
  const DEFAULT_STORY_ANIMATION_PROMPT = "A lot of movements";

  const signSceneVideoUrl = async (bucket, sceneItem = {}) => {
    if (!sceneItem.videoKey) return "";
    try {
      return await getSignedUrl(
        s3Client,
        new GetObjectCommand({
          Bucket: bucket,
          Key: sceneItem.videoKey,
        }),
        { expiresIn: 900 }
      );
    } catch (error) {
      return "";
    }
  };

  const buildStorySceneVideoKey = (userId = "", sessionId = "", sceneId = "") =>
    `${buildUserPrefix(userId)}stories/${sessionId}/scenes/${sceneId}.mp4`;

  const buildDataUrl = ({ buffer, contentType }) =>
    `data:${contentType || "image/png"};base64,${buffer.toString("base64")}`;

  const persistStorySceneVideo = async ({
    bucket,
    userId,
    sessionId,
    sceneId,
    sceneItem,
    prediction,
    prompt,
  }) => {
    const outputUrl = getReplicateOutputUrl(prediction?.output);
    if (!outputUrl) {
      throw new Error("No video returned from Replicate");
    }
    const { buffer, contentType } = await fetchImageBuffer(outputUrl);
    const videoKey = buildStorySceneVideoKey(userId, sessionId, sceneId);
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: videoKey,
        Body: buffer,
        ContentType: contentType || "video/mp4",
      })
    );
    const updatedScene = {
      ...sceneItem,
      videoKey,
      videoStatus: "succeeded",
      videoPredictionId: prediction?.id || sceneItem.videoPredictionId || "",
      videoPrompt: prompt || sceneItem.videoPrompt || "",
      videoUpdatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await dynamoClient.send(
      new PutCommand({
        TableName: mediaTable,
        Item: updatedScene,
      })
    );
    const videoUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: videoKey,
      }),
      { expiresIn: 900 }
    );
    return { updatedScene, videoKey, videoUrl };
  };

app.post("/story/sessions/:id/illustrations", async (req, res) => {
  const userId = req.user?.sub;
  const sessionId = req.params.id;
  let sceneId = req.body?.sceneId;
  const forceCurrent = Boolean(req.body?.forceCurrent);
  const regenerate = Boolean(req.body?.regenerate);
  const contextMode = req.body?.contextMode || "summary+scene";
  const requestedModelKey = req.body?.model || DEFAULT_STORY_ILLUSTRATION_MODEL;
  const bucket = process.env.MEDIA_BUCKET;
  const apiToken = process.env.REPLICATE_API_TOKEN;
  const debug = req.query?.debug === "true";
  if (!mediaTable) {
    return res.status(500).json({ message: "MEDIA_TABLE is not set" });
  }
  if (!bucket) {
    return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
  }
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (!apiToken) {
    return res
      .status(500)
      .json({ message: "REPLICATE_API_TOKEN must be set" });
  }
  if (!sessionId || (!sceneId && !forceCurrent)) {
    return res
      .status(400)
      .json({ message: "sessionId and sceneId are required unless forceCurrent is true" });
  }
  if (!STORY_ILLUSTRATION_MODEL_KEYS.has(requestedModelKey)) {
    return res.status(400).json({
      message: `Unsupported model selection: ${requestedModelKey}`,
      allowed: Array.from(STORY_ILLUSTRATION_MODEL_KEYS),
    });
  }

  try {
    const sessionItem = await getItem({
      pk: buildMediaPk(userId),
      sk: buildStorySessionSk(sessionId),
    });
    if (!sessionItem) {
      return res.status(404).json({ message: "Session not found" });
    }

    let sceneItem = null;
    if (sceneId) {
      sceneItem = await getItem({
        pk: buildMediaPk(userId),
        sk: buildStorySceneSk(sessionId, sceneId),
      });
    }
    if (!sceneItem && forceCurrent) {
      const recentMessages = await queryBySkPrefix({
        pk: buildMediaPk(userId),
        skPrefix: storyMessagePrefix(sessionId),
        limit: 6,
        scanForward: false,
      });
      const latestAssistant = recentMessages.find(
        (message) => message.role === "assistant"
      );
      const stateScene = buildSceneFragmentsFromStoryState(
        sessionItem.storyState || {},
        sessionItem.worldPrompt || ""
      );
      const mergedEnvironment = dedupeFragments([...stateScene.environment]);
      const mergedAction = dedupeFragments([...stateScene.action]);
      const compactCurrentScene = await aiCraftSceneContext({
        scenePrompt: dedupeFragments([...mergedEnvironment, ...mergedAction]).join(", "),
        sceneEnvironment: mergedEnvironment.join(", "),
        sceneAction: mergedAction.join(", "),
        contextText: latestAssistant?.content || "",
        storyState: sessionItem.storyState || {},
        lorebook: sessionItem.lorebook || {},
      });
      sceneId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      sceneItem = {
        pk: buildMediaPk(userId),
        sk: buildStorySceneSk(sessionId, sceneId),
        type: "STORY_SCENE",
        sessionId,
        sceneId,
        title: "Current moment",
        description:
          normalizePromptFragment(latestAssistant?.content || "") ||
          `Current scene with ${sessionItem.protagonistName}.`,
        prompt: compactCurrentScene.scenePrompt,
        sceneEnvironment: compactCurrentScene.sceneEnvironment,
        sceneAction: compactCurrentScene.sceneAction,
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      await dynamoClient.send(
        new PutCommand({
          TableName: mediaTable,
          Item: sceneItem,
        })
      );
      const updatedSession = {
        ...sessionItem,
        sceneCount: (sessionItem.sceneCount || 0) + 1,
        updatedAt: new Date().toISOString(),
      };
      await dynamoClient.send(
        new PutCommand({
          TableName: mediaTable,
          Item: updatedSession,
        })
      );
      sessionItem.sceneCount = updatedSession.sceneCount;
      sessionItem.updatedAt = updatedSession.updatedAt;
    }
    if (!sceneItem) {
      return res.status(404).json({ message: "Scene not found" });
    }
    if (sceneItem.status === "completed" && sceneItem.imageKey && !regenerate) {
      const url = await getSignedUrl(
        s3Client,
        new GetObjectCommand({
          Bucket: bucket,
          Key: sceneItem.imageKey,
        }),
        { expiresIn: 900 }
      );
      const videoUrl = await signSceneVideoUrl(bucket, sceneItem);
      return res.json({
        sceneId,
        imageKey: sceneItem.imageKey,
        imageUrl: url,
        videoKey: sceneItem.videoKey || "",
        videoUrl,
        scene: {
          sceneId: sceneItem.sceneId,
          title: sceneItem.title,
          description: sceneItem.description,
          prompt: sceneItem.prompt,
          sceneEnvironment: sceneItem.sceneEnvironment,
          sceneAction: sceneItem.sceneAction,
          status: sceneItem.status,
          videoKey: sceneItem.videoKey || "",
          videoUrl,
          videoStatus: sceneItem.videoStatus || "",
          videoPredictionId: sceneItem.videoPredictionId || "",
          videoPrompt: sceneItem.videoPrompt || "",
          createdAt: sceneItem.createdAt,
        },
      });
    }

    const characters = await ensureStoryCharacters();
    const characterMap = new Map(
      characters.map((character) => [character.id, character])
    );
    const resolvedProtagonistId =
      sessionItem.protagonistId ||
      (sessionItem.protagonistName?.toLowerCase().includes("frieren")
        ? "frieren"
        : "");
    const characterItem = resolvedProtagonistId
      ? await getItem({
          pk: buildStoryCharacterPk(),
          sk: buildStoryCharacterSk(resolvedProtagonistId),
        })
      : null;
    const fallbackCharacter =
      characterMap.get(resolvedProtagonistId || "") || null;
    const resolvedCharacter =
      characterItem || fallbackCharacter || characters[0] || null;

    if (
      resolvedCharacter?.identityPrompt &&
      sessionItem.protagonistPrompt !== resolvedCharacter.identityPrompt
    ) {
      const updatedSession = {
        ...sessionItem,
        protagonistPrompt: resolvedCharacter.identityPrompt,
        protagonistName:
          resolvedCharacter.name || sessionItem.protagonistName,
        protagonistId: resolvedProtagonistId || resolvedCharacter.id || "",
        updatedAt: new Date().toISOString(),
      };
      await dynamoClient.send(
        new PutCommand({
          TableName: mediaTable,
          Item: updatedSession,
        })
      );
      sessionItem.protagonistPrompt = updatedSession.protagonistPrompt;
      sessionItem.protagonistName = updatedSession.protagonistName;
    }

    const recentMessages = await queryBySkPrefix({
      pk: buildMediaPk(userId),
      skPrefix: storyMessagePrefix(sessionId),
      limit: 6,
      scanForward: false,
    });
    const orderedRecent = recentMessages.slice().reverse();
    const lastAssistant = recentMessages.find(
      (message) => message.role === "assistant"
    );
    const contextLine = lastAssistant?.content
      ? normalizePromptFragment(lastAssistant.content)
      : "";
    const summaryLine = sessionItem.summary
      ? normalizePromptFragment(sessionItem.summary)
      : "";
    const recentTranscript = orderedRecent
      .map((message) => {
        const label = message.role === "user" ? "Player" : "Narrator";
        return `${label}: ${normalizePromptFragment(message.content || "")}`;
      })
      .filter(Boolean)
      .join(" ");
    const compactSceneForPrompt = await aiCraftSceneContext({
      scenePrompt: sceneItem.prompt || "",
      sceneEnvironment: sceneItem.sceneEnvironment || "",
      sceneAction: sceneItem.sceneAction || "",
      contextText: contextLine || recentTranscript,
      storyState: sessionItem.storyState || {},
      lorebook: sessionItem.lorebook || {},
    });
    const cleanScenePrompt =
      compactSceneForPrompt.scenePrompt || sceneItem.prompt || "";

    const protagonistLine = sessionItem.protagonistPrompt?.includes(
      sessionItem.protagonistName
    )
      ? sessionItem.protagonistPrompt
      : `${sessionItem.protagonistName}, ${sessionItem.protagonistPrompt}`;

    const identityBlock =
      resolvedCharacter?.identityPrompt ||
      sessionItem.protagonistPrompt ||
      protagonistLine;

    const draftedPrompts = await aiCraftIllustrationPrompts({
      character: {
        name: resolvedCharacter?.name || sessionItem.protagonistName || "",
        identityPrompt: identityBlock,
        signatureTraits: resolvedCharacter?.signatureTraits || "",
        styleReference:
          resolvedCharacter?.styleReference || sessionItem.stylePrompt || "",
        viewDistance: resolvedCharacter?.viewDistance || "",
        eyeDetails: resolvedCharacter?.eyeDetails || "",
        pose: resolvedCharacter?.pose || "",
      },
      scenePrompt: cleanScenePrompt,
      sceneEnvironment:
        compactSceneForPrompt.sceneEnvironment || sceneItem.sceneEnvironment || "",
      sceneAction: compactSceneForPrompt.sceneAction || sceneItem.sceneAction || "",
      summary: summaryLine,
      latest: contextLine,
      recent: recentTranscript,
      contextMode,
    });
    const positivePrompt = draftedPrompts?.positivePrompt || "";
    const negativePrompt = draftedPrompts?.negativePrompt || "";
    if (!positivePrompt || !negativePrompt) {
      return res.status(500).json({
        message: "Failed to generate prompts from Haiku.",
      });
    }
    const trimmedPositivePrompt = clampPromptTokens(positivePrompt);
    const trimmedNegativePrompt = clampPromptTokens(negativePrompt);
    const promptWasTrimmed = trimmedPositivePrompt.trim() !== positivePrompt.trim();
    const negativeWasTrimmed =
      trimmedNegativePrompt.trim() !== negativePrompt.trim();

    const modelConfig = replicateModelConfig[requestedModelKey];
    if (!modelConfig?.modelId) {
      return res.status(500).json({
        message: `Replicate modelId is not configured for ${requestedModelKey}`,
      });
    }
    const sizeAllowed = modelConfig.sizes?.some(
      (size) => size.width === 1024 && size.height === 1024
    );
    if (!sizeAllowed) {
      return res.status(500).json({
        message: `${requestedModelKey} does not support 1024x1024 for story illustrations`,
      });
    }
    const defaultScheduler = modelConfig.schedulers?.[0];
    const [seed] = buildSeedList(1);
    const input = modelConfig.buildInput({
      prompt: trimmedPositivePrompt,
      negativePrompt: trimmedNegativePrompt,
      width: 1024,
      height: 1024,
      numOutputs: 1,
      seed,
      scheduler: defaultScheduler,
    });
    const output = await runReplicateWithRetry(modelConfig.modelId, input, 3);
    const outputItems = Array.isArray(output) ? output : [output];
    const imageUrl = outputItems.map(getReplicateOutputUrl).find(Boolean);
    if (!imageUrl) {
      return res.status(500).json({ message: "No image returned from Replicate" });
    }

    const { buffer, contentType } = await fetchImageBuffer(imageUrl);
    const imageKey =
      sceneItem.imageKey ||
      `${buildUserPrefix(userId)}stories/${sessionId}/scenes/${sceneId}.png`;
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: imageKey,
        Body: buffer,
        ContentType: contentType || "image/png",
      })
    );

    const updatedScene = {
      ...sceneItem,
      prompt: compactSceneForPrompt.scenePrompt || sceneItem.prompt,
      sceneEnvironment:
        compactSceneForPrompt.sceneEnvironment || sceneItem.sceneEnvironment,
      sceneAction: compactSceneForPrompt.sceneAction || sceneItem.sceneAction,
      imageKey,
      status: "completed",
      promptPositive: trimmedPositivePrompt,
      promptNegative: trimmedNegativePrompt,
      videoKey: "",
      videoStatus: "",
      videoPredictionId: "",
      videoPrompt: "",
      videoUpdatedAt: "",
      updatedAt: new Date().toISOString(),
    };
    await dynamoClient.send(
      new PutCommand({
        TableName: mediaTable,
        Item: updatedScene,
      })
    );

    const signedUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: imageKey,
      }),
      { expiresIn: 900 }
    );

    res.json({
      sceneId,
      imageKey,
      imageUrl: signedUrl,
      scene: {
        sceneId: updatedScene.sceneId,
        title: updatedScene.title,
        description: updatedScene.description,
        prompt: updatedScene.prompt,
        sceneEnvironment: updatedScene.sceneEnvironment,
        sceneAction: updatedScene.sceneAction,
        status: updatedScene.status,
        videoKey: updatedScene.videoKey || "",
        videoUrl: "",
        videoStatus: updatedScene.videoStatus || "",
        videoPredictionId: updatedScene.videoPredictionId || "",
        videoPrompt: updatedScene.videoPrompt || "",
        createdAt: updatedScene.createdAt,
      },
      ...(debug
        ? {
            prompt: {
              positive: trimmedPositivePrompt,
              negative: trimmedNegativePrompt,
            },
            identity: identityBlock,
            context: {
              mode: contextMode,
              summary: summaryLine,
              latest: contextLine,
              recent: recentTranscript,
              scene: cleanScenePrompt,
              sceneEnvironment: updatedScene.sceneEnvironment || "",
              sceneAction: updatedScene.sceneAction || "",
            },
            promptPattern: [
              "character (1girl, solo + name + recognizable)",
              "shot range",
              "focus/action",
              "subject framing/facial fidelity",
              "environment/background",
              "visual/style",
            ],
            replicate: {
              modelKey: requestedModelKey,
              modelId: modelConfig.modelId,
              input,
              ...(promptWasTrimmed || negativeWasTrimmed
                ? {
                    notice: [
                      promptWasTrimmed
                        ? `Positive prompt trimmed to ${MAX_REPLICATE_PROMPT_TOKENS} tokens for Replicate.`
                        : null,
                      negativeWasTrimmed
                        ? `Negative prompt trimmed to ${MAX_REPLICATE_PROMPT_TOKENS} tokens for Replicate.`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" "),
                  }
                : {}),
            },
          }
        : {}),
    });
  } catch (error) {
    console.error("Story illustration error:", {
      message: error?.message || String(error),
    });
    res.status(500).json({
      message: "Failed to generate illustration",
      error: error?.message || String(error),
    });
  }
});

app.post("/story/sessions/:id/scenes/:sceneId/animation", async (req, res) => {
  const userId = req.user?.sub;
  const sessionId = req.params.id;
  const sceneId = req.params.sceneId;
  const bucket = process.env.MEDIA_BUCKET;
  const apiToken = process.env.REPLICATE_API_TOKEN;
  const prompt =
    req.body?.prompt?.trim() || DEFAULT_STORY_ANIMATION_PROMPT;

  if (!mediaTable) {
    return res.status(500).json({ message: "MEDIA_TABLE is not set" });
  }
  if (!bucket) {
    return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
  }
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (!apiToken) {
    return res
      .status(500)
      .json({ message: "REPLICATE_API_TOKEN must be set" });
  }
  if (!sessionId || !sceneId) {
    return res
      .status(400)
      .json({ message: "sessionId and sceneId are required" });
  }

  const videoModelConfig = replicateVideoConfig[STORY_ANIMATION_MODEL_KEY];
  if (!videoModelConfig?.modelId) {
    return res.status(500).json({
      message: `Replicate modelId is not configured for ${STORY_ANIMATION_MODEL_KEY}`,
    });
  }

  try {
    const sessionItem = await getItem({
      pk: buildMediaPk(userId),
      sk: buildStorySessionSk(sessionId),
    });
    if (!sessionItem) {
      return res.status(404).json({ message: "Session not found" });
    }
    const sceneItem = await getItem({
      pk: buildMediaPk(userId),
      sk: buildStorySceneSk(sessionId, sceneId),
    });
    if (!sceneItem) {
      return res.status(404).json({ message: "Scene not found" });
    }
    if (!sceneItem.imageKey) {
      return res.status(400).json({
        message: "Scene illustration is required before animation",
      });
    }

    const sourceImage = await fetchS3ImageBuffer(bucket, sceneItem.imageKey);
    const prediction = await replicateClient.predictions.create(
      {
        model: videoModelConfig.modelId,
        input: videoModelConfig.buildInput({
          imageUrl: buildDataUrl(sourceImage),
          prompt,
        }),
      },
      {
        headers: {
          Prefer: "wait=60",
          "Cancel-After": "15m",
        },
      }
    );
    if (!prediction) {
      return res.status(500).json({
        message: "No prediction returned from Replicate",
      });
    }

    if (prediction.status === "succeeded") {
      const { videoKey, videoUrl } = await persistStorySceneVideo({
        bucket,
        userId,
        sessionId,
        sceneId,
        sceneItem,
        prediction,
        prompt,
      });
      return res.json({
        sceneId,
        modelId: videoModelConfig.modelId,
        predictionId: prediction.id,
        status: "succeeded",
        prompt,
        videoKey,
        videoUrl,
      });
    }

    const updatedScene = {
      ...sceneItem,
      videoKey: "",
      videoStatus: prediction.status || "starting",
      videoPredictionId: prediction.id || "",
      videoPrompt: prompt,
      videoUpdatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await dynamoClient.send(
      new PutCommand({
        TableName: mediaTable,
        Item: updatedScene,
      })
    );

    return res.json({
      sceneId,
      modelId: videoModelConfig.modelId,
      predictionId: prediction.id,
      status: prediction.status || "starting",
      prompt,
    });
  } catch (error) {
    console.error("Story animation start error:", {
      message: error?.message || String(error),
    });
    return res.status(500).json({
      message: "Failed to start scene animation",
      error: error?.message || String(error),
    });
  }
});

app.get("/story/sessions/:id/scenes/:sceneId/animation", async (req, res) => {
  const userId = req.user?.sub;
  const sessionId = req.params.id;
  const sceneId = req.params.sceneId;
  const predictionId = req.query?.predictionId;
  const bucket = process.env.MEDIA_BUCKET;
  const apiToken = process.env.REPLICATE_API_TOKEN;

  if (!mediaTable) {
    return res.status(500).json({ message: "MEDIA_TABLE is not set" });
  }
  if (!bucket) {
    return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
  }
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (!apiToken) {
    return res
      .status(500)
      .json({ message: "REPLICATE_API_TOKEN must be set" });
  }
  if (!sessionId || !sceneId) {
    return res
      .status(400)
      .json({ message: "sessionId and sceneId are required" });
  }

  try {
    const sessionItem = await getItem({
      pk: buildMediaPk(userId),
      sk: buildStorySessionSk(sessionId),
    });
    if (!sessionItem) {
      return res.status(404).json({ message: "Session not found" });
    }
    const sceneItem = await getItem({
      pk: buildMediaPk(userId),
      sk: buildStorySceneSk(sessionId, sceneId),
    });
    if (!sceneItem) {
      return res.status(404).json({ message: "Scene not found" });
    }
    const resolvedPredictionId = predictionId || sceneItem.videoPredictionId;
    if (!resolvedPredictionId) {
      const existingVideoUrl = await signSceneVideoUrl(bucket, sceneItem);
      return res.json({
        sceneId,
        status: sceneItem.videoStatus || "",
        predictionId: "",
        prompt: sceneItem.videoPrompt || "",
        videoKey: sceneItem.videoKey || "",
        videoUrl: existingVideoUrl,
      });
    }
    const prediction = await replicateClient.predictions.get(
      resolvedPredictionId
    );
    if (!prediction) {
      return res.status(500).json({
        message: "Prediction not found",
      });
    }

    if (prediction.status !== "succeeded") {
      const updatedScene = {
        ...sceneItem,
        videoStatus: prediction.status || sceneItem.videoStatus || "",
        videoPredictionId:
          resolvedPredictionId || sceneItem.videoPredictionId || "",
        videoUpdatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await dynamoClient.send(
        new PutCommand({
          TableName: mediaTable,
          Item: updatedScene,
        })
      );
      return res.json({
        sceneId,
        status: prediction.status || "",
        predictionId: resolvedPredictionId,
        prompt: sceneItem.videoPrompt || "",
        videoKey: sceneItem.videoKey || "",
        videoUrl: "",
      });
    }

    const { videoKey, videoUrl } = await persistStorySceneVideo({
      bucket,
      userId,
      sessionId,
      sceneId,
      sceneItem,
      prediction,
      prompt: sceneItem.videoPrompt || DEFAULT_STORY_ANIMATION_PROMPT,
    });

    return res.json({
      sceneId,
      status: "succeeded",
      predictionId: resolvedPredictionId,
      prompt: sceneItem.videoPrompt || DEFAULT_STORY_ANIMATION_PROMPT,
      videoKey,
      videoUrl,
    });
  } catch (error) {
    console.error("Story animation status error:", {
      message: error?.message || String(error),
    });
    return res.status(500).json({
      message: "Failed to get scene animation status",
      error: error?.message || String(error),
    });
  }
});
};
