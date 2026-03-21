import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useConfig } from "../contexts/ConfigContext";
import { fetchDirectorConfig } from "../services/operations";
import { listCharacters } from "../services/characters";
import {
  getLoraProfile,
  listLoraCatalog,
  listLoraProfilesForCharacter,
  createLoraProfile,
  saveLoraProfile,
  deleteLoraProfile,
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

const createEmptyProfileDraft = ({ characterId = "", name = "" } = {}) => ({
  characterId: normalizeString(characterId),
  name: normalizeString(name),
  image: emptyModalityDraft(),
  video: emptyModalityDraft(),
});

const normalizeProfileDraft = ({ profile = {}, characterId = "", name = "" }) => ({
  characterId: normalizeString(profile.characterId) || normalizeString(characterId),
  name: normalizeString(profile.name || profile.displayName) || normalizeString(name),
  image: {
    modelKey: normalizeString(profile?.image?.modelKey),
    promptPrefix: normalizeString(profile?.image?.promptPrefix),
    loras: Array.isArray(profile?.image?.loras)
      ? profile.image.loras.map(normalizeLoraItem).filter((item) => item.catalogId || item.downloadUrl)
      : [],
  },
  video: {
    modelKey: normalizeString(profile?.video?.modelKey),
    promptPrefix: normalizeString(profile?.video?.promptPrefix),
    loras: Array.isArray(profile?.video?.loras)
      ? profile.video.loras.map(normalizeLoraItem).filter((item) => item.catalogId || item.downloadUrl)
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
      source: normalizeString(item?.source || 'user'),
    }))
    .filter((item) => item.id && item.name);

const buildProfileSavePayload = (draft = {}) => ({
  name: normalizeString(draft.name || draft.displayName),
  displayName: normalizeString(draft.name || draft.displayName), // legacy compat
  image: {
    modelKey: normalizeString(draft?.image?.modelKey),
    promptPrefix: normalizeString(draft?.image?.promptPrefix),
    loras: Array.isArray(draft?.image?.loras)
      ? draft.image.loras.map(normalizeLoraItem).filter((item) => item.catalogId || item.downloadUrl)
      : [],
  },
  video: {
    modelKey: normalizeString(draft?.video?.modelKey),
    promptPrefix: normalizeString(draft?.video?.promptPrefix),
    loras: Array.isArray(draft?.video?.loras)
      ? draft.video.loras.map(normalizeLoraItem).filter((item) => item.catalogId || item.downloadUrl)
      : [],
  },
});

const toNumberLabel = (value) => new Intl.NumberFormat().format(Number(value) || 0);

const isProfileNotFoundError = (message = "") =>
  String(message || "").toLowerCase().includes("not found");

export default function LoraManagement() {
  const { apiBaseUrl } = useConfig();
  const resolvedApiBaseUrl = apiBaseUrl || process.env.REACT_APP_API_URL || "";

  const [characterOptions, setCharacterOptions] = useState([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  // Profile list for the selected character + the currently selected profile
  const [profileOptions, setProfileOptions] = useState([]); // [{ id, name }]
  const [selectedProfileId, setSelectedProfileId] = useState(""); // "" = new profile
  const [isProfileListLoading, setIsProfileListLoading] = useState(false);
  const [profileDraft, setProfileDraft] = useState(createEmptyProfileDraft());

  const [imageModelOptions, setImageModelOptions] = useState([]);
  const [videoModelOptions, setVideoModelOptions] = useState([]);

  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogLimit] = useState(CATALOG_DEFAULT_LIMIT);
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
    () => new Map(characterOptions.map((item) => [item.id, item.name])),
    [characterOptions]
  );

  const loadCatalog = useCallback(
    async ({ query = "", limit = CATALOG_DEFAULT_LIMIT } = {}) => {
      if (!resolvedApiBaseUrl) return;
      setIsCatalogLoading(true);
      try {
        const response = await listLoraCatalog(resolvedApiBaseUrl, {
          query: normalizeString(query) || undefined,
          limit: clampInteger(limit, CATALOG_DEFAULT_LIMIT, CATALOG_MIN_LIMIT, CATALOG_MAX_LIMIT),
        });
        const items = normalizeCatalogItems(response?.items || []);
        setCatalogItems(items);
        setCatalogTotal(Number.isFinite(Number(response?.total)) ? Number(response.total) : items.length);
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
      listCharacters(resolvedApiBaseUrl),
      fetchDirectorConfig(resolvedApiBaseUrl),
    ])
      .then(([characterPayload, directorConfigPayload]) => {
        if (isCancelled) return;
        const normalizedCharacters = normalizeCharacterOptions(characterPayload?.characters || []);
        setCharacterOptions(normalizedCharacters);

        const imageModels = Array.isArray(directorConfigPayload?.options?.generation?.imageModels)
          ? directorConfigPayload.options.generation.imageModels
              .map((item) => ({ key: normalizeString(item?.key), label: normalizeString(item?.label || item?.key) }))
              .filter((item) => item.key)
          : [];
        const videoModels = Array.isArray(directorConfigPayload?.options?.video?.models)
          ? directorConfigPayload.options.video.models
              .map((item) => ({ key: normalizeString(item?.key), label: normalizeString(item?.label || item?.key) }))
              .filter((item) => item.key)
          : [];
        setImageModelOptions(imageModels);
        setVideoModelOptions(videoModels);

        setSelectedCharacterId((previous) => {
          if (previous && normalizedCharacters.some((item) => item.id === previous)) return previous;
          return normalizeString(normalizedCharacters[0]?.id);
        });
      })
      .catch((bootstrapError) => {
        if (isCancelled) return;
        setError(bootstrapError?.message || "Failed to load LoRA management data.");
      })
      .finally(() => {
        if (!isCancelled) setIsBootstrapping(false);
      });

    return () => { isCancelled = true; };
  }, [resolvedApiBaseUrl]);

  useEffect(() => {
    if (!resolvedApiBaseUrl) return;
    const timerId = setTimeout(() => {
      loadCatalog({ query: catalogQuery, limit: catalogLimit });
    }, CATALOG_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timerId);
  }, [catalogQuery, catalogLimit, loadCatalog, resolvedApiBaseUrl]);

  const loadProfile = useCallback(
    async (profileId) => {
      const resolvedProfileId = normalizeString(profileId);
      if (!resolvedProfileId) {
        setProfileDraft(createEmptyProfileDraft());
        return;
      }
      setIsProfileLoading(true);
      setError("");
      try {
        const response = await getLoraProfile(resolvedApiBaseUrl, resolvedProfileId);
        const profile = response?.profile || {};
        const charId = normalizeString(profile.characterId) || selectedCharacterId;
        const fallbackName = normalizeString(profile.name || profile.displayName) || characterNameById.get(charId) || '';
        setProfileDraft(normalizeProfileDraft({ profile, characterId: charId, name: fallbackName }));
      } catch (profileError) {
        if (isProfileNotFoundError(profileError?.message)) {
          setProfileDraft(createEmptyProfileDraft({ characterId: selectedCharacterId, name: '' }));
        } else {
          setError(profileError?.message || "Failed to load LoRA profile.");
        }
      } finally {
        setIsProfileLoading(false);
      }
    },
    [characterNameById, resolvedApiBaseUrl, selectedCharacterId]
  );

  // Load profiles list when character changes
  useEffect(() => {
    if (!resolvedApiBaseUrl || !selectedCharacterId) {
      setProfileOptions([]);
      setSelectedProfileId("");
      setProfileDraft(createEmptyProfileDraft({ characterId: selectedCharacterId }));
      return;
    }
    setIsProfileListLoading(true);
    listLoraProfilesForCharacter(resolvedApiBaseUrl, selectedCharacterId)
      .then((response) => {
        const profiles = (response?.items || response?.profiles || []).map((p) => ({
          id: normalizeString(p.id || p.characterId),
          name: normalizeString(p.name || p.displayName || p.id || p.characterId),
        })).filter((p) => p.id);
        setProfileOptions(profiles);
        // Auto-select first profile, or fall back to "new"
        const firstId = profiles[0]?.id || "";
        setSelectedProfileId(firstId);
        // Load the first profile's detail, or reset to empty
        if (firstId) {
          loadProfile(firstId);
        } else {
          setProfileDraft(createEmptyProfileDraft({ characterId: selectedCharacterId, name: characterNameById.get(selectedCharacterId) }));
        }
      })
      .catch(() => {
        setProfileOptions([]);
        setSelectedProfileId("");
        setProfileDraft(createEmptyProfileDraft({ characterId: selectedCharacterId }));
      })
      .finally(() => setIsProfileListLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedApiBaseUrl, selectedCharacterId, characterNameById]); // intentionally excludes loadProfile to avoid loop

  // Load profile detail when selected profile changes (but not on initial character change — that's handled above)
  const handleSelectProfile = useCallback((profileId) => {
    setSelectedProfileId(profileId);
    if (!profileId) {
      // "New profile"
      setProfileDraft(createEmptyProfileDraft({ characterId: selectedCharacterId, name: '' }));
    } else {
      loadProfile(profileId);
    }
  }, [loadProfile, selectedCharacterId]);

  const setModalityValue = useCallback((modality, patch) => {
    setProfileDraft((previous) => ({
      ...previous,
      [modality]: { ...(previous?.[modality] || emptyModalityDraft()), ...patch },
    }));
  }, []);

  const addCatalogItemToProfile = useCallback((modality, item) => {
    const normalizedItem = normalizeLoraItem(item);
    if (!normalizedItem.catalogId) return;
    setProfileDraft((previous) => {
      const modalityDraft = previous?.[modality] || emptyModalityDraft();
      if (Array.isArray(modalityDraft.loras) && modalityDraft.loras.some((entry) => entry.catalogId === normalizedItem.catalogId)) return previous;
      return { ...previous, [modality]: { ...modalityDraft, loras: [...(modalityDraft.loras || []), normalizedItem] } };
    });
  }, []);

  const removeProfileLora = useCallback((modality, catalogId) => {
    const resolvedCatalogId = normalizeString(catalogId);
    if (!resolvedCatalogId) return;
    setProfileDraft((previous) => {
      const modalityDraft = previous?.[modality] || emptyModalityDraft();
      return { ...previous, [modality]: { ...modalityDraft, loras: (modalityDraft.loras || []).filter((entry) => entry.catalogId !== resolvedCatalogId) } };
    });
  }, []);

  const updateProfileLoraStrength = useCallback((modality, catalogId, value) => {
    const resolvedCatalogId = normalizeString(catalogId);
    if (!resolvedCatalogId) return;
    setProfileDraft((previous) => {
      const modalityDraft = previous?.[modality] || emptyModalityDraft();
      return { ...previous, [modality]: { ...modalityDraft, loras: (modalityDraft.loras || []).map((entry) => entry.catalogId === resolvedCatalogId ? { ...entry, strength: clampStrength(value) } : entry) } };
    });
  }, []);

  const handleSync = async (event) => {
    event.preventDefault();
    if (!resolvedApiBaseUrl) { setError("API base URL is missing."); return; }
    const resolvedLimit = clampInteger(syncLimit, SYNC_DEFAULT_LIMIT, SYNC_MIN_LIMIT, SYNC_MAX_LIMIT);
    setError(""); setNotice(""); setIsSyncing(true);
    try {
      const response = await syncLoraCatalogFromCivitai(resolvedApiBaseUrl, {
        query: normalizeString(syncQuery) || undefined,
        baseModel: normalizeString(syncBaseModel) || undefined,
        limit: resolvedLimit,
        nsfw: syncNsfw,
      });
      setSyncLimit(String(resolvedLimit));
      setNotice(`Synced ${toNumberLabel(response?.syncedCount || 0)} LoRA catalog item(s) from CivitAI.`);
      await loadCatalog({ query: catalogQuery, limit: catalogLimit });
    } catch (syncError) {
      setError(syncError?.message || "Failed to sync LoRA catalog.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!resolvedApiBaseUrl) { setError("API base URL is missing."); return; }
    if (!selectedCharacterId) { setError("Select a character first."); return; }
    if (!profileDraft?.name?.trim()) { setError("Profile name is required."); return; }
    setError(""); setNotice(""); setIsSaving(true);
    try {
      const payload = buildProfileSavePayload(profileDraft);
      let savedProfileId = selectedProfileId;
      let response;
      if (!selectedProfileId) {
        // Create new profile
        response = await createLoraProfile(resolvedApiBaseUrl, { characterId: selectedCharacterId, ...payload });
        savedProfileId = response?.profile?.id || response?.id || '';
        setNotice("LoRA profile created.");
      } else {
        // Update existing profile
        response = await saveLoraProfile(resolvedApiBaseUrl, selectedProfileId, { characterId: selectedCharacterId, ...payload });
        setNotice("LoRA profile saved.");
      }
      const savedProfile = response?.profile || {};
      setProfileDraft(normalizeProfileDraft({ profile: savedProfile, characterId: selectedCharacterId, name: normalizeString(savedProfile.name || payload.name) }));
      // Refresh profile list
      const listResponse = await listLoraProfilesForCharacter(resolvedApiBaseUrl, selectedCharacterId);
      const profiles = (listResponse?.items || listResponse?.profiles || []).map((p) => ({
        id: normalizeString(p.id || p.characterId),
        name: normalizeString(p.name || p.displayName || p.id || p.characterId),
      })).filter((p) => p.id);
      setProfileOptions(profiles);
      if (savedProfileId) setSelectedProfileId(savedProfileId);
    } catch (saveError) {
      setError(saveError?.message || "Failed to save LoRA profile.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteProfile = async () => {
    if (!selectedProfileId) return;
    if (!window.confirm(`Delete LoRA profile "${profileDraft?.name || selectedProfileId}"?`)) return;
    setError(""); setNotice(""); setIsSaving(true);
    try {
      await deleteLoraProfile(resolvedApiBaseUrl, selectedProfileId);
      // Refresh list, select first remaining or "new"
      const listResponse = await listLoraProfilesForCharacter(resolvedApiBaseUrl, selectedCharacterId);
      const profiles = (listResponse?.items || listResponse?.profiles || []).map((p) => ({
        id: normalizeString(p.id || p.characterId),
        name: normalizeString(p.name || p.displayName || p.id || p.characterId),
      })).filter((p) => p.id);
      setProfileOptions(profiles);
      const firstId = profiles[0]?.id || "";
      setSelectedProfileId(firstId);
      if (firstId) {
        loadProfile(firstId);
      } else {
        setProfileDraft(createEmptyProfileDraft({ characterId: selectedCharacterId }));
      }
      setNotice("LoRA profile deleted.");
    } catch (deleteError) {
      setError(deleteError?.message || "Failed to delete LoRA profile.");
    } finally {
      setIsSaving(false);
    }
  };

  const renderModalityEditor = ({ modality, label, modelOptions }) => {
    const modalityDraft = profileDraft?.[modality] || emptyModalityDraft();
    return (
      <div key={modality} className="kit-lora-section">
        <p className="kit-lora-section-title">{label}</p>
        <label style={{ display: 'block', marginBottom: 10 }}>
          <span className="kit-field-label">Preferred model key</span>
          <select className="kit-field-select" value={modalityDraft.modelKey} onChange={(e) => setModalityValue(modality, { modelKey: e.target.value })}>
            <option value="">No model lock</option>
            {modelOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
        </label>
        <label style={{ display: 'block', marginBottom: 10 }}>
          <span className="kit-field-label">Prompt prefix</span>
          <textarea className="kit-field-textarea" rows={3} value={modalityDraft.promptPrefix} onChange={(e) => setModalityValue(modality, { promptPrefix: e.target.value })} placeholder="cinematic anime key visual, consistent character identity" />
        </label>
        <div style={{ marginBottom: 8 }}>
          {(modalityDraft.loras || []).length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--kit-text-tertiary)' }}>No LoRAs selected for this modality yet.</p>
          ) : (
            modalityDraft.loras.map((entry) => {
              const loraKey = normalizeString(entry.catalogId) || normalizeString(entry.downloadUrl);
              return (
                <div key={`${modality}-${loraKey}`} style={{ padding: '10px 0', borderBottom: '1px solid var(--kit-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <p className="kit-lora-item-name">{entry.name || entry.catalogId}</p>
                      <p className="kit-lora-item-meta">{entry.catalogId}</p>
                    </div>
                    <button type="button" className="kit-btn-secondary" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => removeProfileLora(modality, entry.catalogId)}>Remove</button>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 12 }}>
                    <span className="kit-field-label" style={{ marginBottom: 0 }}>Strength</span>
                    <input type="number" step={PROFILE_STRENGTH_STEP} min={PROFILE_STRENGTH_MIN} max={PROFILE_STRENGTH_MAX} className="kit-input" style={{ width: 80 }} value={entry.strength} onChange={(e) => updateProfileLoraStrength(modality, entry.catalogId, e.target.value)} />
                  </label>
                  {entry.triggerWords.length > 0 && (
                    <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                      {entry.triggerWords.map((word) => <span key={`${loraKey}-${word}`} className="kit-lora-chip">{word}</span>)}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="kit-page-header">
        <h2 className="kit-page-title">LoRA Management</h2>
        <p className="kit-page-subtitle">Character LoRA Profile</p>
      </div>

      <div className="kit-lora-grid">
        <div className="kit-lora-panel">
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--kit-text-primary)', marginBottom: 4 }}>LoRA Catalog</p>
            <p style={{ fontSize: 12, color: 'var(--kit-text-secondary)' }}>Sync LoRA entries from CivitAI, then attach them to character profiles.</p>
          </div>

          <form onSubmit={handleSync} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label>
                <span className="kit-field-label">Search query</span>
                <input className="kit-input" style={{ width: '100%' }} value={syncQuery} onChange={(e) => setSyncQuery(e.target.value)} placeholder="frieren" maxLength={120} />
              </label>
              <label>
                <span className="kit-field-label">Base model filter</span>
                <input className="kit-input" style={{ width: '100%' }} value={syncBaseModel} onChange={(e) => setSyncBaseModel(e.target.value)} placeholder="SDXL 1.0" maxLength={120} />
              </label>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                <label style={{ flex: 1 }}>
                  <span className="kit-field-label">Sync limit</span>
                  <input type="number" min={SYNC_MIN_LIMIT} max={SYNC_MAX_LIMIT} className="kit-input" style={{ width: '100%' }} value={syncLimit} onChange={(e) => setSyncLimit(e.target.value)} />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, paddingBottom: 2 }}>
                  <input type="checkbox" checked={syncNsfw} onChange={(e) => setSyncNsfw(e.target.checked)} />
                  Include NSFW
                </label>
              </div>
              <div className="kit-lora-actions">
                <button type="submit" className="kit-btn-primary" disabled={isSyncing}>{isSyncing ? "Syncing..." : "Sync CivitAI"}</button>
                <button type="button" className="kit-btn-secondary" onClick={() => loadCatalog({ query: catalogQuery, limit: catalogLimit })} disabled={isCatalogLoading}>Refresh</button>
              </div>
            </div>
          </form>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 8 }}>
              <span className="kit-field-label">Search local catalog</span>
              <input type="search" className="kit-input" style={{ width: '100%' }} value={catalogQuery} onChange={(e) => setCatalogQuery(e.target.value)} placeholder="Search by name, trigger, creator" />
            </label>
            <p style={{ fontSize: 11, color: 'var(--kit-text-tertiary)' }}>
              {isCatalogLoading ? "Loading catalog..." : `${toNumberLabel(catalogItems.length)} item(s) shown • ${toNumberLabel(catalogTotal)} total`}
            </p>
          </div>

          <div>
            {catalogItems.length === 0 && !isCatalogLoading ? (
              <p style={{ fontSize: 12, color: 'var(--kit-text-tertiary)' }}>No LoRA catalog entries. Run a sync from CivitAI.</p>
            ) : (
              catalogItems.map((item) => (
                <div key={item.catalogId} className="kit-lora-catalog-item">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <p className="kit-lora-item-name">{item.name || item.catalogId}</p>
                        <p className="kit-lora-item-meta">{item.baseModel || "Base model n/a"} • {item.creatorName || "Creator n/a"}</p>
                      </div>
                      {item.modelUrl && (
                        <a href={item.modelUrl} target="_blank" rel="noreferrer" className="kit-btn-secondary" style={{ fontSize: 11, padding: '3px 8px', textDecoration: 'none' }}>Open</a>
                      )}
                    </div>
                    <p style={{ fontSize: 10, color: 'var(--kit-text-tertiary)', marginTop: 2 }}>{item.catalogId}</p>
                    {(item.triggerWords || []).length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
                        {(item.triggerWords || []).slice(0, 8).map((word) => <span key={`${item.catalogId}-${word}`} className="kit-lora-chip">{word}</span>)}
                      </div>
                    )}
                    <p style={{ fontSize: 11, color: 'var(--kit-text-tertiary)', marginTop: 4 }}>
                      Downloads: {toNumberLabel(item.stats.downloadCount)} · Favorites: {toNumberLabel(item.stats.favoriteCount)} · Rating: {item.stats.rating || 0}
                    </p>
                    <div className="kit-lora-actions" style={{ marginTop: 6 }}>
                      <button type="button" className="kit-btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => addCatalogItemToProfile(LORA_MODALITY_IMAGE, item)} disabled={!selectedCharacterId}>Add to Image</button>
                      <button type="button" className="kit-btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => addCatalogItemToProfile(LORA_MODALITY_VIDEO, item)} disabled={!selectedCharacterId}>Add to Video</button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="kit-lora-panel">
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--kit-text-primary)', marginBottom: 4 }}>Character LoRA Profile</p>
            <p style={{ fontSize: 12, color: 'var(--kit-text-secondary)' }}>Attach catalog LoRAs per character and modality. Each character can have multiple named profiles.</p>
          </div>

          {/* Character selector */}
          <label style={{ display: 'block', marginBottom: 10 }}>
            <span className="kit-field-label">Character</span>
            <select className="kit-field-select" value={selectedCharacterId} onChange={(e) => setSelectedCharacterId(e.target.value)} disabled={isBootstrapping}>
              <option value="">{isBootstrapping ? "Loading characters..." : "Select a character"}</option>
              {characterOptions.map((character) => (
                <option key={character.id} value={character.id}>
                  {character.name}{character.source === 'system' ? ' (system)' : ''}
                </option>
              ))}
            </select>
          </label>

          {/* Profile selector */}
          {selectedCharacterId && (
            <div style={{ marginBottom: 10 }}>
              <span className="kit-field-label">Profile</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select
                  className="kit-field-select"
                  style={{ flex: 1 }}
                  value={selectedProfileId}
                  onChange={(e) => handleSelectProfile(e.target.value)}
                  disabled={isProfileListLoading}
                >
                  <option value="">— New profile —</option>
                  {profileOptions.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {selectedProfileId && (
                  <button
                    type="button"
                    className="kit-btn-secondary"
                    style={{ fontSize: 11, padding: '3px 8px', color: '#ef4444', flexShrink: 0 }}
                    onClick={handleDeleteProfile}
                    disabled={isSaving}
                    title="Delete this profile"
                  >
                    Delete
                  </button>
                )}
              </div>
              {isProfileListLoading && <p style={{ fontSize: 11, color: 'var(--kit-text-tertiary)', marginTop: 4 }}>Loading profiles…</p>}
            </div>
          )}

          {/* Profile name */}
          <label style={{ display: 'block', marginBottom: 16 }}>
            <span className="kit-field-label">Profile name</span>
            <input
              className="kit-input"
              style={{ width: '100%' }}
              value={profileDraft.name || ''}
              onChange={(e) => setProfileDraft((prev) => ({ ...prev, name: e.target.value }))}
              placeholder={selectedProfileId ? "e.g. Summer outfit, Battle armor…" : "Name for new profile"}
              maxLength={120}
              disabled={!selectedCharacterId}
            />
          </label>

          {isProfileLoading ? (
            <p style={{ fontSize: 12, color: 'var(--kit-text-tertiary)' }}>Loading profile...</p>
          ) : (
            <>
              {renderModalityEditor({ modality: LORA_MODALITY_IMAGE, label: "Image Modality", modelOptions: imageModelOptions })}
              {renderModalityEditor({ modality: LORA_MODALITY_VIDEO, label: "Video Modality", modelOptions: videoModelOptions })}
            </>
          )}

          <div className="kit-lora-actions" style={{ marginTop: 16 }}>
            <button type="button" className="kit-btn-primary" onClick={handleSaveProfile} disabled={!selectedCharacterId || isSaving}>
              {isSaving ? "Saving..." : (selectedProfileId ? "Save Profile" : "Create Profile")}
            </button>
            <button type="button" className="kit-btn-secondary" onClick={() => selectedProfileId ? loadProfile(selectedProfileId) : setProfileDraft(createEmptyProfileDraft({ characterId: selectedCharacterId }))} disabled={!selectedCharacterId || isProfileLoading}>
              Reset
            </button>
          </div>
        </div>
      </div>

      {notice && <p style={{ marginTop: 16, fontSize: 13, color: 'var(--kit-accent)', background: 'var(--kit-accent-subtle)', padding: '8px 12px', borderRadius: 6 }}>{notice}</p>}
      {error && <p style={{ marginTop: 16, fontSize: 13, color: '#ef4444', background: '#fef2f2', padding: '8px 12px', borderRadius: 6 }}>{error}</p>}
    </div>
  );
}
