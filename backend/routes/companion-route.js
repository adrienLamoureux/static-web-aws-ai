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

module.exports = (app, deps) => {
  const { bedrockClient, InvokeModelCommand, promptHelperModelId } = deps;

  // POST /api/companion/chat
  // Body: { message: string, context?: string }
  // Returns: { text: string, emotion: string }
  app.post("/api/companion/chat", async (req, res) => {
    const userMessage = (req.body?.message || "").trim() || "Hello!";

    const command = new InvokeModelCommand({
      modelId: promptHelperModelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 200,
        temperature: 0.85,
        system: SYSTEM_PROMPT,
        messages: [
          { role: "user", content: [{ type: "text", text: userMessage }] },
        ],
      }),
    });

    let rawText;
    try {
      const response = await bedrockClient.send(command);
      const body = JSON.parse(new TextDecoder().decode(response.body));
      rawText = (body?.content || [])
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
};
