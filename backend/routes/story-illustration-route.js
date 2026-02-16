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
    sanitizeScenePrompt,
    buildStoryIllustrationPrompt,
    DEFAULT_NEGATIVE_PROMPT,
    clampPromptTokens,
    replicateModelConfig,
    buildSeedList,
    runReplicateWithRetry,
    getReplicateOutputUrl,
    fetchImageBuffer,
    buildUserPrefix,
    PutObjectCommand,
    MAX_REPLICATE_PROMPT_TOKENS,
  } = deps;

app.post("/story/sessions/:id/illustrations", async (req, res) => {
  const userId = req.user?.sub;
  const sessionId = req.params.id;
  let sceneId = req.body?.sceneId;
  const forceCurrent = Boolean(req.body?.forceCurrent);
  const regenerate = Boolean(req.body?.regenerate);
  const contextMode = req.body?.contextMode || "summary+scene";
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
      return res.json({
        sceneId,
        imageKey: sceneItem.imageKey,
        imageUrl: url,
        scene: {
          sceneId: sceneItem.sceneId,
          title: sceneItem.title,
          description: sceneItem.description,
          prompt: sceneItem.prompt,
          sceneEnvironment: sceneItem.sceneEnvironment,
          sceneAction: sceneItem.sceneAction,
          status: sceneItem.status,
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
    let cleanScenePrompt = sanitizeScenePrompt(
      compactSceneForPrompt.scenePrompt || sceneItem.prompt || ""
    );
    if (cleanScenePrompt) {
      cleanScenePrompt = cleanScenePrompt
        .replace(/frieren/gi, "")
        .replace(/elf/gi, "")
        .replace(/mage/gi, "")
        .replace(/academy uniform/gi, "")
        .replace(/emerald eyes/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();
    }

    const protagonistLine = sessionItem.protagonistPrompt?.includes(
      sessionItem.protagonistName
    )
      ? sessionItem.protagonistPrompt
      : `${sessionItem.protagonistName}, ${sessionItem.protagonistPrompt}`;

    const identityBlock =
      resolvedCharacter?.identityPrompt ||
      sessionItem.protagonistPrompt ||
      protagonistLine;

    const positivePrompt = buildStoryIllustrationPrompt({
      character: resolvedCharacter,
      sessionItem,
      cleanScenePrompt,
      sceneEnvironment:
        compactSceneForPrompt.sceneEnvironment || sceneItem.sceneEnvironment || "",
      sceneAction: compactSceneForPrompt.sceneAction || sceneItem.sceneAction || "",
      contextMode,
    });

    const negativePrompt =
      resolvedCharacter?.storyNegativePrompt ||
      sessionItem.negativePrompt ||
      DEFAULT_NEGATIVE_PROMPT;
    const trimmedPositivePrompt = clampPromptTokens(positivePrompt);
    const trimmedNegativePrompt = clampPromptTokens(negativePrompt);
    const promptWasTrimmed = trimmedPositivePrompt.trim() !== positivePrompt.trim();
    const negativeWasTrimmed =
      trimmedNegativePrompt.trim() !== negativePrompt.trim();

    const modelConfig = replicateModelConfig.animagine;
    const [seed] = buildSeedList(1);
    const input = modelConfig.buildInput({
      prompt: trimmedPositivePrompt,
      negativePrompt: trimmedNegativePrompt,
      width: 1024,
      height: 1024,
      numOutputs: 1,
      seed,
      scheduler: "Euler a",
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
};
