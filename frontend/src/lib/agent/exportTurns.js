/**
 * exportTurns — serialise an AgentContext turn array to markdown and trigger
 * a browser download.
 *
 * Format:
 *   - User turns become `**You:** <text>`
 *   - Agent turns become `**Hiyori:** <text>` (skips canned and error panels)
 *   - tool-result image panels render as embedded images with prompt captions
 *   - intent / theme / recall / gallery results render as italic notes
 *   - thinking / confirm-all turns are dropped (they're transient UI)
 *
 * Plain `.md` so it pastes into any markdown editor or GitHub gist.
 */

const formatDate = (ts) => {
  if (!ts) return "";
  try {
    return new Date(ts).toISOString().replace("T", " ").slice(0, 19) + " UTC";
  } catch {
    return "";
  }
};

const renderToolResult = (payload = {}) => {
  // Intent tools — describe the action
  if (payload.clientAction === "continue_story") {
    return `*Hiyori queued a story turn: "${payload.content || ""}"*`;
  }
  if (payload.clientAction === "illustrate_scene") {
    return `*Hiyori queued an illustration for scene ${payload.sceneId}*`;
  }
  if (payload.clientAction === "generate_music") {
    return `*Hiyori queued ${payload.mood || ""} music${payload.description ? `: ${payload.description}` : ""}*`;
  }
  if (payload.clientAction === "set_theme") {
    return `*Theme switched to **${payload.theme}***`;
  }
  if (payload.clientAction === "recall_favorites") {
    return `*Recalled ${payload.count || 0} recent generations.*`;
  }
  if (payload.clientAction === "browse_gallery") {
    return `*Pulled ${payload.count || 0} images from the public gallery.*`;
  }
  // generate_image — embed the image + prompt
  if (payload.imageUrl || payload.predictionId) {
    const lines = [];
    if (payload.imageUrl) {
      lines.push(`![${payload.prompt || "generated image"}](${payload.imageUrl})`);
    }
    if (payload.prompt) lines.push(`> ${payload.prompt}`);
    const meta = [
      payload.style && `style=${payload.style}`,
      payload.aspect && `aspect=${payload.aspect}`,
      payload.seed != null && `seed=${payload.seed}`,
    ]
      .filter(Boolean)
      .join(" · ");
    if (meta) lines.push(`*${meta}*`);
    return lines.join("\n\n");
  }
  if (payload.error) {
    return `*⚠ ${payload.error}*`;
  }
  return "";
};

/**
 * Build a markdown document from the turn array. Returns the markdown string.
 */
export function turnsToMarkdown(turns = [], { title = "Hiyori — Agent transcript" } = {}) {
  const lines = [`# ${title}`, "", `_Exported ${formatDate(Date.now())}_`, ""];
  for (const turn of turns) {
    const t = turn?.payload || {};
    if (turn.kind === "user") {
      lines.push(`**You:** ${t.text || ""}`, "");
      continue;
    }
    if (turn.kind === "agent") {
      // Skip canned + error agent panels — they're chatter, not transcript
      if (t.canned || t.error) continue;
      lines.push(`**Hiyori:** ${t.text || ""}`, "");
      continue;
    }
    if (turn.kind === "tool-result") {
      const md = renderToolResult(t);
      if (md) lines.push(md, "");
      continue;
    }
    // thinking, confirm-all — drop
  }
  return lines.join("\n").trim() + "\n";
}

/**
 * Trigger a browser download of `markdown` as a .md file. Safe to call from
 * a click handler — uses URL.createObjectURL.
 */
export function downloadMarkdown(markdown, filename = "agent-transcript.md") {
  try {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.warn("[exportTurns] download failed:", err?.message || err);
  }
}
