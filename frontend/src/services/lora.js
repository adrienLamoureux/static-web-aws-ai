import {
  buildApiUrl,
  buildUrlWithQuery,
  fetchJson,
  postJson,
  putJson,
  deleteJson,
} from "./apiClient";

export const syncLoraCatalogFromCivitai = (baseUrl, payload = {}) =>
  postJson(
    buildApiUrl(baseUrl, "/lora/catalog/sync/civitai"),
    payload,
    "Failed to sync LoRA catalog."
  );

export const listLoraCatalog = (baseUrl, params = {}) =>
  fetchJson(
    buildUrlWithQuery(baseUrl, "/lora/catalog", params),
    {},
    "Failed to load LoRA catalog."
  );

export const listLoraProfiles = (baseUrl, params = {}) =>
  fetchJson(
    buildUrlWithQuery(baseUrl, "/lora/profiles", params),
    {},
    "Failed to load LoRA profiles."
  );

export const getLoraProfile = (baseUrl, characterId) =>
  fetchJson(
    buildApiUrl(baseUrl, `/lora/profiles/${encodeURIComponent(characterId)}`),
    {},
    "Failed to load LoRA profile."
  );

export const saveLoraProfile = (baseUrl, profileId, payload) =>
  putJson(
    buildApiUrl(baseUrl, `/lora/profiles/${encodeURIComponent(profileId)}`),
    payload,
    "Failed to save LoRA profile."
  );

// Create a new LoRA profile (UUID id) linked to a character.
// payload: { characterId, name, image?, video?, imageModel?, imagePrompt?, videoModel?, videoPrompt? }
export const createLoraProfile = (baseUrl, payload) =>
  postJson(buildApiUrl(baseUrl, "/lora/profiles"), payload, "Failed to create LoRA profile.");

// Delete a LoRA profile by its UUID profileId.
export const deleteLoraProfile = (baseUrl, profileId) =>
  deleteJson(
    buildApiUrl(baseUrl, `/lora/profiles/${encodeURIComponent(profileId)}`),
    "Failed to delete LoRA profile."
  );

// List LoRA profiles filtered to a specific character.
export const listLoraProfilesForCharacter = (baseUrl, characterId) =>
  fetchJson(
    buildUrlWithQuery(baseUrl, "/lora/profiles", { characterId }),
    {},
    "Failed to load LoRA profiles for character."
  );
