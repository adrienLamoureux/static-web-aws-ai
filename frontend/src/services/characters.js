import {
  buildApiUrl,
  fetchJson,
  postJson,
  putJson,
  deleteJson,
} from "./apiClient";

export const listCharacters = (baseUrl) =>
  fetchJson(buildApiUrl(baseUrl, "/characters"), {}, "Failed to load characters.");

export const getCharacter = (baseUrl, characterId) =>
  fetchJson(
    buildApiUrl(baseUrl, `/characters/${encodeURIComponent(characterId)}`),
    {},
    "Failed to load character."
  );

export const createCharacter = (baseUrl, payload) =>
  postJson(buildApiUrl(baseUrl, "/characters"), payload, "Failed to create character.");

export const updateCharacter = (baseUrl, characterId, payload) =>
  putJson(
    buildApiUrl(baseUrl, `/characters/${encodeURIComponent(characterId)}`),
    payload,
    "Failed to update character."
  );

export const deleteCharacter = (baseUrl, characterId) =>
  deleteJson(
    buildApiUrl(baseUrl, `/characters/${encodeURIComponent(characterId)}`),
    "Failed to delete character."
  );
