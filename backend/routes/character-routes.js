const { randomUUID } = require("crypto");
const { requireAuth, requireParam } = require("../lib/route-guards");
const { handleRouteError } = require("../lib/error-handler");

const CHARACTER_TYPE = "CHARACTER";

const normalizeStr = (v) => (v && typeof v === "string" ? v.trim() : "");

const normalizeCharacterItem = (item = {}) => ({
  id: normalizeStr(item.id || item.key || ""),
  name: normalizeStr(item.name || ""),
  source: normalizeStr(item.source || "user") || "user",
  defaultImageModel: normalizeStr(item.defaultImageModel || ""),
  defaultImagePrompt: normalizeStr(item.defaultImagePrompt || ""),
  defaultVideoModel: normalizeStr(item.defaultVideoModel || ""),
  defaultVideoPrompt: normalizeStr(item.defaultVideoPrompt || ""),
  defaultLoraProfileId: normalizeStr(item.defaultLoraProfileId || "") || null,
  signatureTraits: normalizeStr(item.signatureTraits || ""),
  eyeDetails: normalizeStr(item.eyeDetails || ""),
  hairDetails: normalizeStr(item.hairDetails || item.hairStyles || ""),
  outfitMaterials: normalizeStr(item.outfitMaterials || ""),
  accessories: normalizeStr(item.accessories || ""),
  styleReference: normalizeStr(item.styleReference || ""),
  markings: normalizeStr(item.markings || ""),
  createdAt: normalizeStr(item.createdAt || ""),
  updatedAt: normalizeStr(item.updatedAt || ""),
});

// Map seed-store system characters to the unified Character shape
const normalizeSystemCharacter = (char = {}) => ({
  id: normalizeStr(char.id || ""),
  name: normalizeStr(char.name || ""),
  source: "system",
  defaultImageModel: "",
  defaultImagePrompt: normalizeStr(char.identityPrompt || char.storyBasePrompt || ""),
  defaultVideoModel: "",
  defaultVideoPrompt: "",
  defaultLoraProfileId: null,
  signatureTraits: normalizeStr(char.signatureTraits || ""),
  eyeDetails: normalizeStr(char.eyeDetails || ""),
  hairDetails: normalizeStr(char.hairDetails || char.hairStyles || ""),
  outfitMaterials: normalizeStr(char.outfitMaterials || ""),
  accessories: normalizeStr(char.accessories || ""),
  styleReference: normalizeStr(char.styleReference || ""),
  markings: normalizeStr(char.markings || ""),
  createdAt: "",
  updatedAt: "",
});

const registerCharacterRoutes = (app, deps) => {
  const {
    buildMediaPk,
    buildMediaSk,
    putMediaItem,
    deleteMediaItem,
    queryBySkPrefix,
    getItem,
    ensureStoryCharacters,
  } = deps;

  // ─── GET /characters ────────────────────────────────────────────────────────
  // Returns system seed characters + user-created characters.
  app.get("/characters", deps.requireUserMiddleware, async (req, res) => {
    const userId = req.user?.sub;
    if (!requireAuth(res, userId)) return;

    try {
      const [rawUser, systemChars] = await Promise.all([
        queryBySkPrefix({
          pk: buildMediaPk(userId),
          skPrefix: `${CHARACTER_TYPE}#`,
          limit: 200,
          scanForward: false,
        }),
        ensureStoryCharacters().catch(() => []),
      ]);

      const userCharacters = rawUser.map(normalizeCharacterItem);
      const userIds = new Set(userCharacters.map((c) => c.id));
      // Merge: system chars that the user hasn't overridden come first
      const systemCharacters = systemChars
        .filter((c) => !userIds.has(c.id))
        .map(normalizeSystemCharacter);

      return res.json({ characters: [...systemCharacters, ...userCharacters] });
    } catch (error) {
      return handleRouteError(res, "list characters", error);
    }
  });

  // ─── POST /characters ────────────────────────────────────────────────────────
  // Create a new user character.
  app.post("/characters", deps.requireUserMiddleware, async (req, res) => {
    const userId = req.user?.sub;
    if (!requireAuth(res, userId)) return;

    const name = normalizeStr(req.body?.name || "");
    if (!requireParam(res, "name", name)) return;

    const id = randomUUID();
    const now = new Date().toISOString();
    const data = {
      id,
      name,
      source: "user",
      defaultImageModel: normalizeStr(req.body?.defaultImageModel || ""),
      defaultImagePrompt: normalizeStr(req.body?.defaultImagePrompt || ""),
      defaultVideoModel: normalizeStr(req.body?.defaultVideoModel || ""),
      defaultVideoPrompt: normalizeStr(req.body?.defaultVideoPrompt || ""),
      defaultLoraProfileId: normalizeStr(req.body?.defaultLoraProfileId || "") || null,
      signatureTraits: normalizeStr(req.body?.signatureTraits || ""),
      eyeDetails: normalizeStr(req.body?.eyeDetails || ""),
      hairDetails: normalizeStr(req.body?.hairDetails || ""),
      outfitMaterials: normalizeStr(req.body?.outfitMaterials || ""),
      accessories: normalizeStr(req.body?.accessories || ""),
      styleReference: normalizeStr(req.body?.styleReference || ""),
      markings: normalizeStr(req.body?.markings || ""),
      createdAt: now,
      updatedAt: now,
    };

    try {
      await putMediaItem({ userId, type: CHARACTER_TYPE, key: id, extra: data });
      return res.status(201).json({ character: normalizeCharacterItem(data) });
    } catch (error) {
      return handleRouteError(res, "create character", error);
    }
  });

  // ─── GET /characters/:id ─────────────────────────────────────────────────────
  app.get("/characters/:id", deps.requireUserMiddleware, async (req, res) => {
    const userId = req.user?.sub;
    const charId = normalizeStr(req.params?.id || "");
    if (!requireAuth(res, userId)) return;
    if (!requireParam(res, "id", charId)) return;

    try {
      const item = await getItem({
        pk: buildMediaPk(userId),
        sk: buildMediaSk(CHARACTER_TYPE, charId),
      });
      if (item) return res.json({ character: normalizeCharacterItem(item) });

      // Fall back to system character
      const systemChars = await ensureStoryCharacters().catch(() => []);
      const sysChar = systemChars.find((c) => c.id === charId);
      if (sysChar) return res.json({ character: normalizeSystemCharacter(sysChar) });

      return res.status(404).json({ message: "Character not found" });
    } catch (error) {
      return handleRouteError(res, "get character", error);
    }
  });

  // ─── PUT /characters/:id ─────────────────────────────────────────────────────
  // Merge-update a user character. System characters cannot be updated.
  app.put("/characters/:id", deps.requireUserMiddleware, async (req, res) => {
    const userId = req.user?.sub;
    const charId = normalizeStr(req.params?.id || "");
    if (!requireAuth(res, userId)) return;
    if (!requireParam(res, "id", charId)) return;

    try {
      const existing = await getItem({
        pk: buildMediaPk(userId),
        sk: buildMediaSk(CHARACTER_TYPE, charId),
      });
      if (!existing) {
        return res.status(404).json({ message: "Character not found or not editable (system characters cannot be modified)" });
      }

      const b = req.body || {};
      const patch = (field, fallback) =>
        b[field] !== undefined ? normalizeStr(b[field]) : normalizeStr(fallback || "");

      const updated = {
        ...existing,
        name: normalizeStr(b.name || existing.name || ""),
        defaultImageModel: patch("defaultImageModel", existing.defaultImageModel),
        defaultImagePrompt: patch("defaultImagePrompt", existing.defaultImagePrompt),
        defaultVideoModel: patch("defaultVideoModel", existing.defaultVideoModel),
        defaultVideoPrompt: patch("defaultVideoPrompt", existing.defaultVideoPrompt),
        defaultLoraProfileId:
          b.defaultLoraProfileId !== undefined
            ? (normalizeStr(b.defaultLoraProfileId) || null)
            : existing.defaultLoraProfileId,
        signatureTraits: patch("signatureTraits", existing.signatureTraits),
        eyeDetails: patch("eyeDetails", existing.eyeDetails),
        hairDetails: patch("hairDetails", existing.hairDetails),
        outfitMaterials: patch("outfitMaterials", existing.outfitMaterials),
        accessories: patch("accessories", existing.accessories),
        styleReference: patch("styleReference", existing.styleReference),
        markings: patch("markings", existing.markings),
        updatedAt: new Date().toISOString(),
      };

      await putMediaItem({ userId, type: CHARACTER_TYPE, key: charId, extra: updated });
      return res.json({ character: normalizeCharacterItem(updated) });
    } catch (error) {
      return handleRouteError(res, "update character", error);
    }
  });

  // ─── DELETE /characters/:id ──────────────────────────────────────────────────
  // Only user-owned characters can be deleted.
  app.delete("/characters/:id", deps.requireUserMiddleware, async (req, res) => {
    const userId = req.user?.sub;
    const charId = normalizeStr(req.params?.id || "");
    if (!requireAuth(res, userId)) return;
    if (!requireParam(res, "id", charId)) return;

    try {
      const existing = await getItem({
        pk: buildMediaPk(userId),
        sk: buildMediaSk(CHARACTER_TYPE, charId),
      });
      if (!existing) {
        return res.status(404).json({ message: "Character not found (system characters cannot be deleted)" });
      }
      await deleteMediaItem({ userId, type: CHARACTER_TYPE, key: charId });
      return res.json({ deleted: true, id: charId });
    } catch (error) {
      return handleRouteError(res, "delete character", error);
    }
  });
};

module.exports = registerCharacterRoutes;
