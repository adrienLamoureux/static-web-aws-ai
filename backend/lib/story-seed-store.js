const { PutCommand } = require("@aws-sdk/lib-dynamodb");

const {
  storyCharacters,
  storyPresets,
  promptHelperDefaults,
} = require("../config/story-seed-data");

const {
  buildStoryCharacterPk,
  buildStoryCharacterSk,
  buildStoryPresetPk,
  buildStoryPresetSk,
  buildPromptHelperPk,
  buildPromptHelperSk,
} = require("./keys");

const createStorySeedStore = ({
  dynamoClient,
  mediaTable,
  queryBySkPrefix,
}) => {
  const ensurePromptHelperOptions = async () => {
    const pk = buildPromptHelperPk();
    const existing = await queryBySkPrefix({
      pk,
      skPrefix: buildPromptHelperSk(""),
      limit: 50,
      scanForward: true,
    });
    const existingMap = new Map(
      existing.map((item) => [item.key || "", item])
    );
    const updates = Object.entries(promptHelperDefaults).filter(
      ([key, options]) => {
        const current = existingMap.get(key);
        if (!current || !Array.isArray(current.options)) return true;
        return JSON.stringify(current.options) !== JSON.stringify(options);
      }
    );
    if (updates.length) {
      await Promise.all(
        updates.map(([key, options]) =>
          dynamoClient.send(
            new PutCommand({
              TableName: mediaTable,
              Item: {
                pk,
                sk: buildPromptHelperSk(key),
                type: "PROMPT_HELPER_OPTIONS",
                key,
                options,
                createdAt: new Date().toISOString(),
              },
            })
          )
        )
      );
    }
    const refreshed = await queryBySkPrefix({
      pk,
      skPrefix: buildPromptHelperSk(""),
      limit: 50,
      scanForward: true,
    });
    return refreshed;
  };

  const ensureStoryCharacters = async () => {
    const pk = buildStoryCharacterPk();
    const existing = await queryBySkPrefix({
      pk,
      skPrefix: buildStoryCharacterSk(""),
      limit: 20,
      scanForward: true,
    });
    if (existing.length > 0) {
      const existingMap = new Map(
        existing.map((item) => [item.id || "", item])
      );
      const fieldsToCompare = [
        "name",
        "weight",
        "background",
        "pose",
        "signatureTraits",
        "faceDetails",
        "eyeDetails",
        "hairDetails",
        "breastSize",
        "ears",
        "tails",
        "horns",
        "wings",
        "hairStyles",
        "viewDistance",
        "accessories",
        "markings",
        "outfitMaterials",
        "styleReference",
        "identityPrompt",
        "storyBasePrompt",
        "storyNegativePrompt",
      ];
      const updates = storyCharacters.filter((character) => {
        const current = existingMap.get(character.id);
        if (!current) return false;
        return fieldsToCompare.some(
          (field) => (current[field] || "") !== (character[field] || "")
        );
      });
      if (updates.length) {
        await Promise.all(
          updates.map((character) =>
            dynamoClient.send(
              new PutCommand({
                TableName: mediaTable,
                Item: {
                  pk,
                  sk: buildStoryCharacterSk(character.id),
                  type: "STORY_CHARACTER",
                  ...character,
                  createdAt: character.createdAt || new Date().toISOString(),
                },
              })
            )
          )
        );
        const refreshed = await queryBySkPrefix({
          pk,
          skPrefix: buildStoryCharacterSk(""),
          limit: 20,
          scanForward: true,
        });
        return refreshed;
      }
      return existing;
    }
    await Promise.all(
      storyCharacters.map((character) =>
        dynamoClient.send(
          new PutCommand({
            TableName: mediaTable,
            Item: {
              pk,
              sk: buildStoryCharacterSk(character.id),
              type: "STORY_CHARACTER",
              ...character,
              createdAt: new Date().toISOString(),
            },
          })
        )
      )
    );
    return storyCharacters.map((character) => ({
      pk,
      sk: buildStoryCharacterSk(character.id),
      type: "STORY_CHARACTER",
      ...character,
    }));
  };

  const ensureStoryPresets = async () => {
    const pk = buildStoryPresetPk();
    await ensureStoryCharacters();
    const existing = await queryBySkPrefix({
      pk,
      skPrefix: buildStoryPresetSk(""),
      limit: 5,
      scanForward: true,
    });
    if (existing.length > 0) {
      const existingMap = new Map(
        existing.map((item) => [item.id || "", item])
      );
      const updates = storyPresets.filter((preset) => {
        const current = existingMap.get(preset.id);
        return (
          current &&
          (!current.protagonistId ||
            current.protagonistId !== preset.protagonistId)
        );
      });
      if (updates.length) {
        await Promise.all(
          updates.map((preset) =>
            dynamoClient.send(
              new PutCommand({
                TableName: mediaTable,
                Item: {
                  pk,
                  sk: buildStoryPresetSk(preset.id),
                  type: "STORY_PRESET",
                  ...preset,
                  createdAt: preset.createdAt || new Date().toISOString(),
                },
              })
            )
          )
        );
        const refreshed = await queryBySkPrefix({
          pk,
          skPrefix: buildStoryPresetSk(""),
          limit: 5,
          scanForward: true,
        });
        return refreshed;
      }
      return existing;
    }
    await Promise.all(
      storyPresets.map((preset) =>
        dynamoClient.send(
          new PutCommand({
            TableName: mediaTable,
            Item: {
              pk,
              sk: buildStoryPresetSk(preset.id),
              type: "STORY_PRESET",
              ...preset,
              createdAt: new Date().toISOString(),
            },
          })
        )
      )
    );
    return storyPresets.map((preset) => ({
      pk,
      sk: buildStoryPresetSk(preset.id),
      type: "STORY_PRESET",
      ...preset,
    }));
  };

  return {
    ensurePromptHelperOptions,
    ensureStoryCharacters,
    ensureStoryPresets,
  };
};

module.exports = {
  createStorySeedStore,
};
