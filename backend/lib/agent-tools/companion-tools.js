"use strict";

/**
 * companion-tools — new dispatchers introduced for Companion Mode.
 *
 * Available in every mode (so a user can say "what can you do?" or
 * "show me what I made" from agent mode too), but the system prompt
 * addendum in companion mode encourages their use more often.
 *
 * Tools shipped here (v0):
 *   - view_my_creations  (server-dispatch — user's recent IMG items)
 *   - what_can_you_do    (server-dispatch — static capability list, no LLM)
 *
 * Future tools (parked for v1): open_story_session, read_scene,
 * share_image, unshare_image, delete_image, change_brightness, sign_out.
 */

// ─── view_my_creations ─────────────────────────────────────────────────────
// Pulls the user's recent IMG items + signs top-N URLs. Distinct from
// recall_favorites in *intent*: this is "show me MY library" (browse,
// reminisce); recall_favorites is "pattern-spot what I've been making".
// Same shape, different framing in the agent's reply.
const dispatchViewMyCreations = async ({ args, deps, userId }) => {
  if (!userId) return { ok: false, error: "unauthorized" };
  const limit = Math.min(Math.max(Math.round(Number(args.limit) || 8), 1), 12);

  const { queryMediaItems, s3Client, getSignedUrl, GetObjectCommand } = deps;
  const mediaBucket = process.env.MEDIA_BUCKET;
  if (!queryMediaItems) return { ok: false, error: "media_store_unavailable" };

  let items = [];
  try {
    items = (await queryMediaItems({ userId, type: "IMG" })) || [];
  } catch {
    return { ok: false, error: "creations_fetch_failed" };
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
      clientAction: "view_my_creations",
      count: enriched.length,
      items: enriched,
    },
  };
};

// ─── what_can_you_do ───────────────────────────────────────────────────────
// Static capability list. NO LLM call — the agent calls this tool, the
// dispatcher returns the canned content, and the closing turn (or the
// agent itself when it sees the tool result) phrases it for the user.
//
// The two-string return (`title` + `items`) lets the frontend render
// a structured "menu" card in companion mode, while the agent can still
// narrate it conversationally.
const dispatchWhatCanYouDo = async () => ({
  ok: true,
  result: {
    clientAction: "what_can_you_do",
    title: "Here's what we can do together",
    items: [
      { label: "Make an image", hint: "describe a scene, vibe, character" },
      { label: "Continue a story", hint: "narrate the next beat" },
      { label: "Illustrate a scene", hint: "name a chapter you've written" },
      { label: "Score a scene", hint: "pick a mood — melancholic, epic, playful" },
      { label: "Show your recent creations", hint: '"what did I make yesterday?"' },
      { label: "Pull up the public gallery", hint: '"show me what others are making"' },
      { label: "Find your favorites", hint: '"recall my favorites"' },
      { label: "Change the theme", hint: '"make it cozier" or "spookier"' },
    ],
  },
});

module.exports = {
  dispatchViewMyCreations,
  dispatchWhatCanYouDo,
};
