import {
  buildApiUrl,
  buildUrlWithQuery,
  fetchJson,
  postJson,
  putJson,
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

export const saveLoraProfile = (baseUrl, characterId, payload) =>
  putJson(
    buildApiUrl(baseUrl, `/lora/profiles/${encodeURIComponent(characterId)}`),
    payload,
    "Failed to save LoRA profile."
  );
