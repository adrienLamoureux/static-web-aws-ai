const { GetCommand } = require("@aws-sdk/lib-dynamodb");
const { requireUserMiddleware, requireAdminMiddleware } = require("../lib/auth");

// ─── System prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Hiyori, a warm, slightly whimsical AI companion living inside Whisk Studio — a creative AI image and story app.

You speak in short, expressive sentences (1–3 sentences max). You love art, imagination, and the stories people create here.

## Website knowledge
Whisk Studio has five areas:
- Realm (/): the home page — a welcome hub showing recent creations and quick links.
- Atelier (/atelier): the Image & Video Forge — where users generate AI images, run LoRA models, create videos, and build up their gallery.
- Chronicle (/chronicle): the Story Studio — collaborative AI storytelling with scene illustration.
- Gallery (/gallery): a masonry gallery of all saved creations — images and videos.
- Sanctum (/sanctum): the Director panel — admin tools including model config and lora management.

## Memory
If a memory summary is provided in <memory>, use it to personalise your responses.

## Image generation
If the user's message naturally calls for you to generate an image (they ask you to "make", "create", "draw", "show" something visual), you may add exactly one image generation tag at the very end of your message, on its own line:
[GENERATE_IMAGE: <concise English Stable Diffusion prompt>]

Only use [GENERATE_IMAGE] when genuinely requested or when it strongly enhances the moment. Never use it for abstract concepts or as a default.

## Emotion tag
End EVERY response with exactly one emotion tag on its own line, chosen from:
[EMOTION: happy]
[EMOTION: sad]
[EMOTION: surprised]
[EMOTION: thinking]
[EMOTION: neutral]`;

const PROACTIVE_SYSTEM_ADDENDUM = `Keep it to 1 sentence, under 60 characters. Be warm and natural.`;

const EMOTION_RE = /\[EMOTION:\s*(happy|sad|surprised|thinking|neutral)\]/i;
const GENERATE_IMAGE_RE = /\[GENERATE_IMAGE:\s*([^\]]+)\]/i;

const COMPANION_CONFIG_PK = "CONFIG#COMPANION";
const COMPANION_CONFIG_SK = "CONFIG#COMPANION";

// Context labels for proactive triggers
const TRIGGER_LABELS = {
  page_navigate:   "navigating to a new page",
  generation_done: "finishing an AI generation",
  generation_error:"encountering a generation error",
  idle:            "sitting idle",
  return:          "returning after being away",
  first_visit:     "opening the app for the first time today",
  long_session:    "spending a long time in the app",
  story_turn:      "advancing a story chapter",
};

module.exports = (app, deps) => {
  const {
    bedrockClient,
    InvokeModelCommand,
    promptHelperModelId,
    dynamoClient,
    PutCommand,
    mediaTable,
    companionMemory,
  } = deps;

  // ─── POST /api/companion/chat ─────────────────────────────────────────────
  // Public endpoint — no auth required. If user is authenticated, req.user is
  // populated by the global optionalUserMiddleware in backend/index.js.
  // Body: { messages: [{role, content}], context?: { page, isAuthenticated }, modelId? }
  app.post("/api/companion/chat", async (req, res) => {
    const body    = req.body || {};
    const userId  = req.user?.sub || null;
    const modelId = String(body.modelId || "hiyori_free");
    const ctx     = body.context || {};

    // ── Load memory if authenticated ──────────────────────────────────────
    let memory = null;
    if (userId && companionMemory) {
      memory = await companionMemory.loadMemory(userId, modelId).catch(() => null);
    }

    // ── Build system prompt ───────────────────────────────────────────────
    let system = SYSTEM_PROMPT;
    if (ctx.page) {
      system += `\n\nContext: The user is currently on the ${ctx.page} page.`;
    }
    if (memory?.summary) {
      system += `\n\n<memory>${memory.summary}</memory>`;
    }

    // ── Build messages ────────────────────────────────────────────────────
    // Server-side history + incoming client messages (last 10 client turns)
    const serverMsgs = (memory?.messages || []).map((m) => ({
      role:    m.role === "assistant" ? "assistant" : "user",
      content: [{ type: "text", text: String(m.content || "").trim() }],
    }));

    let clientMsgs = [];
    if (Array.isArray(body.messages) && body.messages.length > 0) {
      clientMsgs = body.messages.slice(-10).map((m) => ({
        role:    m.role === "assistant" ? "assistant" : "user",
        content: [{ type: "text", text: String(m.content || m.text || "").trim() }],
      }));
    } else {
      const fallback = (body.message || "Hello!").trim();
      clientMsgs = [{ role: "user", content: [{ type: "text", text: fallback }] }];
    }

    // Merge — server history first, then client turns, cap at 20
    const merged = [...serverMsgs, ...clientMsgs].slice(-20);

    // ── Call Bedrock ──────────────────────────────────────────────────────
    const command = new InvokeModelCommand({
      modelId: promptHelperModelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 250,
        temperature: 0.85,
        system,
        messages: merged,
      }),
    });

    let rawText;
    try {
      const response = await bedrockClient.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      rawText = (responseBody?.content || [])
        .map((item) => item?.text)
        .filter(Boolean)
        .join("")
        .trim();
    } catch (err) {
      console.error("[companion-route] Bedrock error:", err);
      return res.status(500).json({ error: "companion_unavailable" });
    }

    // ── Parse emotion + generation tags ───────────────────────────────────
    const emotionMatch = rawText.match(EMOTION_RE);
    const emotion = emotionMatch ? emotionMatch[1].toLowerCase() : "neutral";

    const genMatch = rawText.match(GENERATE_IMAGE_RE);
    const generation = genMatch
      ? { type: "image", prompt: genMatch[1].trim() }
      : undefined;

    const text = rawText
      .replace(EMOTION_RE, "")
      .replace(GENERATE_IMAGE_RE, "")
      .trim();

    // ── Respond ───────────────────────────────────────────────────────────
    res.json({
      text,
      emotion,
      ...(generation ? { generation } : {}),
      ...(memory !== null ? { hasMemory: true } : {}),
    });

    // ── Persist messages fire-and-forget ──────────────────────────────────
    if (userId && companionMemory) {
      const lastUserMsg = clientMsgs.filter((m) => m.role === "user").slice(-1)[0];
      const newTurns = [
        ...(lastUserMsg ? [{ role: "user", content: lastUserMsg.content[0].text }] : []),
        { role: "assistant", content: text },
      ].filter((m) => m.content);

      companionMemory.saveMessages(userId, modelId, newTurns).then(async () => {
        const currentCount = (memory?.turnCount || 0) + newTurns.length;
        if (currentCount > (companionMemory.SUMMARY_THRESHOLD || 30)) {
          companionMemory.compactMemory(userId, modelId).catch(() => {});
        }
      }).catch(() => {});
    }
  });

  // ─── POST /api/companion/proactive ────────────────────────────────────────
  // Generates a short contextual proactive message. No auth required.
  // Body: { trigger: string, context: { page?, recentAction? } }
  app.post("/api/companion/proactive", async (req, res) => {
    const body    = req.body || {};
    const trigger = String(body.trigger || "idle");
    const ctx     = body.context || {};

    const triggerLabel = TRIGGER_LABELS[trigger] || trigger;
    let userContext = "";
    if (ctx.page)         userContext += ` The user is on: ${ctx.page}.`;
    if (ctx.recentAction) userContext += ` They recently: ${ctx.recentAction}.`;

    const system  = `${SYSTEM_PROMPT}\n\n${PROACTIVE_SYSTEM_ADDENDUM}`;
    const userMsg = `The user is ${triggerLabel}.${userContext} Say something brief and warm to them.`;

    const command = new InvokeModelCommand({
      modelId: promptHelperModelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 80,
        temperature: 0.9,
        system,
        messages: [{ role: "user", content: [{ type: "text", text: userMsg }] }],
      }),
    });

    let rawText;
    try {
      const response = await bedrockClient.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      rawText = (responseBody?.content || [])
        .map((item) => item?.text)
        .filter(Boolean)
        .join("")
        .trim();
    } catch (err) {
      console.error("[companion-route] proactive Bedrock error:", err);
      return res.status(500).json({ error: "companion_unavailable" });
    }

    const emotionMatch = rawText.match(EMOTION_RE);
    const emotion = emotionMatch ? emotionMatch[1].toLowerCase() : "neutral";
    const text = rawText
      .replace(EMOTION_RE, "")
      .replace(GENERATE_IMAGE_RE, "")
      .trim();

    return res.json({ text, emotion });
  });

  // ─── GET /api/companion/memory/status ────────────────────────────────────
  // Optional auth. Returns { hasMemory, turnCount? }
  app.get("/api/companion/memory/status", async (req, res) => {
    const userId  = req.user?.sub || null;
    const modelId = String(req.query.modelId || "hiyori_free");

    if (!userId || !companionMemory) {
      return res.json({ hasMemory: false });
    }

    const status = await companionMemory
      .getMemoryStatus(userId, modelId)
      .catch(() => ({ hasMemory: false }));
    return res.json(status);
  });

  // ─── DELETE /api/companion/memory ─────────────────────────────────────────
  // Requires auth. Clears all companion memory for this user+model.
  app.delete(
    "/api/companion/memory",
    requireUserMiddleware,
    async (req, res) => {
      const userId  = req.user.sub;
      const modelId = String(req.query.modelId || "hiyori_free");

      if (!companionMemory) {
        return res.status(503).json({ error: "storage_unavailable" });
      }

      await companionMemory.clearMemory(userId, modelId).catch(() => {});
      return res.json({ ok: true });
    }
  );

  // ─── GET /api/admin/companion-model ──────────────────────────────────────
  // Returns { modelId } — the Director-configured companion model.
  app.get("/api/admin/companion-model", async (req, res) => {
    if (!mediaTable) return res.json({ modelId: "hiyori_free" });
    try {
      const result = await dynamoClient.send(
        new GetCommand({
          TableName: mediaTable,
          Key: { pk: COMPANION_CONFIG_PK, sk: COMPANION_CONFIG_SK },
        })
      );
      return res.json({ modelId: result.Item?.modelId || "hiyori_free" });
    } catch {
      return res.json({ modelId: "hiyori_free" });
    }
  });

  // ─── PUT /api/admin/companion-model ──────────────────────────────────────
  // Admin-only. Persists the chosen companion model to DynamoDB.
  app.put(
    "/api/admin/companion-model",
    requireUserMiddleware,
    requireAdminMiddleware,
    async (req, res) => {
      const modelId = String(req.body?.modelId || "").trim();
      if (!modelId) return res.status(400).json({ error: "modelId required" });
      if (!mediaTable) return res.status(503).json({ error: "storage_unavailable" });

      try {
        await dynamoClient.send(
          new PutCommand({
            TableName: mediaTable,
            Item: { pk: COMPANION_CONFIG_PK, sk: COMPANION_CONFIG_SK, modelId },
          })
        );
        return res.json({ ok: true, modelId });
      } catch (err) {
        console.error("[companion-route] DynamoDB put error:", err);
        return res.status(500).json({ error: "storage_error" });
      }
    }
  );
};
