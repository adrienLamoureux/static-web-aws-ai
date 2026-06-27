"use strict";

/**
 * Small tool dispatchers for the Agent.
 *
 * The heavy `generate_image` dispatcher lives in `./generate-image.js`.
 * This file holds the smaller ones grouped by surface area:
 *   - set_theme            (client-action)
 *   - continue_story       (intent)
 *   - illustrate_scene     (intent)
 *   - recall_favorites     (server-dispatch — user's IMG history)
 *   - generate_music       (intent — story-scoped)
 *   - browse_gallery       (server-dispatch — public shared images)
 *
 * Each dispatcher returns the same `{ok, result?, error?}` shape that the
 * top-level router in `agent-tools.js` consumes.
 */

const SUPPORTED_THEMES = [
  "sakura",
  "moonrise",
  "bamboo",
  "ember",
  "void",
  "glacier",
  "dusk",
  "aurora",
  "crimson",
  "storm",
];

// ─── set_theme ─────────────────────────────────────────────────────────────
const dispatchSetTheme = async ({ args, deps, userId }) => {
  const theme = String(args.theme || "").trim();
  if (!SUPPORTED_THEMES.includes(theme)) {
    return { ok: false, error: `unsupported_theme:${theme}` };
  }
  const brightness =
    args.brightness === "light" ? "light" : args.brightness === "dark" ? "dark" : null;

  if (deps.agentState && userId) {
    deps.agentState.patch(userId, { theme }).catch(() => {});
  }

  return {
    ok: true,
    result: {
      clientAction: "set_theme",
      theme,
      ...(brightness ? { brightness } : {}),
    },
  };
};

// ─── continue_story (intent) ───────────────────────────────────────────────
const dispatchContinueStory = async ({ args, deps, userId }) => {
  const content = String(args.content || "").trim();
  if (!content) return { ok: false, error: "content_required" };
  if (content.length > 400) return { ok: false, error: "content_too_long" };

  let sessionId = String(args.sessionId || "").trim();
  let sessionTitle = null;

  if (!sessionId && deps.queryBySkPrefix && deps.buildMediaPk && userId) {
    try {
      const sessions = await deps.queryBySkPrefix(deps.buildMediaPk(userId), "SESSION#", 16);
      const sessionRecords = (sessions || []).filter(
        (s) => s.sk?.indexOf("#MSG#") === -1 && s.sk?.indexOf("#SCENE#") === -1
      );
      const latest = sessionRecords.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
      if (latest) {
        sessionId = latest.sessionId || latest.sk?.replace("SESSION#", "") || "";
        sessionTitle = latest.title || null;
      }
    } catch {
      // ignore — frontend will prompt user to pick a session
    }
  }

  return {
    ok: true,
    result: {
      clientAction: "continue_story",
      requiresConfirm: true,
      sessionId: sessionId || null,
      sessionTitle,
      content,
    },
  };
};

// ─── illustrate_scene (intent) ─────────────────────────────────────────────
const dispatchIllustrateScene = async ({ args, deps, userId }) => {
  const sessionId = String(args.sessionId || "").trim();
  const sceneId = String(args.sceneId || "").trim();
  if (!sessionId) return { ok: false, error: "sessionId_required" };
  if (!sceneId) return { ok: false, error: "sceneId_required" };

  let style = args.style;
  if (!style && deps.agentState && userId) {
    try {
      const prefs = await deps.agentState.load(userId);
      if (prefs?.lastStyle) style = prefs.lastStyle;
    } catch {
      // ignore
    }
  }

  return {
    ok: true,
    result: {
      clientAction: "illustrate_scene",
      requiresConfirm: true,
      sessionId,
      sceneId,
      style: style || "anime",
    },
  };
};

// ─── recall_favorites (server-dispatch — user's IMG history) ──────────────
const dispatchRecallFavorites = async ({ args, deps, userId }) => {
  if (!userId) return { ok: false, error: "unauthorized" };
  const limit = Math.min(Math.max(Math.round(Number(args.limit) || 8), 1), 12);

  const { queryMediaItems, s3Client, getSignedUrl, GetObjectCommand } = deps;
  const mediaBucket = process.env.MEDIA_BUCKET;
  if (!queryMediaItems) return { ok: false, error: "media_store_unavailable" };

  let items = [];
  try {
    items = (await queryMediaItems({ userId, type: "IMG" })) || [];
  } catch {
    return { ok: false, error: "favorites_fetch_failed" };
  }

  const sorted = items
    .filter((i) => i?.key)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, limit);

  const enriched = await Promise.all(
    sorted.map(async (item) => {
      let signedUrl = null;
      if (mediaBucket && s3Client && getSignedUrl && GetObjectCommand) {
        try {
          signedUrl = await getSignedUrl(
            s3Client,
            new GetObjectCommand({ Bucket: mediaBucket, Key: item.key }),
            { expiresIn: 900 }
          );
        } catch {
          signedUrl = null;
        }
      }
      return {
        key: item.key,
        prompt: item.prompt || "",
        model: item.model || null,
        createdAt: item.createdAt || null,
        ...(signedUrl ? { url: signedUrl } : {}),
      };
    })
  );

  return {
    ok: true,
    result: {
      clientAction: "recall_favorites",
      count: enriched.length,
      items: enriched,
    },
  };
};

// ─── generate_music (intent — story-scoped) ──────────────────────────────
const dispatchGenerateMusic = async ({ args, deps, userId }) => {
  if (!userId) return { ok: false, error: "unauthorized" };
  const mood = String(args.mood || "").trim();
  if (!mood) return { ok: false, error: "mood_required" };
  const description = String(args.description || "")
    .trim()
    .slice(0, 200);

  let sessionId = String(args.sessionId || "").trim();
  let sceneId = String(args.sceneId || "").trim();
  let sessionTitle = null;

  if ((!sessionId || !sceneId) && deps.queryBySkPrefix && deps.buildMediaPk) {
    try {
      const sessions = await deps.queryBySkPrefix(deps.buildMediaPk(userId), "SESSION#", 32);
      const sessionRecords = (sessions || []).filter(
        (s) =>
          s.sk?.indexOf("#MSG#") === -1 &&
          s.sk?.indexOf("#SCENE#") === -1 &&
          s.sk?.startsWith("SESSION#")
      );
      if (!sessionId) {
        const latest = sessionRecords.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
        if (latest) {
          sessionId = latest.sessionId || latest.sk.replace("SESSION#", "");
          sessionTitle = latest.title || null;
        }
      } else {
        const match = sessionRecords.find(
          (s) => s.sessionId === sessionId || s.sk === `SESSION#${sessionId}`
        );
        if (match) sessionTitle = match.title || null;
      }
      if (sessionId && !sceneId) {
        const sceneItems = (sessions || []).filter((s) =>
          s.sk?.startsWith(`SESSION#${sessionId}#SCENE#`)
        );
        const latestScene = sceneItems.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
        if (latestScene) {
          sceneId = latestScene.sceneId || latestScene.sk.split("#SCENE#")[1] || "";
        }
      }
    } catch {
      // ignore; will surface no_active_scene below
    }
  }

  if (!sessionId || !sceneId) {
    return { ok: false, error: "no_active_scene" };
  }

  return {
    ok: true,
    result: {
      clientAction: "generate_music",
      requiresConfirm: true,
      sessionId,
      sceneId,
      sessionTitle,
      mood,
      description,
    },
  };
};

// ─── browse_gallery (server-dispatch — public shared images) ─────────────
const dispatchBrowseGallery = async ({ args, deps }) => {
  const limit = Math.min(Math.max(Math.round(Number(args.limit) || 8), 1), 12);
  const { s3Client, ListObjectsV2Command, GetObjectCommand, getSignedUrl } = deps;
  const bucket = process.env.MEDIA_BUCKET;
  if (!bucket || !s3Client || !ListObjectsV2Command) {
    return { ok: false, error: "gallery_unavailable" };
  }

  const SHARED_PREFIX = "shared/images/";
  let response;
  try {
    response = await s3Client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: SHARED_PREFIX, MaxKeys: 60 })
    );
  } catch {
    return { ok: false, error: "gallery_fetch_failed" };
  }

  const isImage = (k = "") => /\.(png|jpe?g|webp|avif)$/i.test(k);
  const candidates = (response?.Contents || [])
    .filter((c) => c.Key && c.Key !== SHARED_PREFIX && isImage(c.Key))
    .sort((a, b) => {
      const at = a.LastModified ? new Date(a.LastModified).getTime() : 0;
      const bt = b.LastModified ? new Date(b.LastModified).getTime() : 0;
      return bt - at;
    })
    .slice(0, limit);

  const items = await Promise.all(
    candidates.map(async (c) => {
      try {
        const url = await getSignedUrl(
          s3Client,
          new GetObjectCommand({ Bucket: bucket, Key: c.Key }),
          { expiresIn: 900 }
        );
        return { key: c.Key, url };
      } catch {
        return { key: c.Key };
      }
    })
  );

  return {
    ok: true,
    result: {
      clientAction: "browse_gallery",
      count: items.length,
      items,
    },
  };
};

module.exports = {
  SUPPORTED_THEMES,
  dispatchSetTheme,
  dispatchContinueStory,
  dispatchIllustrateScene,
  dispatchRecallFavorites,
  dispatchGenerateMusic,
  dispatchBrowseGallery,
};
