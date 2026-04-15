import { useCallback, useEffect, useMemo, useState } from "react";
import { saveLoraProfile } from "../../../services/lora";
import {
  CIVITAI_LORA_MODE_PROFILE,
  CIVITAI_LORA_MODE_QUICK,
  CIVITAI_RUNTIME_PROFILE_ID,
  CIVITAI_RUNTIME_PROFILE_NAME,
  CIVITAI_MAX_RUNTIME_LORAS,
  CIVITAI_CATALOG_RESULT_LIMIT,
  DEFAULT_CIVITAI_LORA_STRENGTH,
} from "./image-studio-constants";

const normalizeCivitaiLoraStrength = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_CIVITAI_LORA_STRENGTH;
  }
  return Math.max(0, Math.min(2, Math.round(numeric * 100) / 100));
};

export const useCivitaiLora = ({ apiBaseUrl, imageSource, loraCatalogEntries = [] }) => {
  const [civitaiLoraMode, setCivitaiLoraMode] = useState(CIVITAI_LORA_MODE_PROFILE);
  const [civitaiCatalogQuery, setCivitaiCatalogQuery] = useState("");
  const [civitaiRuntimeLoras, setCivitaiRuntimeLoras] = useState([]);

  // Reset civitai state when leaving civitai source
  useEffect(() => {
    if (imageSource !== "civitai") {
      setCivitaiLoraMode(CIVITAI_LORA_MODE_PROFILE);
      setCivitaiCatalogQuery("");
    }
  }, [imageSource]);

  const normalizedLoraCatalogEntries = useMemo(
    () =>
      (Array.isArray(loraCatalogEntries) ? loraCatalogEntries : [])
        .map((entry) => {
          const catalogId = String(entry?.catalogId || "").trim();
          if (!catalogId) return null;
          return {
            catalogId,
            name: String(entry?.name || entry?.modelName || catalogId).trim(),
            baseModel: String(entry?.baseModel || "").trim(),
            creatorName: String(entry?.creatorName || "").trim(),
            triggerWords: Array.isArray(entry?.triggerWords)
              ? entry.triggerWords.map((word) => String(word || "").trim()).filter(Boolean)
              : [],
            downloadUrl: String(entry?.downloadUrl || "").trim(),
          };
        })
        .filter(Boolean),
    [loraCatalogEntries]
  );

  const civitaiCatalogResults = useMemo(() => {
    const query = String(civitaiCatalogQuery || "")
      .trim()
      .toLowerCase();
    const filtered = query
      ? normalizedLoraCatalogEntries.filter((entry) => {
          const searchable = [
            entry.catalogId,
            entry.name,
            entry.baseModel,
            entry.creatorName,
            ...(entry.triggerWords || []),
          ]
            .join(" ")
            .toLowerCase();
          return searchable.includes(query);
        })
      : normalizedLoraCatalogEntries;
    return filtered.slice(0, CIVITAI_CATALOG_RESULT_LIMIT);
  }, [civitaiCatalogQuery, normalizedLoraCatalogEntries]);

  const addCivitaiRuntimeLora = useCallback((entry) => {
    if (!entry?.catalogId) return;
    setCivitaiRuntimeLoras((previous) => {
      if (previous.some((item) => item.catalogId === entry.catalogId)) {
        return previous;
      }
      if (previous.length >= CIVITAI_MAX_RUNTIME_LORAS) {
        return previous;
      }
      return [
        ...previous,
        {
          catalogId: entry.catalogId,
          name: entry.name,
          downloadUrl: entry.downloadUrl,
          triggerWords: entry.triggerWords || [],
          strength: DEFAULT_CIVITAI_LORA_STRENGTH,
        },
      ];
    });
  }, []);

  const removeCivitaiRuntimeLora = useCallback((catalogId) => {
    const resolvedCatalogId = String(catalogId || "").trim();
    if (!resolvedCatalogId) return;
    setCivitaiRuntimeLoras((previous) =>
      previous.filter((item) => item.catalogId !== resolvedCatalogId)
    );
  }, []);

  const updateCivitaiRuntimeLoraStrength = useCallback((catalogId, strength) => {
    const resolvedCatalogId = String(catalogId || "").trim();
    if (!resolvedCatalogId) return;
    const normalizedStrength = normalizeCivitaiLoraStrength(strength);
    setCivitaiRuntimeLoras((previous) =>
      previous.map((item) =>
        item.catalogId === resolvedCatalogId ? { ...item, strength: normalizedStrength } : item
      )
    );
  }, []);

  const persistRuntimeCivitaiProfileIfNeeded = useCallback(async () => {
    if (
      imageSource !== "civitai" ||
      civitaiLoraMode !== CIVITAI_LORA_MODE_QUICK ||
      civitaiRuntimeLoras.length === 0
    ) {
      return "";
    }
    const profileLoras = civitaiRuntimeLoras.map((item) => ({
      catalogId: item.catalogId,
      name: item.name,
      downloadUrl: item.downloadUrl,
      strength: normalizeCivitaiLoraStrength(item.strength),
      triggerWords: Array.isArray(item.triggerWords) ? item.triggerWords : [],
    }));
    await saveLoraProfile(apiBaseUrl, CIVITAI_RUNTIME_PROFILE_ID, {
      displayName: CIVITAI_RUNTIME_PROFILE_NAME,
      image: {
        modelKey: "",
        promptPrefix: "",
        loras: profileLoras,
      },
      video: {
        modelKey: "",
        promptPrefix: "",
        loras: [],
      },
    });
    return CIVITAI_RUNTIME_PROFILE_ID;
  }, [apiBaseUrl, civitaiLoraMode, civitaiRuntimeLoras, imageSource]);

  const resetCivitaiLora = () => {
    setCivitaiLoraMode(CIVITAI_LORA_MODE_PROFILE);
    setCivitaiCatalogQuery("");
    setCivitaiRuntimeLoras([]);
  };

  return {
    civitaiLoraMode,
    setCivitaiLoraMode,
    civitaiCatalogQuery,
    setCivitaiCatalogQuery,
    civitaiCatalogResults,
    civitaiRuntimeLoras,
    addCivitaiRuntimeLora,
    removeCivitaiRuntimeLora,
    updateCivitaiRuntimeLoraStrength,
    persistRuntimeCivitaiProfileIfNeeded,
    resetCivitaiLora,
  };
};
