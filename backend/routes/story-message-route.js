module.exports = (app, deps) => {
  const {
    mediaTable,
    getItem,
    buildMediaPk,
    buildStorySessionSk,
    buildStoryMessageSk,
    dynamoClient,
    PutCommand,
    queryBySkPrefix,
    storyMessagePrefix,
    resolveStoryLorebook,
    buildInitialStoryState,
    selectStoryEvent,
    InvokeModelCommand,
    storyModelId,
    bedrockClient,
    safeJsonParse,
    extractJsonStringField,
    applyStateDelta,
    updateStoryMeta,
    aiCraftSceneContext,
    buildSceneFragmentsFromStoryState,
    dedupeFragments,
    splitPromptFragments,
    buildStorySceneSk,
  } = deps;

app.post("/story/sessions/:id/message", async (req, res) => {
  const userId = req.user?.sub;
  const sessionId = req.params.id;
  const content = req.body?.content?.trim();
  const debug = req.query?.debug === "true";
  if (!mediaTable) {
    return res.status(500).json({ message: "MEDIA_TABLE is not set" });
  }
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (!sessionId) {
    return res.status(400).json({ message: "sessionId is required" });
  }
  if (!content) {
    return res.status(400).json({ message: "content is required" });
  }

  try {
    const sessionItem = await getItem({
      pk: buildMediaPk(userId),
      sk: buildStorySessionSk(sessionId),
    });
    if (!sessionItem) {
      return res.status(404).json({ message: "Session not found" });
    }

    const now = new Date().toISOString();
    const newTurnCount = (sessionItem.turnCount || 0) + 1;
    const lastIllustrationTurn = sessionItem.lastIllustrationTurn || 0;
    const userMessageItem = {
      pk: buildMediaPk(userId),
      sk: buildStoryMessageSk(sessionId, Date.now()),
      type: "STORY_MESSAGE",
      sessionId,
      role: "user",
      content,
      createdAt: now,
    };
    await dynamoClient.send(
      new PutCommand({
        TableName: mediaTable,
        Item: userMessageItem,
      })
    );

    const recentMessages = await queryBySkPrefix({
      pk: buildMediaPk(userId),
      skPrefix: storyMessagePrefix(sessionId),
      limit: 8,
      scanForward: false,
    });
    const orderedMessages = recentMessages.reverse();
    const lorebookSeed = {
      id: sessionItem.presetId,
      name: sessionItem.title,
      synopsis: sessionItem.synopsis,
      worldPrompt: sessionItem.worldPrompt,
      opening: sessionItem.opening,
      lorebook: sessionItem.lorebook,
    };
    const resolvedLorebook =
      sessionItem.lorebook ||
      resolveStoryLorebook(lorebookSeed, sessionItem.protagonistName);
    const resolvedStoryState =
      sessionItem.storyState || buildInitialStoryState(resolvedLorebook);
    const directorSelection = selectStoryEvent(
      resolvedLorebook,
      resolvedStoryState,
      newTurnCount
    );
    const directorCue = directorSelection.cue;
    const isPlayerSeparated = (resolvedStoryState.flags || []).includes(
      "player-separated"
    );

    const systemPrompt = [
      "You are a narrative director for an interactive anime adventure.",
      `Protagonist: ${sessionItem.protagonistName}.`,
      "The protagonist must remain the same character in every scene.",
      "Keep continuity with the story summary and prior dialogue.",
      "Keep narration minimal. Favor direct action and dialogue from the protagonist.",
      "Each paragraph should include the protagonist acting or speaking. Avoid long exposition.",
      "Environment changes should be concise (one short sentence max) and reflected in stateDelta.",
      "Perspective rule: the player only knows what they directly perceive.",
      "If Frieren acts away from the player, do not render full off-screen conversations; summarize key outcome in 1-2 concise sentences, then return to direct interaction with the player.",
      "When the player indicates movement or a new place (inn, village, road, ruins), update stateDelta.scene.locationId/locationName/description accordingly using the Lorebook locations.",
      "Use the Lorebook and Current State to keep environment, NPCs, and goals coherent.",
      "Integrate the Director cue into the next reply. If initiative is protagonist, the protagonist should act first or propose an action without waiting for the player.",
      "Respond in 2-4 short paragraphs, then end with a question to the player.",
      "When a meaningful scene beat occurs, mark it as a sceneBeat.",
      "Update stateDelta to reflect changes in location, time, weather, tags, goals, flags, NPC presence, and metrics (tension, mystery, urgency, progress, fatigue).",
      "stateDelta schema: { scene: { locationId, locationName, description, timeOfDay, weather, mood, direction, tagsAdd, tagsRemove, nearbyAdd, nearbyRemove }, metrics: { tension, mystery, urgency, progress, fatigue }, metricsDelta: { tension, mystery, urgency, progress, fatigue }, goals: { activeAdd, activeRemove, completedAdd }, flags: { add, remove }, npcs: { presentAdd, presentRemove } }.",
      "Return ONLY valid JSON with keys:",
      "reply (string), summary (string), sceneBeat (boolean), sceneTitle (string), sceneDescription (string), scenePrompt (string), sceneEnvironment (string), sceneAction (string), stateDelta (object).",
      "scenePrompt should focus on visual details of the moment (environment, action, mood) and be concise.",
      "scenePrompt must be purely visual fragments (comma-separated). No dialogue, no questions, no second-person phrasing.",
      "sceneEnvironment: comma-separated background/environment fragments (short phrases).",
      "sceneAction: comma-separated action/pose/motion fragments (short phrases).",
      "scenePrompt should include framing guidance: medium shot or full body, face readable, no extreme wide shots.",
      `Player separation mode: ${isPlayerSeparated ? "separated" : "shared-scene"}.`,
      `Lorebook: ${JSON.stringify(resolvedLorebook)}`,
      `Current state: ${JSON.stringify(resolvedStoryState)}`,
      `Director cue: ${directorCue ? JSON.stringify(directorCue) : "none"}`,
      `Story summary: ${sessionItem.summary || "New story."}`,
      `World: ${sessionItem.worldPrompt}`,
      `Style: ${sessionItem.stylePrompt}`,
    ].join("\n");

    const messagePayload = orderedMessages.map((message) => ({
      role: message.role,
      content: [{ type: "text", text: message.content }],
    }));

    const command = new InvokeModelCommand({
      modelId: storyModelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 600,
        temperature: 0.7,
        system: systemPrompt,
        messages: messagePayload,
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

    const parsed = safeJsonParse(responseText) || {};
    const extractedReply =
      typeof parsed.reply === "string" && parsed.reply.trim().length > 0
        ? ""
        : extractJsonStringField(responseText, "reply");
    const replyText =
      parsed.reply ||
      extractedReply ||
      responseText ||
      "The story continues.";
    const nextSummary =
      typeof parsed.summary === "string" && parsed.summary.trim().length > 0
        ? parsed.summary.trim()
        : sessionItem.summary || "";
    let sceneBeat = Boolean(parsed.sceneBeat);
    const sceneTitle = parsed.sceneTitle?.trim() || "";
    const sceneDescription = parsed.sceneDescription?.trim() || "";
    let scenePrompt = parsed.scenePrompt?.trim() || "";
    let sceneEnvironment = parsed.sceneEnvironment?.trim() || "";
    let sceneAction = parsed.sceneAction?.trim() || "";
    const rawStateDelta = parsed.stateDelta;
    const stateDelta =
      rawStateDelta && typeof rawStateDelta === "object" ? rawStateDelta : {};

    const assistantMessageItem = {
      pk: buildMediaPk(userId),
      sk: buildStoryMessageSk(sessionId, Date.now() + 1),
      type: "STORY_MESSAGE",
      sessionId,
      role: "assistant",
      content: replyText,
      createdAt: new Date().toISOString(),
    };
    await dynamoClient.send(
      new PutCommand({
        TableName: mediaTable,
        Item: assistantMessageItem,
      })
    );

    let nextStoryState = applyStateDelta(
      resolvedStoryState,
      directorSelection.event?.effects || {}
    );
    nextStoryState = applyStateDelta(nextStoryState, stateDelta);
    nextStoryState.meta = updateStoryMeta(
      nextStoryState,
      directorSelection.event,
      newTurnCount,
      directorSelection.recentLimit
    );

    const locationChanged = Boolean(
      stateDelta?.scene?.locationId ||
        stateDelta?.scene?.locationName ||
        stateDelta?.scene?.description
    );
    const eventType = directorSelection.event?.type;
    const turnsSinceIllustration = newTurnCount - lastIllustrationTurn;
    const shouldAutoIllustrate = turnsSinceIllustration >= 2;
    const shouldForceScene =
      locationChanged ||
      eventType === "environment" ||
      eventType === "discovery" ||
      eventType === "npc" ||
      eventType === "choice" ||
      shouldAutoIllustrate;
    let hasSceneVisual =
      Boolean(scenePrompt) || Boolean(sceneEnvironment) || Boolean(sceneAction);
    const hadModelSceneVisual = hasSceneVisual;
    let sceneWasCompacted = false;
    let sceneCompactionFailed = false;
    let sceneDebugReason = "";
    if (!hasSceneVisual && shouldForceScene) {
      const aiSeedScene = await aiCraftSceneContext({
        scenePrompt,
        sceneEnvironment,
        sceneAction,
        contextText: replyText,
        storyState: nextStoryState,
        lorebook: resolvedLorebook,
      });
      scenePrompt = aiSeedScene.scenePrompt;
      sceneEnvironment = aiSeedScene.sceneEnvironment;
      sceneAction = aiSeedScene.sceneAction;
      hasSceneVisual =
        Boolean(scenePrompt) || Boolean(sceneEnvironment) || Boolean(sceneAction);
      sceneWasCompacted = hasSceneVisual;
    }
    if (!hasSceneVisual && shouldForceScene) {
      sceneCompactionFailed = true;
      sceneDebugReason =
        "Scene compaction returned no visual fragments; illustration skipped for this turn.";
      console.warn("Story scene compaction empty output", {
        sessionId,
        userId,
        turnCount: newTurnCount,
        locationChanged,
        eventType: eventType || "",
      });
    }
    if (locationChanged && hasSceneVisual) {
      const stateScene = buildSceneFragmentsFromStoryState(
        nextStoryState,
        sessionItem.worldPrompt
      );
      sceneEnvironment = dedupeFragments([
        ...splitPromptFragments(sceneEnvironment),
        ...stateScene.environment,
      ]).join(", ");
      sceneAction = dedupeFragments([
        ...splitPromptFragments(sceneAction),
        ...stateScene.action,
      ]).join(", ");
      scenePrompt = dedupeFragments([
        ...splitPromptFragments(scenePrompt),
        ...stateScene.environment,
        ...stateScene.action,
      ]).join(", ");
      hasSceneVisual =
        Boolean(scenePrompt) || Boolean(sceneEnvironment) || Boolean(sceneAction);
      sceneWasCompacted = false;
    }
    if (hasSceneVisual && !sceneWasCompacted) {
      const compactScene = await aiCraftSceneContext({
        scenePrompt,
        sceneEnvironment,
        sceneAction,
        contextText: replyText,
        storyState: nextStoryState,
        lorebook: resolvedLorebook,
      });
      scenePrompt = compactScene.scenePrompt;
      sceneEnvironment = compactScene.sceneEnvironment;
      sceneAction = compactScene.sceneAction;
      hasSceneVisual =
        Boolean(scenePrompt) || Boolean(sceneEnvironment) || Boolean(sceneAction);
      sceneWasCompacted = true;
    }

    let scene = null;
    let nextSceneCount = sessionItem.sceneCount || 0;
    const isSituationIllustration =
      locationChanged ||
      eventType === "environment" ||
      eventType === "discovery";
    const isCadenceIllustration = shouldAutoIllustrate;
    const shouldIllustrate =
      hasSceneVisual &&
      (sceneBeat || isSituationIllustration || isCadenceIllustration);
    if (!shouldIllustrate && !sceneDebugReason) {
      sceneDebugReason = hasSceneVisual
        ? "Illustration gating not met (sceneBeat/situation/cadence)."
        : "No scene visual available for illustration.";
    }

    if (shouldIllustrate) {
      const sceneId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const sceneItem = {
        pk: buildMediaPk(userId),
        sk: buildStorySceneSk(sessionId, sceneId),
        type: "STORY_SCENE",
        sessionId,
        sceneId,
        title: sceneTitle,
        description: sceneDescription,
        prompt: scenePrompt,
        sceneEnvironment,
        sceneAction,
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      await dynamoClient.send(
        new PutCommand({
          TableName: mediaTable,
          Item: sceneItem,
        })
      );
      nextSceneCount += 1;
      scene = {
        sceneId,
        title: sceneTitle,
        description: sceneDescription,
        prompt: scenePrompt,
        sceneEnvironment,
        sceneAction,
        status: "pending",
      };
    }

    const updatedSession = {
      ...sessionItem,
      summary: nextSummary,
      lorebook: resolvedLorebook,
      storyState: nextStoryState,
      turnCount: newTurnCount,
      sceneCount: nextSceneCount,
      lastIllustrationTurn: shouldIllustrate
        ? newTurnCount
        : lastIllustrationTurn,
      updatedAt: new Date().toISOString(),
    };

    await dynamoClient.send(
      new PutCommand({
        TableName: mediaTable,
        Item: updatedSession,
      })
    );

    res.json({
      sessionId,
      turnCount: newTurnCount,
      storyState: nextStoryState,
      lorebook: resolvedLorebook,
      summary: nextSummary,
      assistant: {
        role: "assistant",
        content: replyText,
      },
      scene,
      ...(sceneCompactionFailed || debug
        ? {
            sceneDebug: {
              hadModelSceneVisual,
              shouldForceScene,
              locationChanged,
              eventType: eventType || "",
              turnsSinceIllustration,
              shouldAutoIllustrate,
              hasSceneVisual,
              sceneWasCompacted,
              shouldIllustrate,
              reason: sceneDebugReason,
            },
          }
        : {}),
    });
  } catch (error) {
    console.error("Story message error:", {
      message: error?.message || String(error),
    });
    res.status(500).json({
      message: "Failed to process story message",
      error: error?.message || String(error),
    });
  }
});

};
