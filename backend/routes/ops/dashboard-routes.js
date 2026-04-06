const { Router } = require("express");
const {
  GLOBAL_MASONRY_PREFIX,
  GLOBAL_MASONRY_URL_EXPIRATION_SECONDS,
  DEFAULT_JOB_PRIORITY,
  ALLOWED_JOB_PRIORITIES,
  isMasonryImageKey,
  buildDashboardData,
} = require("./ops-helpers");

module.exports = function registerDashboardRoutes(deps) {
  const {
    mediaTable,
    queryMediaItems,
    getItem,
    putMediaItem,
    buildMediaPk,
    buildMediaSk,
    buildStorySessionSk,
    s3Client,
    getSignedUrl,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    buildSafeBaseName,
    dynamoClient,
    PutCommand,
    // Injected by operations-routes to avoid duplication
    listGlobalMasonryImages,
  } = deps;

  const { requireUserMiddleware, requireAdminMiddleware } = deps;
  const adminGuard = [requireUserMiddleware, requireAdminMiddleware];

  const router = Router();

  router.get("/dashboard", ...adminGuard, async (req, res) => {
    const requestStartedAt = Date.now();
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const [jobItems, imageItems, videoItems] = await Promise.all([
        queryMediaItems({ userId, type: "JOB" }),
        queryMediaItems({ userId, type: "IMG" }),
        queryMediaItems({ userId, type: "VID" }),
      ]);
      const dashboardData = buildDashboardData({
        jobItems,
        imageItems,
        videoItems,
        requestStartedAt,
      });
      return res.json({
        generatedAt: new Date().toISOString(),
        queue: dashboardData.queue,
        summary: dashboardData.summary,
        signalCards: dashboardData.signalCards,
      });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to load operational dashboard",
        error: error?.message || String(error),
      });
    }
  });

  router.get("/director/masonry/images", async (req, res) => {
    try {
      const images = await listGlobalMasonryImages();
      return res.json({
        generatedAt: new Date().toISOString(),
        prefix: GLOBAL_MASONRY_PREFIX,
        images,
      });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to load masonry images",
        error: error?.message || String(error),
      });
    }
  });

  router.post("/director/masonry/upload-url", ...adminGuard, async (req, res) => {
    const userId = req.user?.sub;
    const mediaBucket = process.env.MEDIA_BUCKET;
    const fileName = String(req.body?.fileName || "masonry-image").trim();
    const contentType = String(req.body?.contentType || "image/jpeg").trim();
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!mediaBucket) {
      return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
    }
    if (!contentType.startsWith("image/")) {
      return res.status(400).json({ message: "Only image uploads are allowed." });
    }

    const safeBase = buildSafeBaseName(fileName || "masonry-image");
    const extension =
      contentType.includes("png")
        ? "png"
        : contentType.includes("webp")
          ? "webp"
          : contentType.includes("gif")
            ? "gif"
            : "jpg";
    const key = `${GLOBAL_MASONRY_PREFIX}${safeBase}-${Date.now()}.${extension}`;

    try {
      const command = new PutObjectCommand({
        Bucket: mediaBucket,
        Key: key,
        ContentType: contentType,
      });
      const url = await getSignedUrl(s3Client, command, {
        expiresIn: GLOBAL_MASONRY_URL_EXPIRATION_SECONDS,
      });
      return res.json({ bucket: mediaBucket, key, url });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to create masonry upload URL",
        error: error?.message || String(error),
      });
    }
  });

  router.post("/director/masonry/images/delete", ...adminGuard, async (req, res) => {
    const userId = req.user?.sub;
    const mediaBucket = process.env.MEDIA_BUCKET;
    const key = String(req.body?.key || "").trim();
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!mediaBucket) {
      return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
    }
    if (!isMasonryImageKey(key)) {
      return res.status(400).json({ message: "Invalid masonry key." });
    }
    try {
      await s3Client.send(new DeleteObjectCommand({ Bucket: mediaBucket, Key: key }));
      return res.json({ deletedAt: new Date().toISOString(), key });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to delete masonry image",
        error: error?.message || String(error),
      });
    }
  });

  router.post("/director/jobs/prioritize", ...adminGuard, async (req, res) => {
    const userId = req.user?.sub;
    const jobKey = String(req.body?.jobKey || "").trim();
    const priorityRaw = String(req.body?.priority || DEFAULT_JOB_PRIORITY)
      .trim()
      .toLowerCase();
    const priority = ALLOWED_JOB_PRIORITIES.has(priorityRaw)
      ? priorityRaw
      : DEFAULT_JOB_PRIORITY;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!jobKey) {
      return res.status(400).json({ message: "jobKey is required" });
    }
    try {
      const existingItem = await getItem({
        pk: buildMediaPk(userId),
        sk: buildMediaSk("JOB", jobKey),
      });
      if (!existingItem) {
        return res.status(404).json({ message: "Job not found" });
      }
      const nowIso = new Date().toISOString();
      const existingExtra = { ...existingItem };
      delete existingExtra.pk;
      delete existingExtra.sk;
      delete existingExtra.type;
      delete existingExtra.key;
      await putMediaItem({
        userId,
        type: "JOB",
        key: jobKey,
        extra: {
          ...existingExtra,
          priority,
          priorityRank: 0,
          directorPriority: true,
          createdAt: existingItem.createdAt || nowIso,
          updatedAt: nowIso,
        },
      });
      return res.json({ updatedAt: nowIso, job: { jobKey, priority } });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to prioritize job",
        error: error?.message || String(error),
      });
    }
  });

  router.post("/director/story/sessions/pin", ...adminGuard, async (req, res) => {
    const userId = req.user?.sub;
    const sessionId = String(req.body?.sessionId || "").trim();
    const pinned = Boolean(req.body?.pinned);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!sessionId) {
      return res.status(400).json({ message: "sessionId is required" });
    }
    if (!mediaTable) {
      return res.status(500).json({ message: "MEDIA_TABLE is not set" });
    }
    try {
      const key = {
        pk: buildMediaPk(userId),
        sk: buildStorySessionSk(sessionId),
      };
      const existingItem = await getItem(key);
      if (!existingItem) {
        return res.status(404).json({ message: "Story session not found" });
      }
      const nowIso = new Date().toISOString();
      await dynamoClient.send(
        new PutCommand({
          TableName: mediaTable,
          Item: { ...existingItem, directorPinned: pinned, updatedAt: nowIso },
        })
      );
      return res.json({ updatedAt: nowIso, session: { sessionId, pinned } });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to update story session",
        error: error?.message || String(error),
      });
    }
  });

  return router;
};
