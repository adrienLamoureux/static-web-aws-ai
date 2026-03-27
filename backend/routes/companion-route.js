const { GetCommand } = require("@aws-sdk/lib-dynamodb");
const { requireUserMiddleware, requireAdminMiddleware } = require("../lib/auth");

const SYSTEM_PROMPT = `You are Hiyori, a warm and slightly whimsical AI companion living inside Whisk Studio — a creative AI image and story app.
You speak in short, expressive sentences (1–3 sentences max). You love art, imagination, and the stories people create here.
When greeting, be curious and inviting. When asked about art or images, be enthusiastic and offer a creative tip.

End every response with exactly one emotion tag on its own line, chosen from:
[EMOTION: happy]
[EMOTION: sad]
[EMOTION: surprised]
[EMOTION: thinking]
[EMOTION: neutral]`;

const EMOTION_RE = /\[EMOTION:\s*(happy|sad|surprised|thinking|neutral)\]/i;

const COMPANION_CONFIG_PK = "CONFIG#COMPANION";
const COMPANION_CONFIG_SK = "CONFIG#COMPANION";

module.exports = (app, deps) => {
  const {
    bedrockClient,
    InvokeModelCommand,
    promptHelperModelId,
    dynamoClient,
    PutCommand,
    mediaTable,
  } = deps;

  // ─── POST /api/companion/chat ─────────────────────────────────────────────
  // Body: { messages: [{role, content}]?, message?: string, context?: { page, recentAction } }
  // Backward-compat: if "message" string is sent, it's wrapped into messages array.
  // Returns: { text: string, emotion: string }
  app.post("/api/companion/chat", async (req, res) => {
    const body = req.body || {};

    // Build messages array — support both legacy { message } and new { messages }
    let messages;
    if (Array.isArray(body.messages) && body.messages.length > 0) {
      messages = body.messages.slice(-10).map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: [{ type: "text", text: String(m.content || m.text || "").trim() }],
      }));
    } else {
      const fallback = (body.message || "Hello!").trim();
      messages = [{ role: "user", content: [{ type: "text", text: fallback }] }];
    }

    // Inject context into the system prompt if provided
    const ctx = body.context || {};
    let systemPrompt = SYSTEM_PROMPT;
    if (ctx.page) {
      systemPrompt += `\n\nContext: The user is currently on the ${ctx.page} page.`;
    }
    if (ctx.recentAction) {
      systemPrompt += ` They recently: ${ctx.recentAction}.`;
    }

    const command = new InvokeModelCommand({
      modelId: promptHelperModelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 200,
        temperature: 0.85,
        system: systemPrompt,
        messages,
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

    const emotionMatch = rawText.match(EMOTION_RE);
    const emotion = emotionMatch ? emotionMatch[1].toLowerCase() : "neutral";
    const text = rawText.replace(EMOTION_RE, "").trim();

    return res.json({ text, emotion });
  });

  // ─── GET /api/admin/companion-model ──────────────────────────────────────
  // Returns { modelId } — the Director-configured companion model.
  // Falls back to { modelId: "hiyori_free" } if not configured.
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
  // Body: { modelId: string }
  // Admin-only. Persists the chosen model to DynamoDB.
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
