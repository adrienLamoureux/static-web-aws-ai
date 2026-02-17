module.exports = (app, deps) => {
  const {
    mediaTable,
    ensureStoryPresets,
    ensureStoryCharacters,
    queryBySkPrefix,
    buildMediaPk,
    storyPresets,
    buildCharacterPrompt,
    resolveStoryLorebook,
    buildInitialStoryState,
    buildStorySessionSk,
    buildStoryMessageSk,
    buildStorySceneSk,
    dynamoClient,
    PutCommand,
    getItem,
    storyMessagePrefix,
    storyScenePrefix,
    getSignedUrl,
    s3Client,
    GetObjectCommand,
    DeleteCommand,
    buildUserPrefix,
    deleteS3ObjectsByPrefix,
  } = deps;

  const toTimestamp = (value = "") => {
    const parsed = Date.parse(value || "");
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  const sortSessionsByRecent = (items = []) =>
    [...items].sort(
      (left, right) =>
        toTimestamp(right.updatedAt || right.createdAt) -
        toTimestamp(left.updatedAt || left.createdAt)
    );

  const resolveSessionId = (item = {}) => {
    if (item.sessionId) return item.sessionId;
    if (typeof item.sk === "string" && item.sk.startsWith("SESSION#")) {
      return item.sk.slice("SESSION#".length);
    }
    return "";
  };

  const normalizeSessionItem = (item = {}) => ({
    ...item,
    sessionId: resolveSessionId(item),
  });

  const buildSessionResponse = (item = {}) => ({
    id: resolveSessionId(item),
    title: item.title,
    presetId: item.presetId,
    protagonistName: item.protagonistName,
    synopsis: item.synopsis,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    turnCount: item.turnCount || 0,
    sceneCount: item.sceneCount || 0,
  });

  const deleteSessionCascade = async ({
    userId,
    sessionId,
    mediaTableName,
    mediaBucket,
  }) => {
    const messages = await queryBySkPrefix({
      pk: buildMediaPk(userId),
      skPrefix: storyMessagePrefix(sessionId),
      limit: 200,
      scanForward: true,
    });
    const scenes = await queryBySkPrefix({
      pk: buildMediaPk(userId),
      skPrefix: storyScenePrefix(sessionId),
      limit: 200,
      scanForward: true,
    });

    const deleteItems = [
      { pk: buildMediaPk(userId), sk: buildStorySessionSk(sessionId) },
      ...messages.map((item) => ({ pk: item.pk, sk: item.sk })),
      ...scenes.map((item) => ({ pk: item.pk, sk: item.sk })),
    ];

    await Promise.all(
      deleteItems.map((item) =>
        dynamoClient.send(
          new DeleteCommand({
            TableName: mediaTableName,
            Key: item,
          })
        )
      )
    );

    if (mediaBucket) {
      const prefix = `${buildUserPrefix(userId)}stories/${sessionId}/`;
      try {
        await deleteS3ObjectsByPrefix(mediaBucket, prefix);
      } catch (error) {
        console.warn("Failed to delete story assets:", {
          message: error?.message || String(error),
          prefix,
        });
      }
    }

    return {
      deletedMessages: messages.length,
      deletedScenes: scenes.length,
    };
  };

app.get("/story/presets", async (req, res) => {
  if (!mediaTable) {
    return res.status(500).json({ message: "MEDIA_TABLE is not set" });
  }
  try {
    const presets = await ensureStoryPresets();
    const characters = await ensureStoryCharacters();
    const characterMap = new Map(
      characters.map((character) => [character.id, character])
    );
    res.json({
      presets: presets.map((preset) => ({
        id: preset.id,
        name: preset.name,
        synopsis: preset.synopsis,
        protagonistName:
          characterMap.get(preset.protagonistId || "")?.name ||
          preset.protagonistName ||
          "",
        stylePrompt: preset.stylePrompt,
        opening: preset.opening,
      })),
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to load story presets",
      error: error?.message || String(error),
    });
  }
});

app.get("/story/characters", async (req, res) => {
  if (!mediaTable) {
    return res.status(500).json({ message: "MEDIA_TABLE is not set" });
  }
  try {
    const characters = await ensureStoryCharacters();
    res.json({
      characters: characters.map((character) => ({
        id: character.id,
        name: character.name,
        weight: character.weight,
        signatureTraits: character.signatureTraits,
        faceDetails: character.faceDetails,
        eyeDetails: character.eyeDetails,
        hairDetails: character.hairDetails,
        ears: character.ears,
        tails: character.tails,
        horns: character.horns,
        wings: character.wings,
        hairStyles: character.hairStyles,
        viewDistance: character.viewDistance,
        accessories: character.accessories,
        markings: character.markings,
        background: character.background,
        pose: character.pose,
        outfitMaterials: character.outfitMaterials,
        styleReference: character.styleReference,
        identityPrompt: character.identityPrompt,
        storyBasePrompt: character.storyBasePrompt,
        storyNegativePrompt: character.storyNegativePrompt,
      })),
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to load story characters",
      error: error?.message || String(error),
    });
  }
});

app.get("/story/sessions", async (req, res) => {
  const userId = req.user?.sub;
  if (!mediaTable) {
    return res.status(500).json({ message: "MEDIA_TABLE is not set" });
  }
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    const rawItems = await queryBySkPrefix({
      pk: buildMediaPk(userId),
      skPrefix: "SESSION#",
      limit: 200,
      scanForward: false,
    });
    const items = rawItems
      .map(normalizeSessionItem)
      .filter((item) => item.sessionId);
    const keepByPreset = new Map();
    const duplicateSessions = [];

    sortSessionsByRecent(items).forEach((item) => {
      const key = item.presetId || item.sessionId;
      if (!keepByPreset.has(key)) {
        keepByPreset.set(key, item);
        return;
      }
      duplicateSessions.push(item);
    });

    const sessions = sortSessionsByRecent(
      Array.from(keepByPreset.values())
    ).map(buildSessionResponse);

    res.json({
      sessions,
      duplicateSessionsHidden: duplicateSessions.length,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to list story sessions",
      error: error?.message || String(error),
    });
  }
});

app.delete("/story/sessions", async (req, res) => {
  const userId = req.user?.sub;
  const mediaBucket = process.env.MEDIA_BUCKET;
  if (!mediaTable) {
    return res.status(500).json({ message: "MEDIA_TABLE is not set" });
  }
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const rawSessions = await queryBySkPrefix({
      pk: buildMediaPk(userId),
      skPrefix: "SESSION#",
      limit: 200,
      scanForward: false,
    });
    const sessions = rawSessions
      .map(normalizeSessionItem)
      .filter((item) => item.sessionId);

    if (sessions.length === 0) {
      return res.json({
        deletedSessions: 0,
        deletedMessages: 0,
        deletedScenes: 0,
      });
    }

    const deleted = await Promise.all(
      sessions.map((item) =>
        deleteSessionCascade({
          userId,
          sessionId: item.sessionId,
          mediaTableName: mediaTable,
          mediaBucket,
        })
      )
    );

    const totals = deleted.reduce(
      (acc, item) => ({
        deletedMessages: acc.deletedMessages + (item.deletedMessages || 0),
        deletedScenes: acc.deletedScenes + (item.deletedScenes || 0),
      }),
      { deletedMessages: 0, deletedScenes: 0 }
    );

    return res.json({
      deletedSessions: sessions.length,
      deletedMessages: totals.deletedMessages,
      deletedScenes: totals.deletedScenes,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to delete story sessions",
      error: error?.message || String(error),
    });
  }
});

app.post("/story/sessions", async (req, res) => {
  const userId = req.user?.sub;
  const presetId = req.body?.presetId;
  const title = req.body?.title?.trim();
  if (!mediaTable) {
    return res.status(500).json({ message: "MEDIA_TABLE is not set" });
  }
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (!presetId) {
    return res.status(400).json({ message: "presetId is required" });
  }

  try {
    const mediaBucket = process.env.MEDIA_BUCKET;
    const presets = await ensureStoryPresets();
    const characters = await ensureStoryCharacters();
    const characterMap = new Map(
      characters.map((character) => [character.id, character])
    );
    const preset =
      presets.find((item) => item.id === presetId) ||
      storyPresets.find((item) => item.id === presetId);
    if (!preset) {
      return res.status(400).json({ message: "Invalid presetId" });
    }
    const resolvedProtagonistId =
      preset.protagonistId ||
      (preset.protagonistName?.toLowerCase().includes("frieren")
        ? "frieren"
        : "");
    const character = characterMap.get(resolvedProtagonistId) || null;
    const protagonistPrompt =
      preset.protagonistPrompt || character?.identityPrompt || buildCharacterPrompt(character);
    const protagonistName =
      character?.name || preset.protagonistName || "Protagonist";
    const resolvedLorebook = resolveStoryLorebook(preset, protagonistName);
    const initialStoryState = buildInitialStoryState(resolvedLorebook);

    const rawExistingSessions = await queryBySkPrefix({
      pk: buildMediaPk(userId),
      skPrefix: "SESSION#",
      limit: 200,
      scanForward: false,
    });
    const existingSessions = rawExistingSessions
      .map(normalizeSessionItem)
      .filter((item) => item.sessionId);
    const samePresetSessions = sortSessionsByRecent(
      existingSessions.filter((item) => item.presetId === preset.id)
    );
    if (samePresetSessions.length > 0) {
      const primarySession = samePresetSessions[0];
      const duplicateSessions = samePresetSessions.slice(1);

      if (duplicateSessions.length > 0) {
        await Promise.all(
          duplicateSessions.map((item) =>
            deleteSessionCascade({
              userId,
              sessionId: item.sessionId,
              mediaTableName: mediaTable,
              mediaBucket,
            })
          )
        );
      }

      const messages = await queryBySkPrefix({
        pk: buildMediaPk(userId),
        skPrefix: storyMessagePrefix(primarySession.sessionId),
        limit: 200,
        scanForward: true,
      });
      const scenes = await queryBySkPrefix({
        pk: buildMediaPk(userId),
        skPrefix: storyScenePrefix(primarySession.sessionId),
        limit: 50,
        scanForward: true,
      });
      const signedScenes = await Promise.all(
        scenes.map(async (scene) => {
          if (!scene.imageKey || !mediaBucket) return scene;
          try {
            const imageUrl = await getSignedUrl(
              s3Client,
              new GetObjectCommand({
                Bucket: mediaBucket,
                Key: scene.imageKey,
              }),
              { expiresIn: 900 }
            );
            return { ...scene, imageUrl };
          } catch {
            return scene;
          }
        })
      );

      return res.json({
        session: {
          id: primarySession.sessionId,
          title: primarySession.title,
          presetId: primarySession.presetId,
          protagonistName: primarySession.protagonistName,
          synopsis: primarySession.synopsis,
          lorebook: primarySession.lorebook,
          storyState: primarySession.storyState,
          createdAt: primarySession.createdAt,
          updatedAt: primarySession.updatedAt,
          turnCount: primarySession.turnCount || 0,
          sceneCount: primarySession.sceneCount || 0,
        },
        messages: messages.map((message) => ({
          role: message.role,
          content: message.content,
          createdAt: message.createdAt,
        })),
        scenes: signedScenes.map((scene) => ({
          sceneId: scene.sceneId,
          title: scene.title,
          description: scene.description,
          prompt: scene.prompt,
          sceneEnvironment: scene.sceneEnvironment,
          sceneAction: scene.sceneAction,
          status: scene.status,
          imageKey: scene.imageKey,
          imageUrl: scene.imageUrl,
          promptPositive: scene.promptPositive,
          promptNegative: scene.promptNegative,
          createdAt: scene.createdAt,
        })),
        reused: true,
        cleanedDuplicateSessions: duplicateSessions.length,
      });
    }

    const sessionId = `story-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const now = new Date().toISOString();
    const sessionItem = {
      pk: buildMediaPk(userId),
      sk: buildStorySessionSk(sessionId),
      type: "STORY_SESSION",
      sessionId,
      title: title || preset.name,
      presetId: preset.id,
      synopsis: preset.synopsis,
      protagonistId: resolvedProtagonistId || character?.id || "",
      protagonistName,
      protagonistPrompt,
      worldPrompt: preset.worldPrompt,
      stylePrompt: preset.stylePrompt,
      negativePrompt: preset.negativePrompt,
      opening: preset.opening,
      lorebook: resolvedLorebook,
      storyState: initialStoryState,
      summary: "",
      turnCount: 0,
      sceneCount: 1,
      lastIllustrationTurn: 0,
      createdAt: now,
      updatedAt: now,
    };

    await dynamoClient.send(
      new PutCommand({
        TableName: mediaTable,
        Item: sessionItem,
      })
    );

    const openingMessage = {
      pk: buildMediaPk(userId),
      sk: buildStoryMessageSk(sessionId, Date.now()),
      type: "STORY_MESSAGE",
      sessionId,
      role: "assistant",
      content: preset.opening,
      createdAt: now,
    };

    await dynamoClient.send(
      new PutCommand({
        TableName: mediaTable,
        Item: openingMessage,
      })
    );

    const openingSceneId = `opening-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const openingScenePrompt = [
      "balanced composition, coherent staging",
      preset.worldPrompt,
    ]
      .filter(Boolean)
      .join(", ");
    const openingScene = {
      pk: buildMediaPk(userId),
      sk: buildStorySceneSk(sessionId, openingSceneId),
      type: "STORY_SCENE",
      sessionId,
      sceneId: openingSceneId,
      title: "Opening scene",
      description: preset.opening,
      prompt: openingScenePrompt,
      status: "pending",
      createdAt: now,
    };

    await dynamoClient.send(
      new PutCommand({
        TableName: mediaTable,
        Item: openingScene,
      })
    );

    res.json({
      session: {
        id: sessionId,
        title: sessionItem.title,
        presetId: sessionItem.presetId,
        protagonistName: sessionItem.protagonistName,
        synopsis: sessionItem.synopsis,
        lorebook: sessionItem.lorebook,
        storyState: sessionItem.storyState,
        createdAt: now,
        updatedAt: now,
        turnCount: 0,
        sceneCount: 1,
      },
      messages: [
        {
          role: "assistant",
          content: preset.opening,
          createdAt: now,
        },
      ],
      scenes: [
        {
          sceneId: openingSceneId,
          title: "Opening scene",
          description: preset.opening,
          prompt: openingScenePrompt,
          status: "pending",
          createdAt: now,
        },
      ],
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to create story session",
      error: error?.message || String(error),
    });
  }
});

app.get("/story/sessions/:id", async (req, res) => {
  const userId = req.user?.sub;
  const sessionId = req.params.id;
  const bucket = process.env.MEDIA_BUCKET;
  if (!mediaTable) {
    return res.status(500).json({ message: "MEDIA_TABLE is not set" });
  }
  if (!bucket) {
    return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
  }
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (!sessionId) {
    return res.status(400).json({ message: "sessionId is required" });
  }

  try {
    const sessionItem = await getItem({
      pk: buildMediaPk(userId),
      sk: buildStorySessionSk(sessionId),
    });
    if (!sessionItem) {
      return res.status(404).json({ message: "Session not found" });
    }

    const messages = await queryBySkPrefix({
      pk: buildMediaPk(userId),
      skPrefix: storyMessagePrefix(sessionId),
      limit: 200,
      scanForward: true,
    });
    const scenes = await queryBySkPrefix({
      pk: buildMediaPk(userId),
      skPrefix: storyScenePrefix(sessionId),
      limit: 50,
      scanForward: true,
    });

    const signedScenes = await Promise.all(
      scenes.map(async (scene) => {
        if (!scene.imageKey) return scene;
        const url = await getSignedUrl(
          s3Client,
          new GetObjectCommand({
            Bucket: bucket,
            Key: scene.imageKey,
          }),
          { expiresIn: 900 }
        );
        return { ...scene, imageUrl: url };
      })
    );

    res.json({
      session: {
        id: sessionItem.sessionId,
        title: sessionItem.title,
        presetId: sessionItem.presetId,
        protagonistName: sessionItem.protagonistName,
        synopsis: sessionItem.synopsis,
        lorebook: sessionItem.lorebook,
        storyState: sessionItem.storyState,
        createdAt: sessionItem.createdAt,
        updatedAt: sessionItem.updatedAt,
        turnCount: sessionItem.turnCount || 0,
        sceneCount: sessionItem.sceneCount || 0,
      },
      messages: messages.map((message) => ({
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
      })),
      scenes: signedScenes.map((scene) => ({
        sceneId: scene.sceneId,
        title: scene.title,
        description: scene.description,
        prompt: scene.prompt,
        sceneEnvironment: scene.sceneEnvironment,
        sceneAction: scene.sceneAction,
        status: scene.status,
        imageKey: scene.imageKey,
        imageUrl: scene.imageUrl,
        promptPositive: scene.promptPositive,
        promptNegative: scene.promptNegative,
        createdAt: scene.createdAt,
      })),
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to load story session",
      error: error?.message || String(error),
    });
  }
});

app.delete("/story/sessions/:id", async (req, res) => {
  const mediaBucket = process.env.MEDIA_BUCKET;
  const mediaTableName = process.env.MEDIA_TABLE;
  const userId = req.user?.sub;
  const sessionId = req.params.id;

  if (!mediaTableName) {
    return res.status(500).json({ message: "MEDIA_TABLE is not set" });
  }
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (!sessionId) {
    return res.status(400).json({ message: "sessionId is required" });
  }

  try {
    const sessionItem = await getItem({
      pk: buildMediaPk(userId),
      sk: buildStorySessionSk(sessionId),
    });
    if (!sessionItem) {
      return res.status(404).json({ message: "Session not found" });
    }

    const deleted = await deleteSessionCascade({
      userId,
      sessionId,
      mediaTableName,
      mediaBucket,
    });

    res.json({
      sessionId,
      deletedMessages: deleted.deletedMessages,
      deletedScenes: deleted.deletedScenes,
    });
  } catch (error) {
    console.error("Story session delete error:", {
      name: error?.name,
      message: error?.message,
      metadata: error?.$metadata,
      cause: error?.cause,
    });
    res.status(500).json({
      message: "Failed to delete story session",
      error: error?.message || String(error),
    });
  }
});

};
