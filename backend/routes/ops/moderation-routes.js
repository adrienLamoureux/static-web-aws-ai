"use strict";

const { Router } = require("express");
const { ScanCommand } = require("@aws-sdk/lib-dynamodb");

const SHARED_IMAGE_PREFIX = "shared/images/";
const SHARED_VIDEO_PREFIX = "shared/videos/";
const MODERATION_URL_EXPIRATION_SECONDS = 900; // 15 minutes
const DEFAULT_LIST_LIMIT = 120;
const MAX_LIST_LIMIT = 500;

/**
 * Registered under /ops/director/media by operations-routes.js.
 *
 * Provides admin endpoints for listing and deleting shared media (images + videos).
 */
module.exports = function registerModerationRoutes(deps) {
  const {
    s3Client,
    getSignedUrl,
    GetObjectCommand,
    ListObjectsV2Command,
    DeleteObjectCommand,
    dynamoClient,
    mediaTable,
  } = deps;

  const { requireUserMiddleware, requireAdminMiddleware } = deps;
  const adminGuard = [requireUserMiddleware, requireAdminMiddleware];

  const mediaBucket = () => process.env.MEDIA_BUCKET;

  const toLimit = (value, defaultVal, maxVal) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return defaultVal;
    return Math.min(Math.trunc(parsed), maxVal);
  };

  const toIsoString = (value) => {
    const d = value ? new Date(value) : null;
    return d && Number.isFinite(d.getTime()) ? d.toISOString() : "";
  };

  /**
   * Delete all DynamoDB FAVIMG/FAVVID items that have sk === favoriteSkValue.
   * (Each user who favorited has pk=USER#<sub>, sk=<favoriteSkValue>)
   */
  const deleteFavoritesForKey = async (favoriteSkValue) => {
    if (!mediaTable || !dynamoClient) return;
    try {
      const { DeleteCommand } = require("@aws-sdk/lib-dynamodb");
      const response = await dynamoClient.send(
        new ScanCommand({
          TableName: mediaTable,
          FilterExpression: "sk = :sk",
          ExpressionAttributeValues: { ":sk": favoriteSkValue },
          ProjectionExpression: "pk, sk",
        })
      );
      const items = response.Items || [];
      await Promise.all(
        items.map((item) =>
          dynamoClient
            .send(new DeleteCommand({ TableName: mediaTable, Key: { pk: item.pk, sk: item.sk } }))
            .catch(() => {})
        )
      );
    } catch {
      // Swallow
    }
  };

  const router = Router();

  // ── GET /shared/images ────────────────────────────────────────────────────
  router.get("/shared/images", ...adminGuard, async (req, res) => {
    const bucket = mediaBucket();
    const limit = toLimit(req.query?.limit, DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);
    const continuationToken = req.query?.continuationToken || undefined;

    if (!bucket) {
      return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
    }

    try {
      const listParams = {
        Bucket: bucket,
        Prefix: SHARED_IMAGE_PREFIX,
        MaxKeys: limit,
      };
      if (continuationToken) {
        listParams.ContinuationToken = continuationToken;
      }

      const response = await s3Client.send(new ListObjectsV2Command(listParams));
      const contents = (response.Contents || []).filter(
        (item) => item.Key && item.Key !== SHARED_IMAGE_PREFIX
      );

      const images = await Promise.all(
        contents.map(async (item) => {
          const url = await getSignedUrl(
            s3Client,
            new GetObjectCommand({ Bucket: bucket, Key: item.Key }),
            { expiresIn: MODERATION_URL_EXPIRATION_SECONDS }
          );
          return {
            key: item.Key,
            url,
            size: Number(item.Size || 0),
            lastModified: toIsoString(item.LastModified),
          };
        })
      );

      return res.json({
        images,
        nextToken: response.NextContinuationToken || null,
      });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to list shared images",
        error: error?.message || String(error),
      });
    }
  });

  // ── POST /shared/images/delete ────────────────────────────────────────────
  router.post("/shared/images/delete", ...adminGuard, async (req, res) => {
    const bucket = mediaBucket();
    const key = String(req.body?.key || "").trim();

    if (!bucket) {
      return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
    }
    if (!key) {
      return res.status(400).json({ message: "key is required" });
    }
    if (!key.startsWith(SHARED_IMAGE_PREFIX)) {
      return res.status(400).json({ message: "key must start with shared/images/" });
    }

    try {
      await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));

      // Remove all user favorite references to this image (best-effort)
      const favoriteSk = `FAVIMG#${key}`;
      await deleteFavoritesForKey(favoriteSk);

      return res.json({ deleted: true, key });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to delete shared image",
        error: error?.message || String(error),
      });
    }
  });

  // ── GET /shared/videos ────────────────────────────────────────────────────
  router.get("/shared/videos", ...adminGuard, async (req, res) => {
    const bucket = mediaBucket();
    const limit = toLimit(req.query?.limit, DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);
    const continuationToken = req.query?.continuationToken || undefined;

    if (!bucket) {
      return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
    }

    try {
      const listParams = {
        Bucket: bucket,
        Prefix: SHARED_VIDEO_PREFIX,
        MaxKeys: limit,
      };
      if (continuationToken) {
        listParams.ContinuationToken = continuationToken;
      }

      const response = await s3Client.send(new ListObjectsV2Command(listParams));
      const contents = (response.Contents || []).filter(
        (item) => item.Key && item.Key !== SHARED_VIDEO_PREFIX
      );

      const videos = await Promise.all(
        contents.map(async (item) => {
          const url = await getSignedUrl(
            s3Client,
            new GetObjectCommand({ Bucket: bucket, Key: item.Key }),
            { expiresIn: MODERATION_URL_EXPIRATION_SECONDS }
          );
          return {
            key: item.Key,
            url,
            size: Number(item.Size || 0),
            lastModified: toIsoString(item.LastModified),
          };
        })
      );

      return res.json({
        videos,
        nextToken: response.NextContinuationToken || null,
      });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to list shared videos",
        error: error?.message || String(error),
      });
    }
  });

  // ── POST /shared/videos/delete ────────────────────────────────────────────
  router.post("/shared/videos/delete", ...adminGuard, async (req, res) => {
    const bucket = mediaBucket();
    const key = String(req.body?.key || "").trim();

    if (!bucket) {
      return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
    }
    if (!key) {
      return res.status(400).json({ message: "key is required" });
    }
    if (!key.startsWith(SHARED_VIDEO_PREFIX)) {
      return res.status(400).json({ message: "key must start with shared/videos/" });
    }

    try {
      await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));

      return res.json({ deleted: true, key });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to delete shared video",
        error: error?.message || String(error),
      });
    }
  });

  return router;
};
