/**
 * slashCommands — composer power-user shortcuts.
 *
 * `parseSlashCommand(text)` returns `{name, args}` for recognised commands or
 * `null` when the text is a normal user prompt. The caller (AgentContext)
 * dispatches via `dispatchSlashCommand` which runs side-effects through
 * AgentContext APIs (greet, reset, applyClientAction, etc.) and returns
 * `{handled: true, appendUser?: string}`.
 *
 * Recognised commands:
 *   /help           — show the command list inline (agent panel, no LLM call)
 *   /clear, /reset  — wipe the local turn stream
 *   /theme <name>   — switch theme directly (no LLM call)
 *   /recall [n]     — submit a normal turn that triggers recall_favorites
 *   /reroll         — re-submit the last user prompt
 *
 * Themes match the SUPPORTED_THEMES enum on the backend agent-tools.js.
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

export const SLASH_HELP_TEXT = [
  "**/help** — show this list",
  "**/clear** or **/reset** — wipe the panel stream",
  "**/theme <name>** — switch theme (" + SUPPORTED_THEMES.join(", ") + ")",
  "**/recall [n]** — pull your recent generations (1–12)",
  "**/reroll** — re-submit your last prompt",
].join("\n");

export const SLASH_COMMANDS = {
  help: { args: 0 },
  clear: { args: 0 },
  reset: { args: 0 },
  theme: { args: 1, completions: SUPPORTED_THEMES },
  recall: { args: 0, optionalArgs: 1 },
  reroll: { args: 0 },
};

/**
 * Parse a composer input. Returns `{name, args, rawArgs}` or `null`.
 */
export function parseSlashCommand(text) {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;
  const [head, ...rest] = trimmed.slice(1).split(/\s+/);
  const name = head.toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(SLASH_COMMANDS, name)) return null;
  const rawArgs = rest.join(" ");
  return { name, args: rest, rawArgs };
}

/**
 * Dispatch a parsed slash command. Returns either:
 *   { handled: true }                 — fully handled locally, drop the input
 *   { handled: true, forward: "..." } — forward this text to the agent instead
 *   { handled: false }                — fallthrough (shouldn't happen if parsed)
 */
export function dispatchSlashCommand(parsed, ctx) {
  if (!parsed) return { handled: false };
  const { name, args } = parsed;
  const { append, reset, applyClientAction, lastUserPrompt } = ctx;

  if (name === "help") {
    append({ kind: "agent", payload: { text: SLASH_HELP_TEXT, emotion: "happy", canned: true } });
    return { handled: true };
  }

  if (name === "clear" || name === "reset") {
    reset();
    return { handled: true };
  }

  if (name === "theme") {
    const theme = String(args[0] || "").toLowerCase();
    if (!SUPPORTED_THEMES.includes(theme)) {
      append({
        kind: "agent",
        payload: {
          text: `Unknown theme "${theme}". Try: ${SUPPORTED_THEMES.join(", ")}`,
          emotion: "thinking",
          error: true,
        },
      });
      return { handled: true };
    }
    applyClientAction({ clientAction: "set_theme", theme });
    append({
      kind: "tool-result",
      payload: { name: "set_theme", clientAction: "set_theme", theme, status: "succeeded" },
    });
    return { handled: true };
  }

  if (name === "recall") {
    const limit = Math.max(1, Math.min(12, parseInt(args[0], 10) || 8));
    return { handled: true, forward: `Show me my recent ${limit} generations.` };
  }

  if (name === "reroll") {
    if (!lastUserPrompt) {
      append({
        kind: "agent",
        payload: { text: "Nothing to re-roll yet — let's make something first.", emotion: "thinking" },
      });
      return { handled: true };
    }
    return { handled: true, forward: lastUserPrompt };
  }

  return { handled: false };
}
