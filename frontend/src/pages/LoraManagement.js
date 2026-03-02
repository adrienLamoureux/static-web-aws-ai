import React, { useCallback, useEffect, useMemo, useState } from "react";
import { fetchDirectorConfig } from "../services/operations";
import { listStoryCharacters } from "../services/story";
import {
  getLoraProfile,
  listLoraCatalog,
  saveLoraProfile,
  syncLoraCatalogFromCivitai,
} from "../services/lora";

const LORA_MODALITY_IMAGE = "image";
const LORA_MODALITY_VIDEO = "video";
const LORA_STRENGTH_DEFAULT = 1;

const CATALOG_DEFAULT_LIMIT = 100;
const CATALOG_MIN_LIMIT = 1;
const CATALOG_MAX_LIMIT = 200;
const CATALOG_SEARCH_DEBOUNCE_MS = 250;

const SYNC_DEFAULT_LIMIT = 20;
const SYNC_MIN_LIMIT = 1;
const SYNC_MAX_LIMIT = 80;

const PROFILE_STRENGTH_STEP = 0.05;
const PROFILE_STRENGTH_MIN = 0;
const PROFILE_STRENGTH_MAX = 2;

const normalizeString = (value = "") => String(value || "").trim();

const toUniqueStringArray = (values = []) => {
  const seen = new Set();
  const output = [];
  values.forEach((value) => {
    const normalized = normalizeString(value);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    output.push(normalized);
  });
  return output;
};

const clampInteger = (value, fallback, min, max) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.round(parsed), min), max);
};

const clampStrength = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return LORA_STRENGTH_DEFAULT;
  return Math.min(Math.max(parsed, PROFILE_STRENGTH_MIN), PROFILE_STRENGTH_MAX);
};

const normalizeLoraItem = (item = {}) => ({
  catalogId: normalizeString(item.catalogId),
  name: normalizeString(item.name),
  downloadUrl: normalizeString(item.downloadUrl),
  triggerWords: toUniqueStringArray(item.triggerWords || []),
  strength: clampStrength(item.strength),
});

const emptyModalityDraft = () => ({
  modelKey: "",
  promptPrefix: "",
  loras: [],
});

const createEmptyProfileDraft = ({ characterId = "", displayName = "" } = {}) => ({
  characterId: normalizeString(characterId),
  displayName: normalizeString(displayName),
  image: emptyModalityDraft(),
  video: emptyModalityDraft(),
});

const normalizeProfileDraft = ({
  profile = {},
  characterId = "",
  displayName = "",
}) => ({
  characterId: normalizeString(profile.characterId) || normalizeString(characterId),
  displayName: normalizeString(profile.displayName) || normalizeString(displayName),
  image: {
    modelKey: normalizeString(profile?.image?.modelKey),
    promptPrefix: normalizeString(profile?.image?.promptPrefix),
    loras: Array.isArray(profile?.image?.loras)
      ? profile.image.loras
          .map((item) => normalizeLoraItem(item))
          .filter((item) => item.catalogId || item.downloadUrl)
      : [],
  },
  video: {
    modelKey: normalizeString(profile?.video?.modelKey),
    promptPrefix: normalizeString(profile?.video?.promptPrefix),
    loras: Array.isArray(profile?.video?.loras)
      ? profile.video.loras
          .map((item) => normalizeLoraItem(item))
          .filter((item) => item.catalogId || item.downloadUrl)
      : [],
  },
});

const normalizeCatalogItems = (items = []) =>
  (Array.isArray(items) ? items : []).map((item) => ({
    catalogId: normalizeString(item.catalogId),
    name: normalizeString(item.name),
    modelName: normalizeString(item.modelName),
    versionName: normalizeString(item.versionName),
    baseModel: normalizeString(item.baseModel),
    creatorName: normalizeString(item.creatorName),
    triggerWords: toUniqueStringArray(item.triggerWords || []),
    downloadUrl: normalizeString(item.downloadUrl),
    modelUrl: normalizeString(item.modelUrl),
    tags: toUniqueStringArray(item.tags || []),
    stats: {
      downloadCount: Number(item?.stats?.downloadCount) || 0,
      favoriteCount: Number(item?.stats?.favoriteCount) || 0,
      rating: Number(item?.stats?.rating) || 0,
    },
  }));

const normalizeCharacterOptions = (characters = []) =>
  (Array.isArray(characters) ? characters : [])
    .map((item) => ({
      id: normalizeString(item?.id),
      name: normalizeString(item?.name || item?.id),
    }))
    .filter((item) => item.id && item.name);

const buildProfileSavePayload = (draft = {}) => ({
  displayName: normalizeString(draft.displayName),
  image: {
    modelKey: normalizeString(draft?.image?.modelKey),
    promptPrefix: normalizeString(draft?.image?.promptPrefix),
    loras: Array.isArray(draft?.image?.loras)
      ? draft.image.loras
          .map((item) => normalizeLoraItem(item))
          .filter((item) => item.catalogId || item.downloadUrl)
      : [],
  },
  video: {
    modelKey: normalizeString(draft?.video?.modelKey),
    promptPrefix: normalizeString(draft?.video?.promptPrefix),
    loras: Array.isArray(draft?.video?.loras)
      ? draft.video.loras
          .map((item) => normalizeLoraItem(item))
          .filter((item) => item.catalogId || item.downloadUrl)
      : [],
  },
});

const toNumberLabel = (value) => new Intl.NumberFormat().format(Number(value) || 0);

const isProfileNotFoundError = (message = "") =>
  String(message || "").toLowerCase().includes("not found");

function LoraManagement({ apiBaseUrl = "" }) {
  const resolvedApiBaseUrl = apiBaseUrl || process.env.REACT_APP_API_URL || "";
  const [characterOptions, setCharacterOptions] = useState([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const [profileDraft, setProfileDraft] = useState(createEmptyProfileDraft());

  const [imageModelOptions, setImageModelOptions] = useState([]);
  const [videoModelOptions, setVideoModelOptions] = useState([]);

  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogLimit, setCatalogLimit] = useState(CATALOG_DEFAULT_LIMIT);
  const [catalogItems, setCatalogItems] = useState([]);
  const [catalogTotal, setCatalogTotal] = useState(0);

  const [syncQuery, setSyncQuery] = useState("");
  const [syncBaseModel, setSyncBaseModel] = useState("");
  const [syncLimit, setSyncLimit] = useState(String(SYNC_DEFAULT_LIMIT));
  const [syncNsfw, setSyncNsfw] = useState(false);

  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [isCatalogLoading, setIsCatalogLoading] = useState(false);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const characterNameById = useMemo(
    () =>
      new Map(characterOptions.map((item) => [item.id, item.name])),
    [characterOptions]
  );

  const selectedCharacterName = useMemo(
    () => characterNameById.get(selectedCharacterId) || "",
    [characterNameById, selectedCharacterId]
  );

  const loadCatalog = useCallback(
    async ({ query = "", limit = CATALOG_DEFAULT_LIMIT } = {}) => {
      if (!resolvedApiBaseUrl) return;
      setIsCatalogLoading(true);
      try {
        const response = await listLoraCatalog(resolvedApiBaseUrl, {
          query: normalizeString(query) || undefined,
          limit: clampInteger(
            limit,
            CATALOG_DEFAULT_LIMIT,
            CATALOG_MIN_LIMIT,
            CATALOG_MAX_LIMIT
          ),
        });
        const items = normalizeCatalogItems(response?.items || []);
        setCatalogItems(items);
        setCatalogTotal(
          Number.isFinite(Number(response?.total))
            ? Number(response.total)
            : items.length
        );
      } catch (catalogError) {
        setError(catalogError?.message || "Failed to load LoRA catalog.");
      } finally {
        setIsCatalogLoading(false);
      }
    },
    [resolvedApiBaseUrl]
  );

  useEffect(() => {
    if (!resolvedApiBaseUrl) return;
    let isCancelled = false;
    setIsBootstrapping(true);
    setError("");

    Promise.all([
      listStoryCharacters(resolvedApiBaseUrl),
      fetchDirectorConfig(resolvedApiBaseUrl),
    ])
      .then(([characterPayload, directorConfigPayload]) => {
        if (isCancelled) return;
        const normalizedCharacters = normalizeCharacterOptions(
          characterPayload?.characters || []
        );
        setCharacterOptions(normalizedCharacters);

        const imageModels = Array.isArray(
          directorConfigPayload?.options?.generation?.imageModels
        )
          ? directorConfigPayload.options.generation.imageModels
              .map((item) => ({
                key: normalizeString(item?.key),
                label: normalizeString(item?.label || item?.key),
              }))
              .filter((item) => item.key)
          : [];
        const videoModels = Array.isArray(directorConfigPayload?.options?.video?.models)
          ? directorConfigPayload.options.video.models
              .map((item) => ({
                key: normalizeString(item?.key),
                label: normalizeString(item?.label || item?.key),
              }))
              .filter((item) => item.key)
          : [];
        setImageModelOptions(imageModels);
        setVideoModelOptions(videoModels);

        setSelectedCharacterId((previous) => {
          if (previous && normalizedCharacters.some((item) => item.id === previous)) {
            return previous;
          }
          return normalizeString(normalizedCharacters[0]?.id);
        });
      })
      .catch((bootstrapError) => {
        if (isCancelled) return;
        setError(bootstrapError?.message || "Failed to load LoRA management data.");
      })
      .finally(() => {
        if (!isCancelled) {
          setIsBootstrapping(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [resolvedApiBaseUrl]);

  useEffect(() => {
    if (!resolvedApiBaseUrl) return;
    const timerId = setTimeout(() => {
      loadCatalog({ query: catalogQuery, limit: catalogLimit });
    }, CATALOG_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timerId);
  }, [catalogQuery, catalogLimit, loadCatalog, resolvedApiBaseUrl]);

  const loadProfile = useCallback(
    async (characterId) => {
      const resolvedCharacterId = normalizeString(characterId);
      if (!resolvedCharacterId) {
        setProfileDraft(createEmptyProfileDraft());
        return;
      }
      const fallbackDisplayName =
        characterNameById.get(resolvedCharacterId) || resolvedCharacterId;

      setIsProfileLoading(true);
      setError("");
      try {
        const response = await getLoraProfile(resolvedApiBaseUrl, resolvedCharacterId);
        setProfileDraft(
          normalizeProfileDraft({
            profile: response?.profile || {},
            characterId: resolvedCharacterId,
            displayName: fallbackDisplayName,
          })
        );
      } catch (profileError) {
        if (isProfileNotFoundError(profileError?.message)) {
          setProfileDraft(
            createEmptyProfileDraft({
              characterId: resolvedCharacterId,
              displayName: fallbackDisplayName,
            })
          );
        } else {
          setError(profileError?.message || "Failed to load LoRA profile.");
        }
      } finally {
        setIsProfileLoading(false);
      }
    },
    [characterNameById, resolvedApiBaseUrl]
  );

  useEffect(() => {
    if (!resolvedApiBaseUrl || !selectedCharacterId) return;
    loadProfile(selectedCharacterId);
  }, [loadProfile, resolvedApiBaseUrl, selectedCharacterId]);

  const setModalityValue = useCallback((modality, patch) => {
    setProfileDraft((previous) => ({
      ...previous,
      [modality]: {
        ...(previous?.[modality] || emptyModalityDraft()),
        ...patch,
      },
    }));
  }, []);

  const addCatalogItemToProfile = useCallback((modality, item) => {
    const normalizedItem = normalizeLoraItem(item);
    if (!normalizedItem.catalogId) return;
    setProfileDraft((previous) => {
      const modalityDraft = previous?.[modality] || emptyModalityDraft();
      if (
        Array.isArray(modalityDraft.loras) &&
        modalityDraft.loras.some((entry) => entry.catalogId === normalizedItem.catalogId)
      ) {
        return previous;
      }
      return {
        ...previous,
        [modality]: {
          ...modalityDraft,
          loras: [...(modalityDraft.loras || []), normalizedItem],
        },
      };
    });
  }, []);

  const removeProfileLora = useCallback((modality, catalogId) => {
    const resolvedCatalogId = normalizeString(catalogId);
    if (!resolvedCatalogId) return;
    setProfileDraft((previous) => {
      const modalityDraft = previous?.[modality] || emptyModalityDraft();
      return {
        ...previous,
        [modality]: {
          ...modalityDraft,
          loras: (modalityDraft.loras || []).filter(
            (entry) => entry.catalogId !== resolvedCatalogId
          ),
        },
      };
    });
  }, []);

  const updateProfileLoraStrength = useCallback((modality, catalogId, value) => {
    const resolvedCatalogId = normalizeString(catalogId);
    if (!resolvedCatalogId) return;
    setProfileDraft((previous) => {
      const modalityDraft = previous?.[modality] || emptyModalityDraft();
      return {
        ...previous,
        [modality]: {
          ...modalityDraft,
          loras: (modalityDraft.loras || []).map((entry) =>
            entry.catalogId === resolvedCatalogId
              ? { ...entry, strength: clampStrength(value) }
              : entry
          ),
        },
      };
    });
  }, []);

  const handleSync = async (event) => {
    event.preventDefault();
    if (!resolvedApiBaseUrl) {
      setError("API base URL is missing. Set it in config.json or .env.");
      return;
    }
    const resolvedLimit = clampInteger(
      syncLimit,
      SYNC_DEFAULT_LIMIT,
      SYNC_MIN_LIMIT,
      SYNC_MAX_LIMIT
    );
    setError("");
    setNotice("");
    setIsSyncing(true);

    try {
      const response = await syncLoraCatalogFromCivitai(resolvedApiBaseUrl, {
        query: normalizeString(syncQuery) || undefined,
        baseModel: normalizeString(syncBaseModel) || undefined,
        limit: resolvedLimit,
        nsfw: syncNsfw,
      });
      setSyncLimit(String(resolvedLimit));
      setNotice(
        `Synced ${toNumberLabel(response?.syncedCount || 0)} LoRA catalog item(s) from CivitAI.`
      );
      await loadCatalog({ query: catalogQuery, limit: catalogLimit });
    } catch (syncError) {
      setError(syncError?.message || "Failed to sync LoRA catalog.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!resolvedApiBaseUrl) {
      setError("API base URL is missing. Set it in config.json or .env.");
      return;
    }
    if (!selectedCharacterId) {
      setError("Select a character first.");
      return;
    }

    setError("");
    setNotice("");
    setIsSaving(true);
    try {
      const payload = buildProfileSavePayload({
        ...profileDraft,
        displayName:
          normalizeString(profileDraft?.displayName) || selectedCharacterName,
      });
      const response = await saveLoraProfile(
        resolvedApiBaseUrl,
        selectedCharacterId,
        payload
      );
      setProfileDraft(
        normalizeProfileDraft({
          profile: response?.profile || {},
          characterId: selectedCharacterId,
          displayName: selectedCharacterName,
        })
      );
      setNotice("LoRA character profile saved.");
    } catch (saveError) {
      setError(saveError?.message || "Failed to save LoRA profile.");
    } finally {
      setIsSaving(false);
    }
  };

  const renderModalityEditor = ({
    modality,
    label,
    modelOptions,
  }) => {
    const modalityDraft = profileDraft?.[modality] || emptyModalityDraft();
    return (
      <section className="lora-modality-panel" key={modality}>
        <div className="lora-modality-head">
          <h4>{label}</h4>
          <p className="pixnovel-feed-copy">
            Configure model affinity, prompt prefix, and selected LoRAs.
          </p>
        </div>

        <label className="lora-field">
          <span className="pixnovel-control-label">Preferred model key</span>
          <select
            className="field-select"
            value={modalityDraft.modelKey}
            onChange={(event) =>
              setModalityValue(modality, { modelKey: event.target.value })
            }
          >
            <option value="">No model lock</option>
            {modelOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="lora-field">
          <span className="pixnovel-control-label">Prompt prefix</span>
          <textarea
            className="field-textarea"
            rows={3}
            value={modalityDraft.promptPrefix}
            onChange={(event) =>
              setModalityValue(modality, { promptPrefix: event.target.value })
            }
            placeholder="cinematic anime key visual, consistent character identity"
          />
        </label>

        <div className="lora-profile-list">
          {(modalityDraft.loras || []).length === 0 ? (
            <p className="pixnovel-feed-copy">
              No LoRAs selected for this modality yet.
            </p>
          ) : (
            modalityDraft.loras.map((entry) => {
              const loraKey =
                normalizeString(entry.catalogId) || normalizeString(entry.downloadUrl);
              return (
              <article key={`${modality}-${loraKey}`} className="lora-profile-item">
                <div className="lora-profile-item-head">
                  <div>
                    <p className="lora-profile-item-title">
                      {entry.name || entry.catalogId}
                    </p>
                    <p className="lora-profile-item-meta">{entry.catalogId}</p>
                  </div>
                  <button
                    type="button"
                    className="btn-ghost px-3 py-1 text-xs"
                    onClick={() => removeProfileLora(modality, entry.catalogId)}
                  >
                    Remove
                  </button>
                </div>

                <div className="lora-profile-item-controls">
                  <label className="lora-inline-field">
                    <span className="pixnovel-control-label">Strength</span>
                    <input
                      type="number"
                      step={PROFILE_STRENGTH_STEP}
                      min={PROFILE_STRENGTH_MIN}
                      max={PROFILE_STRENGTH_MAX}
                      className="field-input"
                      value={entry.strength}
                      onChange={(event) =>
                        updateProfileLoraStrength(
                          modality,
                          entry.catalogId,
                          event.target.value
                        )
                      }
                    />
                  </label>
                </div>

                {entry.triggerWords.length > 0 ? (
                  <div className="lora-chip-row">
                    {entry.triggerWords.map((word) => (
                      <span key={`${loraKey}-${word}`} className="lora-chip">
                        {word}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            );
            })
          )}
        </div>
      </section>
    );
  };

  return (
    <section className="lora-page">
      <div className="lora-grid">
        <div className="lora-panel glass-panel">
          <header className="lora-panel-head">
            <h3>LoRA Catalog</h3>
            <p className="pixnovel-feed-copy">
              Sync LoRA entries from CivitAI, then attach them to character profiles.
            </p>
          </header>

          <form className="lora-sync-form" onSubmit={handleSync}>
            <label className="lora-field">
              <span className="pixnovel-control-label">Search query</span>
              <input
                className="field-input"
                value={syncQuery}
                onChange={(event) => setSyncQuery(event.target.value)}
                placeholder="frieren"
                maxLength={120}
              />
            </label>

            <label className="lora-field">
              <span className="pixnovel-control-label">Base model filter</span>
              <input
                className="field-input"
                value={syncBaseModel}
                onChange={(event) => setSyncBaseModel(event.target.value)}
                placeholder="SDXL 1.0"
                maxLength={120}
              />
            </label>

            <div className="lora-sync-row">
              <label className="lora-inline-field">
                <span className="pixnovel-control-label">Sync limit</span>
                <input
                  type="number"
                  min={SYNC_MIN_LIMIT}
                  max={SYNC_MAX_LIMIT}
                  className="field-input"
                  value={syncLimit}
                  onChange={(event) => setSyncLimit(event.target.value)}
                />
              </label>
              <label className="lora-check-field">
                <input
                  type="checkbox"
                  checked={syncNsfw}
                  onChange={(event) => setSyncNsfw(event.target.checked)}
                />
                <span>Include NSFW</span>
              </label>
            </div>

            <div className="lora-actions">
              <button
                type="submit"
                className="btn-primary px-4 py-2 text-sm"
                disabled={isSyncing}
              >
                {isSyncing ? "Syncing..." : "Sync CivitAI"}
              </button>
              <button
                type="button"
                className="btn-ghost px-4 py-2 text-sm"
                onClick={() => loadCatalog({ query: catalogQuery, limit: catalogLimit })}
                disabled={isCatalogLoading}
              >
                Refresh Catalog
              </button>
            </div>
          </form>

          <div className="lora-catalog-search-row">
            <label className="lora-field">
              <span className="pixnovel-control-label">Search local catalog</span>
              <input
                type="search"
                className="field-input"
                value={catalogQuery}
                onChange={(event) => setCatalogQuery(event.target.value)}
                placeholder="Search by name, trigger, creator"
              />
            </label>
            <label className="lora-inline-field">
              <span className="pixnovel-control-label">Results limit</span>
              <input
                type="number"
                min={CATALOG_MIN_LIMIT}
                max={CATALOG_MAX_LIMIT}
                className="field-input"
                value={catalogLimit}
                onChange={(event) =>
                  setCatalogLimit(
                    clampInteger(
                      event.target.value,
                      CATALOG_DEFAULT_LIMIT,
                      CATALOG_MIN_LIMIT,
                      CATALOG_MAX_LIMIT
                    )
                  )
                }
              />
            </label>
          </div>

          <p className="pixnovel-feed-copy">
            {isCatalogLoading
              ? "Loading catalog..."
              : `${toNumberLabel(catalogItems.length)} item(s) shown • ${toNumberLabel(
                  catalogTotal
                )} total`}
          </p>

          <div className="lora-catalog-list">
            {catalogItems.length === 0 && !isCatalogLoading ? (
              <p className="pixnovel-feed-copy">
                No LoRA catalog entries. Run a sync from CivitAI.
              </p>
            ) : (
              catalogItems.map((item) => (
                <article key={item.catalogId} className="lora-catalog-item">
                  <div className="lora-catalog-item-head">
                    <div>
                      <p className="lora-catalog-title">
                        {item.name || item.catalogId}
                      </p>
                      <p className="lora-catalog-meta">
                        {item.baseModel || "Base model n/a"} •{" "}
                        {item.creatorName || "Creator n/a"}
                      </p>
                    </div>
                    {item.modelUrl ? (
                      <a
                        href={item.modelUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-ghost px-3 py-1 text-xs"
                      >
                        Open
                      </a>
                    ) : null}
                  </div>

                  <p className="lora-catalog-key">{item.catalogId}</p>

                  <div className="lora-chip-row">
                    {(item.triggerWords || []).slice(0, 8).map((word) => (
                      <span key={`${item.catalogId}-${word}`} className="lora-chip">
                        {word}
                      </span>
                    ))}
                  </div>

                  <div className="lora-catalog-stats">
                    <span>Downloads: {toNumberLabel(item.stats.downloadCount)}</span>
                    <span>Favorites: {toNumberLabel(item.stats.favoriteCount)}</span>
                    <span>Rating: {item.stats.rating || 0}</span>
                  </div>

                  <div className="lora-actions">
                    <button
                      type="button"
                      className="btn-ghost px-3 py-1 text-xs"
                      onClick={() =>
                        addCatalogItemToProfile(LORA_MODALITY_IMAGE, item)
                      }
                      disabled={!selectedCharacterId}
                    >
                      Add to Image
                    </button>
                    <button
                      type="button"
                      className="btn-ghost px-3 py-1 text-xs"
                      onClick={() =>
                        addCatalogItemToProfile(LORA_MODALITY_VIDEO, item)
                      }
                      disabled={!selectedCharacterId}
                    >
                      Add to Video
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>

        <div className="lora-panel glass-panel">
          <header className="lora-panel-head">
            <h3>Character LoRA Profile</h3>
            <p className="pixnovel-feed-copy">
              Attach catalog LoRAs per character and modality.
            </p>
          </header>

          <label className="lora-field">
            <span className="pixnovel-control-label">Character</span>
            <select
              className="field-select"
              value={selectedCharacterId}
              onChange={(event) => setSelectedCharacterId(event.target.value)}
              disabled={isBootstrapping}
            >
              <option value="">
                {isBootstrapping ? "Loading characters..." : "Select a character"}
              </option>
              {characterOptions.map((character) => (
                <option key={character.id} value={character.id}>
                  {character.name} ({character.id})
                </option>
              ))}
            </select>
          </label>

          <label className="lora-field">
            <span className="pixnovel-control-label">Profile display name</span>
            <input
              className="field-input"
              value={profileDraft.displayName}
              onChange={(event) =>
                setProfileDraft((previous) => ({
                  ...previous,
                  displayName: event.target.value,
                }))
              }
              placeholder="Frieren"
              maxLength={120}
              disabled={!selectedCharacterId}
            />
          </label>

          {isProfileLoading ? (
            <p className="pixnovel-feed-copy">Loading profile...</p>
          ) : (
            <>
              {renderModalityEditor({
                modality: LORA_MODALITY_IMAGE,
                label: "Image Modality",
                modelOptions: imageModelOptions,
              })}
              {renderModalityEditor({
                modality: LORA_MODALITY_VIDEO,
                label: "Video Modality",
                modelOptions: videoModelOptions,
              })}
            </>
          )}

          <div className="lora-actions">
            <button
              type="button"
              className="btn-primary px-4 py-2 text-sm"
              onClick={handleSaveProfile}
              disabled={!selectedCharacterId || isSaving}
            >
              {isSaving ? "Saving..." : "Save Profile"}
            </button>
            <button
              type="button"
              className="btn-ghost px-4 py-2 text-sm"
              onClick={() => loadProfile(selectedCharacterId)}
              disabled={!selectedCharacterId || isProfileLoading}
            >
              Reload
            </button>
          </div>
        </div>
      </div>

      {notice ? <p className="whisk-share-status">{notice}</p> : null}
      {error ? <p className="whisk-error-panel">{error}</p> : null}
    </section>
  );
}

export default LoraManagement;
