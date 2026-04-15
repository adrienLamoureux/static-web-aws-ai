const { Router } = require("express");
const {
  parseOptionalNumber,
  STORY_MUSIC_MODEL_ID,
  MUSIC_LIBRARY_SK_PREFIX,
  buildStoryMusicDefaultInput,
  parseMusicTags,
  normalizeTrackForSearch,
  buildTrackSearchText,
  mapMusicTrackResponse,
  inferAudioExtension,
  buildStoryMusicLibrarySk,
  buildStoryMusicLibraryKey,
  parseLibraryLimit,
  matchesTrackFilter,
} = require("./music-helpers");
const { requireEnv, requireAuth, requireParam } = require("../../lib/route-guards");
const { handleRouteError } = require("../../lib/error-handler");

module.exports = function registerStoryMusicLibraryRoutes(deps) {
  const {
    mediaTable,
    getItem,
    buildMediaPk,
    queryBySkPrefix,
    normalizePromptFragment,
    dynamoClient,
    PutCommand,
    getSignedUrl,
    s3Client,
    GetObjectCommand,
    PutObjectCommand,
    buildUserPrefix,
    ensureUserKey,
  } = deps;

  const { STORY_MUSIC_OUTPUT_FORMAT } = buildStoryMusicDefaultInput(normalizePromptFragment);

  const router = Router();

  router.get("/music-library", deps.requireUserMiddleware, async (req, res) => {
    const userId = req.user?.sub;
    const bucket = process.env.MEDIA_BUCKET;
    const limit = parseLibraryLimit(req.query?.limit, 200);
    const query = normalizePromptFragment(req.query?.q || "").toLowerCase();
    const mood = normalizePromptFragment(req.query?.mood || "").toLowerCase();
    const energy = normalizePromptFragment(req.query?.energy || "").toLowerCase();
    const source = normalizePromptFragment(req.query?.source || "").toLowerCase();
    const tags = parseMusicTags(normalizePromptFragment, req.query?.tags);
    const tagsMode = String(req.query?.tagsMode || "any").toLowerCase() === "all" ? "all" : "any";

    if (!requireEnv(res, "MEDIA_TABLE", mediaTable)) return;
    if (!requireEnv(res, "MEDIA_BUCKET", bucket)) return;
    if (!requireAuth(res, userId)) return;

    try {
      const items = await queryBySkPrefix({
        pk: buildMediaPk(userId),
        skPrefix: MUSIC_LIBRARY_SK_PREFIX,
        limit: 500,
        scanForward: false,
      });
      const filters = {
        q: query,
        mood,
        energy,
        source,
        tags,
        tagsMode,
      };
      const filteredItems = items.filter((item) =>
        matchesTrackFilter(normalizePromptFragment, item, filters)
      );
      const slicedItems = filteredItems.slice(0, limit);
      const tracks = await Promise.all(
        slicedItems.map((item) =>
          mapMusicTrackResponse(
            normalizePromptFragment,
            s3Client,
            GetObjectCommand,
            getSignedUrl,
            bucket,
            normalizeTrackForSearch(normalizePromptFragment, item)
          )
        )
      );
      return res.json({
        tracks,
        total: filteredItems.length,
        limit,
        filters: {
          q: query,
          mood,
          energy,
          source,
          tags,
          tagsMode,
        },
      });
    } catch (error) {
      return handleRouteError(res, "load music library", error);
    }
  });

  router.post("/music-library/upload-url", deps.requireUserMiddleware, async (req, res) => {
    const userId = req.user?.sub;
    const bucket = process.env.MEDIA_BUCKET;
    const fileName = req.body?.fileName || "track";
    const contentType = req.body?.contentType || "audio/mpeg";

    if (!requireEnv(res, "MEDIA_TABLE", mediaTable)) return;
    if (!requireEnv(res, "MEDIA_BUCKET", bucket)) return;
    if (!requireAuth(res, userId)) return;
    if (
      !String(contentType || "")
        .toLowerCase()
        .startsWith("audio/")
    ) {
      return res.status(400).json({
        message: "contentType must be an audio type",
      });
    }

    try {
      const extension = inferAudioExtension({
        contentType,
        url: fileName,
        fallback: "mp3",
      });
      const trackId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const key = buildStoryMusicLibraryKey(buildUserPrefix, userId, trackId, extension);
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
      });
      const url = await getSignedUrl(s3Client, command, { expiresIn: 900 });
      return res.json({
        bucket,
        key,
        url,
        trackId,
        contentType,
      });
    } catch (error) {
      return handleRouteError(res, "generate music upload URL", error);
    }
  });

  router.post("/music-library/upload", deps.requireUserMiddleware, async (req, res) => {
    const userId = req.user?.sub;
    const bucket = process.env.MEDIA_BUCKET;
    const providedTrackId = String(req.body?.trackId || "").trim();
    const key = String(req.body?.key || "").trim();
    const title = normalizePromptFragment(req.body?.title || "");
    const description = normalizePromptFragment(req.body?.description || "");
    const mood = normalizePromptFragment(req.body?.mood || "").toLowerCase();
    const energyRaw = normalizePromptFragment(req.body?.energy || "").toLowerCase();
    const prompt = normalizePromptFragment(req.body?.prompt || "");
    const tags = parseMusicTags(normalizePromptFragment, req.body?.tags);
    const parsedTempo = Number(req.body?.tempoBpm);
    const tempoBpm =
      Number.isFinite(parsedTempo) && parsedTempo > 0 ? Math.round(parsedTempo) : null;

    if (!requireEnv(res, "MEDIA_TABLE", mediaTable)) return;
    if (!requireEnv(res, "MEDIA_BUCKET", bucket)) return;
    if (!requireAuth(res, userId)) return;
    if (!requireParam(res, "key", key)) return;
    if (!requireParam(res, "title", title)) return;
    try {
      ensureUserKey(key, userId);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
    if (!key.startsWith(`${buildUserPrefix(userId)}stories/music-library/`)) {
      return res.status(400).json({
        message: "key must be in the story music-library prefix",
      });
    }

    const extractedTrackId =
      key
        .split("/")
        .pop()
        ?.replace(/\.[^.]+$/, "") || "";
    const trackId = providedTrackId || extractedTrackId;
    if (!trackId) {
      return res.status(400).json({ message: "trackId is required" });
    }
    if (providedTrackId && extractedTrackId && providedTrackId !== extractedTrackId) {
      return res.status(400).json({
        message: "trackId does not match key",
      });
    }

    try {
      const existingItem = await getItem({
        pk: buildMediaPk(userId),
        sk: buildStoryMusicLibrarySk(trackId),
      });
      const now = new Date().toISOString();
      const energy = ["low", "medium", "high"].includes(energyRaw) ? energyRaw : "";
      const trackItem = {
        ...(existingItem || {}),
        pk: buildMediaPk(userId),
        sk: buildStoryMusicLibrarySk(trackId),
        type: "STORY_MUSIC_LIBRARY_TRACK",
        trackId,
        key,
        title,
        description,
        prompt,
        mood,
        energy,
        tempoBpm,
        tags,
        modelId: existingItem?.modelId || "manual-upload",
        source: "upload",
        searchText: buildTrackSearchText(normalizePromptFragment, {
          title,
          description,
          mood,
          energy,
          tags,
          prompt,
        }),
        createdAt: existingItem?.createdAt || now,
        updatedAt: now,
      };
      await dynamoClient.send(
        new PutCommand({
          TableName: mediaTable,
          Item: trackItem,
        })
      );

      return res.json({
        track: await mapMusicTrackResponse(
          normalizePromptFragment,
          s3Client,
          GetObjectCommand,
          getSignedUrl,
          bucket,
          trackItem
        ),
      });
    } catch (error) {
      return handleRouteError(res, "save uploaded music metadata", error);
    }
  });

  return router;
};
