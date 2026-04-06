// Barrel re-export — preserves all existing import paths
const { createAiCraftSceneContext } = require("./scene-context/scene-context");
const { createAiCraftIllustrationPrompts } = require("./scene-context/illustration-prompts");
const { createAiCraftMusicDirection } = require("./scene-context/music-direction");

module.exports = { createAiCraftSceneContext, createAiCraftIllustrationPrompts, createAiCraftMusicDirection };
