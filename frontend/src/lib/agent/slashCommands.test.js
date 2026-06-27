import { parseSlashCommand, dispatchSlashCommand, SLASH_HELP_TEXT } from "./slashCommands";

const makeCtx = () => {
  const calls = { append: [], reset: 0, applyClientAction: [] };
  return {
    calls,
    ctx: {
      append: (t) => calls.append.push(t),
      reset: () => {
        calls.reset += 1;
      },
      applyClientAction: (a) => calls.applyClientAction.push(a),
      lastUserPrompt: "",
    },
  };
};

describe("parseSlashCommand", () => {
  it("returns null for normal prompts", () => {
    expect(parseSlashCommand("a fox spirit at moonlit shrine")).toBeNull();
    expect(parseSlashCommand("")).toBeNull();
    expect(parseSlashCommand(null)).toBeNull();
  });

  it("parses /help with no args", () => {
    expect(parseSlashCommand("/help")).toEqual({ name: "help", args: [], rawArgs: "" });
  });

  it("parses /theme with one arg", () => {
    const result = parseSlashCommand("/theme moonrise");
    expect(result.name).toBe("theme");
    expect(result.args).toEqual(["moonrise"]);
    expect(result.rawArgs).toBe("moonrise");
  });

  it("normalises command name to lowercase", () => {
    expect(parseSlashCommand("/THEME aurora").name).toBe("theme");
  });

  it("returns null for unknown commands", () => {
    expect(parseSlashCommand("/summon-dragon")).toBeNull();
  });
});

describe("dispatchSlashCommand", () => {
  it("returns handled=false for null parse", () => {
    const { ctx } = makeCtx();
    expect(dispatchSlashCommand(null, ctx)).toEqual({ handled: false });
  });

  it("/help appends a canned agent panel with command list", () => {
    const { ctx, calls } = makeCtx();
    const result = dispatchSlashCommand({ name: "help", args: [] }, ctx);
    expect(result).toEqual({ handled: true });
    expect(calls.append).toHaveLength(1);
    expect(calls.append[0].kind).toBe("agent");
    expect(calls.append[0].payload.text).toBe(SLASH_HELP_TEXT);
    expect(calls.append[0].payload.canned).toBe(true);
  });

  it("/clear calls reset()", () => {
    const { ctx, calls } = makeCtx();
    const result = dispatchSlashCommand({ name: "clear", args: [] }, ctx);
    expect(result).toEqual({ handled: true });
    expect(calls.reset).toBe(1);
  });

  it("/reset behaves like /clear", () => {
    const { ctx, calls } = makeCtx();
    dispatchSlashCommand({ name: "reset", args: [] }, ctx);
    expect(calls.reset).toBe(1);
  });

  it("/theme <valid> applies set_theme and appends a tool-result panel", () => {
    const { ctx, calls } = makeCtx();
    const result = dispatchSlashCommand({ name: "theme", args: ["aurora"] }, ctx);
    expect(result).toEqual({ handled: true });
    expect(calls.applyClientAction).toEqual([{ clientAction: "set_theme", theme: "aurora" }]);
    expect(calls.append).toHaveLength(1);
    expect(calls.append[0].kind).toBe("tool-result");
    expect(calls.append[0].payload.theme).toBe("aurora");
  });

  it("/theme <invalid> surfaces an error panel", () => {
    const { ctx, calls } = makeCtx();
    const result = dispatchSlashCommand({ name: "theme", args: ["neon"] }, ctx);
    expect(result).toEqual({ handled: true });
    expect(calls.applyClientAction).toEqual([]);
    expect(calls.append[0].payload.error).toBe(true);
    expect(calls.append[0].payload.text).toMatch(/neon/);
  });

  it("/recall forwards a normal prompt requesting recent generations", () => {
    const { ctx } = makeCtx();
    const result = dispatchSlashCommand({ name: "recall", args: ["5"] }, ctx);
    expect(result.handled).toBe(true);
    expect(result.forward).toMatch(/recent 5 generations/i);
  });

  it("/recall clamps the limit to [1, 12]", () => {
    const { ctx } = makeCtx();
    expect(dispatchSlashCommand({ name: "recall", args: ["999"] }, ctx).forward).toMatch(/12 /);
    expect(dispatchSlashCommand({ name: "recall", args: ["-5"] }, ctx).forward).toMatch(/1 /);
  });

  it("/reroll with no prior prompt surfaces an info panel", () => {
    const { ctx, calls } = makeCtx();
    const result = dispatchSlashCommand({ name: "reroll", args: [] }, ctx);
    expect(result).toEqual({ handled: true });
    expect(calls.append[0].payload.text).toMatch(/Nothing to re-roll/i);
  });

  it("/reroll forwards the last user prompt when one exists", () => {
    const { ctx } = makeCtx();
    ctx.lastUserPrompt = "a fox spirit at moonlit shrine";
    const result = dispatchSlashCommand({ name: "reroll", args: [] }, ctx);
    expect(result).toEqual({
      handled: true,
      forward: "a fox spirit at moonlit shrine",
    });
  });
});
