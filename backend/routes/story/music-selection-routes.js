const { Router } = require("express");
const { signSceneMusicUrl } = require("./illustration-helpers");
const {
  parseOptionalNumber,
  STORY_MUSIC_MODEL_ID,
  MUSIC_LIBRARY_SK_PREFIX,
  STORY_MUSIC_RECOMMENDATION_METHOD,
  STORY_MUSIC_RECOMMENDATION_SCAN_LIMIT,
  STORY_MUSIC_RECOMMENDATION_CANDIDATE_LIMIT,
  normalizeTrackForSearch,
  buildTrackSearchText,
  mapMusicTrackResponse,
  buildSceneMusicPayload,
  buildStoryMusicLibrarySk,
  buildStoryMusicLibraryKey,
  inferAudioExtension,
} = require("./music-helpers");
const {
  clampRecommendationScore,
  buildSceneRecommendationProfile,
  rankRecommendedTracks,
} = require("./music-recommendation");

module.exports = function registerStoryMusicSelectionRoutes(deps) {
  const {
    mediaTable,
    getItem,
    buildMediaPk,
    buildStorySessionSk,
    buildStorySceneSk,
    queryBySkPrefix,
    normalizePromptFragment,
    dynamoClient,
    PutCommand,
    getSignedUrl,
    s3Client,
    GetObjectCommand,
    buildUserPrefix,
    copyS3Object,
  } = deps;

  const router = Router();

  router.post("/sessions/:id/scenes/:sceneId/music/favorite", deps.requireUserMiddleware, async (req, res) => {
    const userId = req.user?.sub;
    const sessionId = req.params.id;
    const sceneId = req.params.sceneId;
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
      if (!sceneItem.musicKey) {
        return res.status(400).json({
          message: "Generate scene music before saving to library",
        });
      }

      const existingTrackId = sceneItem.musicLibraryTrackId || "";
      if (existingTrackId) {
        const existingTrack = await getItem({
          pk: buildMediaPk(userId),
          sk: buildStoryMusicLibrarySk(existingTrackId),
        });
        if (existingTrack?.key) {
          const normalizedExistingTrack = normalizeTrackForSearch(normalizePromptFragment, {
            ...existingTrack,
            source: existingTrack.source || "generated",
          });
          if (
            normalizedExistingTrack.searchText !== existingTrack.searchText ||
            normalizedExistingTrack.source !== existingTrack.source ||
            normalizedExistingTrack.description !== (existingTrack.description || "")
          ) {
            await dynamoClient.send(
              new PutCommand({
                TableName: mediaTable,
                Item: {
                  ...existingTrack,
                  ...normalizedExistingTrack,
                  updatedAt: new Date().toISOString(),
                },
              })
            );
          }
          return res.json({
            track: await mapMusicTrackResponse(normalizePromptFragment, s3Client, GetObjectCommand, getSignedUrl, bucket, normalizedExistingTrack),
            sceneId,
            musicLibraryTrackId: existingTrack.trackId || existingTrackId,
          });
        }
      }

      const now = new Date().toISOString();
      const trackId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const sourceExtension = inferAudioExtension({
        url: sceneItem.musicKey,
        fallback: "mp3",
      });
      const libraryKey = buildStoryMusicLibraryKey(buildUserPrefix, userId, trackId, sourceExtension);

      await copyS3Object({
        bucket,
        sourceKey: sceneItem.musicKey,
        destinationKey: libraryKey,
      });

      const customTitle = normalizePromptFragment(req.body?.title || "");
      const trackItem = {
        pk: buildMediaPk(userId),
        sk: buildStoryMusicLibrarySk(trackId),
        type: "STORY_MUSIC_LIBRARY_TRACK",
        trackId,
        key: libraryKey,
        title:
          customTitle ||
          normalizePromptFragment(
            `${sceneItem.title || "Scene"} soundtrack`
          ) ||
          "Saved soundtrack",
        description: normalizePromptFragment(sceneItem.description || ""),
        prompt: sceneItem.musicPrompt || "",
        mood: sceneItem.musicMood || "",
        energy: sceneItem.musicEnergy || "",
        tempoBpm: sceneItem.musicTempoBpm || null,
        tags: Array.isArray(sceneItem.musicTags) ? sceneItem.musicTags : [],
        modelId: sceneItem.musicModelId || STORY_MUSIC_MODEL_ID,
        source: "generated",
        sessionId,
        sceneId,
        sourceMusicKey: sceneItem.musicKey,
        searchText: buildTrackSearchText(normalizePromptFragment, {
          title:
            customTitle ||
            normalizePromptFragment(
              `${sceneItem.title || "Scene"} soundtrack`
            ) ||
            "Saved soundtrack",
          description: normalizePromptFragment(sceneItem.description || ""),
          mood: sceneItem.musicMood || "",
          energy: sceneItem.musicEnergy || "",
          tags: Array.isArray(sceneItem.musicTags) ? sceneItem.musicTags : [],
          prompt: sceneItem.musicPrompt || "",
        }),
        createdAt: now,
        updatedAt: now,
      };
      await dynamoClient.send(
        new PutCommand({
          TableName: mediaTable,
          Item: trackItem,
        })
      );

      const updatedScene = {
        ...sceneItem,
        musicLibraryTrackId: trackId,
        musicUpdatedAt: now,
        updatedAt: now,
      };
      await dynamoClient.send(
        new PutCommand({
          TableName: mediaTable,
          Item: updatedScene,
        })
      );

      return res.json({
        track: await mapMusicTrackResponse(normalizePromptFragment, s3Client, GetObjectCommand, getSignedUrl, bucket, trackItem),
        sceneId,
        musicLibraryTrackId: trackId,
      });
    } catch (error) {
      console.error("Story music favorite error:", {
        message: error?.message || String(error),
      });
      return res.status(500).json({
        message: "Failed to save soundtrack to library",
        error: error?.message || String(error),
      });
    }
  });

  router.post("/sessions/:id/scenes/:sceneId/music/recommend", deps.requireUserMiddleware, async (req, res) => {
    const userId = req.user?.sub;
    const sessionId = req.params.id;
    const sceneId = req.params.sceneId;

    if (!mediaTable) {
      return res.status(500).json({ message: "MEDIA_TABLE is not set" });
    }
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
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

      const trackItems = await queryBySkPrefix({
        pk: buildMediaPk(userId),
        skPrefix: MUSIC_LIBRARY_SK_PREFIX,
        limit: STORY_MUSIC_RECOMMENDATION_SCAN_LIMIT,
        scanForward: false,
      });
      const sceneProfile = buildSceneRecommendationProfile(normalizePromptFragment, {
        sceneItem,
        sessionItem,
      });
      const rankedCandidates = rankRecommendedTracks(normalizePromptFragment, {
        trackItems,
        sceneProfile,
      });
      const bestCandidate = rankedCandidates[0] || null;
      const recommendedTrackId = bestCandidate?.trackId || "";
      const recommendationScore =
        typeof bestCandidate?.score === "number" ? bestCandidate.score : null;
      const priorScore = Number(sceneItem.recommendationScore);
      const normalizedPriorScore = Number.isFinite(priorScore)
        ? clampRecommendationScore(priorScore)
        : null;
      const hasChanged =
        (sceneItem.recommendedTrackId || "") !== recommendedTrackId ||
        (sceneItem.recommendationMethod || "") !== STORY_MUSIC_RECOMMENDATION_METHOD ||
        normalizedPriorScore !== recommendationScore;
      const updatedScene = hasChanged
        ? {
            ...sceneItem,
            recommendedTrackId,
            recommendationMethod: STORY_MUSIC_RECOMMENDATION_METHOD,
            recommendationScore,
            updatedAt: new Date().toISOString(),
          }
        : {
            ...sceneItem,
            recommendedTrackId,
            recommendationMethod:
              sceneItem.recommendationMethod || STORY_MUSIC_RECOMMENDATION_METHOD,
            recommendationScore,
          };

      if (hasChanged) {
        await dynamoClient.send(
          new PutCommand({
            TableName: mediaTable,
            Item: updatedScene,
          })
        );
      }

      return res.json({
        sceneId,
        recommendedTrackId: updatedScene.recommendedTrackId || "",
        recommendationMethod: updatedScene.recommendationMethod || "",
        recommendationScore:
          typeof updatedScene.recommendationScore === "number"
            ? updatedScene.recommendationScore
            : null,
        candidates: rankedCandidates
          .slice(0, STORY_MUSIC_RECOMMENDATION_CANDIDATE_LIMIT)
          .map((candidate) => ({
            trackId: candidate.trackId,
            score: candidate.score,
            title: candidate.track.title || "Saved soundtrack",
            mood: candidate.track.mood || "",
            energy: candidate.track.energy || "",
            tags: Array.isArray(candidate.track.tags) ? candidate.track.tags : [],
          })),
      });
    } catch (error) {
      console.error("Story music recommendation error:", {
        message: error?.message || String(error),
      });
      return res.status(500).json({
        message: "Failed to recommend soundtrack from library",
        error: error?.message || String(error),
      });
    }
  });

  router.post("/sessions/:id/scenes/:sceneId/music/select", deps.requireUserMiddleware, async (req, res) => {
    const userId = req.user?.sub;
    const sessionId = req.params.id;
    const sceneId = req.params.sceneId;
    const trackId = String(req.body?.trackId || "").trim();
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
    if (!sessionId || !sceneId) {
      return res
        .status(400)
        .json({ message: "sessionId and sceneId are required" });
    }
    if (!trackId) {
      return res.status(400).json({ message: "trackId is required" });
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
      const trackItem = await getItem({
        pk: buildMediaPk(userId),
        sk: buildStoryMusicLibrarySk(trackId),
      });
      if (!trackItem?.key) {
        return res.status(404).json({ message: "Track not found" });
      }

      const updatedScene = {
        ...sceneItem,
        musicKey: trackItem.key,
        musicStatus: "succeeded",
        musicPredictionId: "",
        musicPrompt: trackItem.prompt || sceneItem.musicPrompt || "",
        musicModelId: trackItem.modelId || STORY_MUSIC_MODEL_ID,
        musicMood: trackItem.mood || "",
        musicEnergy: trackItem.energy || "",
        musicTempoBpm: trackItem.tempoBpm || null,
        musicTags: Array.isArray(trackItem.tags) ? trackItem.tags : [],
        musicLibraryTrackId: trackItem.trackId || trackId,
        musicUpdatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await dynamoClient.send(
        new PutCommand({
          TableName: mediaTable,
          Item: updatedScene,
        })
      );
      const musicUrl = await signSceneMusicUrl(s3Client, GetObjectCommand, getSignedUrl, bucket, updatedScene);

      return res.json({
        sceneId,
        track: await mapMusicTrackResponse(normalizePromptFragment, s3Client, GetObjectCommand, getSignedUrl, bucket, trackItem),
        ...buildSceneMusicPayload(parseOptionalNumber, updatedScene, musicUrl),
      });
    } catch (error) {
      console.error("Story music select error:", {
        message: error?.message || String(error),
      });
      return res.status(500).json({
        message: "Failed to apply library track to scene",
        error: error?.message || String(error),
      });
    }
  });

  return router;
};
