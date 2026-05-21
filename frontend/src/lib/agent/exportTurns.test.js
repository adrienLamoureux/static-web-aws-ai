import { turnsToMarkdown } from "./exportTurns";

describe("turnsToMarkdown", () => {
  it("returns a heading + export timestamp even when turns array is empty", () => {
    const md = turnsToMarkdown([], { title: "Hiyori" });
    expect(md).toMatch(/^# Hiyori/);
    expect(md).toMatch(/Exported .+ UTC/);
  });

  it("serialises user + agent text turns with role prefixes", () => {
    const md = turnsToMarkdown([
      { kind: "user", payload: { text: "draw a fox spirit" } },
      { kind: "agent", payload: { text: "Picking anime — ikuyo!" } },
    ]);
    expect(md).toMatch(/\*\*You:\*\* draw a fox spirit/);
    expect(md).toMatch(/\*\*Hiyori:\*\* Picking anime — ikuyo!/);
  });

  it("skips canned and error agent panels (they're chatter, not transcript)", () => {
    const md = turnsToMarkdown([
      { kind: "agent", payload: { text: "What are we making today?", canned: true } },
      { kind: "agent", payload: { text: "Oh no", error: true } },
      { kind: "agent", payload: { text: "Real reply" } },
    ]);
    expect(md).not.toMatch(/What are we making/);
    expect(md).not.toMatch(/Oh no/);
    expect(md).toMatch(/Real reply/);
  });

  it("drops thinking + confirm-all turns (transient UI)", () => {
    const md = turnsToMarkdown([
      { kind: "user", payload: { text: "x" } },
      { kind: "thinking", payload: { label: "Sketching…" } },
      { kind: "confirm-all", payload: { intents: [] } },
    ]);
    expect(md).not.toMatch(/Sketching/);
    expect(md).not.toMatch(/confirm/i);
  });

  it("embeds generated images with prompt + meta as markdown", () => {
    const md = turnsToMarkdown([
      {
        kind: "tool-result",
        payload: {
          imageUrl: "https://example.com/img.png",
          prompt: "fox spirit at moonlit shrine",
          style: "anime",
          aspect: "3:4",
          seed: 42,
        },
      },
    ]);
    expect(md).toMatch(/!\[fox spirit at moonlit shrine\]\(https:\/\/example\.com\/img\.png\)/);
    expect(md).toMatch(/> fox spirit at moonlit shrine/);
    expect(md).toMatch(/\*style=anime · aspect=3:4 · seed=42\*/);
  });

  it("renders intent tool results as italic notes", () => {
    const md = turnsToMarkdown([
      { kind: "tool-result", payload: { clientAction: "continue_story", content: "she runs" } },
      {
        kind: "tool-result",
        payload: { clientAction: "illustrate_scene", sceneId: "s2" },
      },
      {
        kind: "tool-result",
        payload: { clientAction: "set_theme", theme: "moonrise" },
      },
    ]);
    expect(md).toMatch(/\*Hiyori queued a story turn: "she runs"\*/);
    expect(md).toMatch(/\*Hiyori queued an illustration for scene s2\*/);
    expect(md).toMatch(/\*Theme switched to \*\*moonrise\*\*\*/);
  });

  it("renders recall_favorites + browse_gallery counts", () => {
    const md = turnsToMarkdown([
      { kind: "tool-result", payload: { clientAction: "recall_favorites", count: 6 } },
      { kind: "tool-result", payload: { clientAction: "browse_gallery", count: 10 } },
    ]);
    expect(md).toMatch(/Recalled 6 recent generations/);
    expect(md).toMatch(/Pulled 10 images from the public gallery/);
  });

  it("renders failed tool calls as warning notes", () => {
    const md = turnsToMarkdown([
      { kind: "tool-result", payload: { error: "replicate_token_missing" } },
    ]);
    expect(md).toMatch(/⚠ replicate_token_missing/);
  });
});
