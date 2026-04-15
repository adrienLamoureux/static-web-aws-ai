import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useConfig } from "../contexts/ConfigContext";
import { fetchDirectorConfig } from "../services/operations";
import SanctumSubNav from "../components/sakura/sanctum/SanctumSubNav";
import { listCharacters } from "../services/characters";
import {
  getLoraProfile,
  listLoraCatalog,
  listLoraProfilesForCharacter,
  syncLoraCatalogFromCivitai,
} from "../services/lora";
import LoraCatalogView from "./lora/LoraCatalogView";
import LoraProfileEditor from "./lora/LoraProfileEditor";
import useLoraProfileActions from "./lora/useLoraProfileActions";
import {
  LORA_MODALITY_IMAGE,
  LORA_MODALITY_VIDEO,
  CATALOG_DEFAULT_LIMIT,
  CATALOG_MIN_LIMIT,
  CATALOG_MAX_LIMIT,
  CATALOG_SEARCH_DEBOUNCE_MS,
  SYNC_DEFAULT_LIMIT,
  SYNC_MIN_LIMIT,
  SYNC_MAX_LIMIT,
  normalizeString,
  clampInteger,
  clampStrength,
  normalizeLoraItem,
  emptyModalityDraft,
  createEmptyProfileDraft,
  normalizeProfileDraft,
  normalizeCatalogItems,
  normalizeCharacterOptions,
  toNumberLabel,
  isProfileNotFoundError,
} from "./lora/loraUtils";

export default function LoraManagement() {
  const { apiBaseUrl } = useConfig();
  const resolvedApiBaseUrl = apiBaseUrl || process.env.REACT_APP_API_URL || "";

  const [characterOptions, setCharacterOptions] = useState([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const [profileOptions, setProfileOptions] = useState([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
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
        setCatalogTotal(
          Number.isFinite(Number(response?.total)) ? Number(response.total) : items.length
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

    Promise.all([listCharacters(resolvedApiBaseUrl), fetchDirectorConfig(resolvedApiBaseUrl)])
      .then(([characterPayload, directorConfigPayload]) => {
        if (isCancelled) return;
        const normalizedCharacters = normalizeCharacterOptions(characterPayload?.characters || []);
        setCharacterOptions(normalizedCharacters);

        const imageModels = Array.isArray(directorConfigPayload?.options?.generation?.imageModels)
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
          if (previous && normalizedCharacters.some((item) => item.id === previous))
            return previous;
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
        const fallbackName =
          normalizeString(profile.name || profile.displayName) ||
          characterNameById.get(charId) ||
          "";
        setProfileDraft(
          normalizeProfileDraft({ profile, characterId: charId, name: fallbackName })
        );
      } catch (profileError) {
        if (isProfileNotFoundError(profileError?.message)) {
          setProfileDraft(createEmptyProfileDraft({ characterId: selectedCharacterId, name: "" }));
        } else {
          setError(profileError?.message || "Failed to load LoRA profile.");
        }
      } finally {
        setIsProfileLoading(false);
      }
    },
    [characterNameById, resolvedApiBaseUrl, selectedCharacterId]
  );

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
        const profiles = (response?.items || response?.profiles || [])
          .map((p) => ({
            id: normalizeString(p.id || p.characterId),
            name: normalizeString(p.name || p.displayName || p.id || p.characterId),
          }))
          .filter((p) => p.id);
        setProfileOptions(profiles);
        const firstId = profiles[0]?.id || "";
        setSelectedProfileId(firstId);
        if (firstId) {
          loadProfile(firstId);
        } else {
          setProfileDraft(
            createEmptyProfileDraft({
              characterId: selectedCharacterId,
              name: characterNameById.get(selectedCharacterId),
            })
          );
        }
      })
      .catch(() => {
        setProfileOptions([]);
        setSelectedProfileId("");
        setProfileDraft(createEmptyProfileDraft({ characterId: selectedCharacterId }));
      })
      .finally(() => setIsProfileListLoading(false));
    // eslint-disable-next-line
  }, [resolvedApiBaseUrl, selectedCharacterId, characterNameById]); // intentionally excludes loadProfile to avoid loop

  const handleSelectProfile = useCallback(
    (profileId) => {
      setSelectedProfileId(profileId);
      if (!profileId) {
        setProfileDraft(createEmptyProfileDraft({ characterId: selectedCharacterId, name: "" }));
      } else {
        loadProfile(profileId);
      }
    },
    [loadProfile, selectedCharacterId]
  );

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
      if (
        Array.isArray(modalityDraft.loras) &&
        modalityDraft.loras.some((entry) => entry.catalogId === normalizedItem.catalogId)
      )
        return previous;
      return {
        ...previous,
        [modality]: { ...modalityDraft, loras: [...(modalityDraft.loras || []), normalizedItem] },
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
      setError("API base URL is missing.");
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

  const { handleSaveProfile, handleDeleteProfile } = useLoraProfileActions({
    resolvedApiBaseUrl,
    selectedCharacterId,
    selectedProfileId,
    setSelectedProfileId,
    profileDraft,
    loadProfile,
    setError,
    setNotice,
    setIsSaving,
    setProfileDraft,
    setProfileOptions,
  });

  const handleResetProfile = () => {
    if (selectedProfileId) {
      loadProfile(selectedProfileId);
    } else {
      setProfileDraft(createEmptyProfileDraft({ characterId: selectedCharacterId }));
    }
  };

  return (
    <div>
      <SanctumSubNav />
      <div className="skr-page-header">
        <h2 className="skr-page-title">LoRA Management</h2>
        <p className="skr-page-subtitle">Character LoRA Profile</p>
      </div>

      <div className="skr-lora-grid">
        <LoraCatalogView
          catalogItems={catalogItems}
          catalogTotal={catalogTotal}
          isCatalogLoading={isCatalogLoading}
          isSyncing={isSyncing}
          catalogQuery={catalogQuery}
          syncQuery={syncQuery}
          syncBaseModel={syncBaseModel}
          syncLimit={syncLimit}
          syncNsfw={syncNsfw}
          selectedCharacterId={selectedCharacterId}
          onCatalogQueryChange={setCatalogQuery}
          onSyncQueryChange={setSyncQuery}
          onSyncBaseModelChange={setSyncBaseModel}
          onSyncLimitChange={setSyncLimit}
          onSyncNsfwChange={setSyncNsfw}
          onSync={handleSync}
          onRefresh={() => loadCatalog({ query: catalogQuery, limit: catalogLimit })}
          onAddToImage={(item) => addCatalogItemToProfile(LORA_MODALITY_IMAGE, item)}
          onAddToVideo={(item) => addCatalogItemToProfile(LORA_MODALITY_VIDEO, item)}
        />

        <LoraProfileEditor
          characterOptions={characterOptions}
          selectedCharacterId={selectedCharacterId}
          isBootstrapping={isBootstrapping}
          profileOptions={profileOptions}
          selectedProfileId={selectedProfileId}
          isProfileListLoading={isProfileListLoading}
          isProfileLoading={isProfileLoading}
          isSaving={isSaving}
          profileDraft={profileDraft}
          imageModelOptions={imageModelOptions}
          videoModelOptions={videoModelOptions}
          onCharacterChange={setSelectedCharacterId}
          onSelectProfile={handleSelectProfile}
          onProfileNameChange={(name) => setProfileDraft((prev) => ({ ...prev, name }))}
          onSetModalityValue={setModalityValue}
          onRemoveProfileLora={removeProfileLora}
          onUpdateLoraStrength={updateProfileLoraStrength}
          onSaveProfile={handleSaveProfile}
          onDeleteProfile={handleDeleteProfile}
          onResetProfile={handleResetProfile}
        />
      </div>

      {notice && (
        <p
          style={{
            marginTop: 16,
            fontSize: 13,
            color: "var(--skr-accent)",
            background: "var(--skr-accent-subtle)",
            padding: "8px 12px",
            borderRadius: 6,
          }}
        >
          {notice}
        </p>
      )}
      {error && (
        <p
          style={{
            marginTop: 16,
            fontSize: 13,
            color: "#ef4444",
            background: "#fef2f2",
            padding: "8px 12px",
            borderRadius: 6,
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
