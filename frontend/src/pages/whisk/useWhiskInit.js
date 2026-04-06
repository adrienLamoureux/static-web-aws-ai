import { useState, useEffect } from 'react';
import { listLoraCatalog, listLoraProfiles } from '../../services/lora';
import { fetchDirectorConfig } from '../../services/operations';
import { toLoraSupportMap, buildSupportedModels } from './whisk-utils';

const EMPTY_LORA_CAPABILITIES = Object.freeze({
  imageByModel: {},
  imageByProviderModel: {},
  videoByModel: {},
  supportedImageModels: [],
  supportedImageModelsByProvider: {},
  supportedVideoModels: [],
});

const EMPTY_DIRECTOR_MODEL_OPTIONS = Object.freeze({
  imageModels: [],
  civitaiModels: [],
  generationByModel: {},
  videoModels: [],
});

/**
 * Custom hook for Whisk page initialization.
 * Loads LoRA catalog data, director config, and capability resolution on mount.
 *
 * @param {{ apiBaseUrl: string, onError: (msg: string) => void }} options
 * @returns {{
 *   loraProfiles: Array,
 *   loraCatalogEntries: Array,
 *   selectedLoraProfileId: string,
 *   setSelectedLoraProfileId: Function,
 *   loraCapabilities: object,
 *   directorModelOptions: object,
 *   isLoadingLoraData: boolean,
 * }}
 */
export function useWhiskInit({ apiBaseUrl, onError }) {
  const [loraProfiles, setLoraProfiles] = useState([]);
  const [loraCatalogEntries, setLoraCatalogEntries] = useState([]);
  const [selectedLoraProfileId, setSelectedLoraProfileId] = useState('');
  const [loraCapabilities, setLoraCapabilities] = useState(EMPTY_LORA_CAPABILITIES);
  const [directorModelOptions, setDirectorModelOptions] = useState(EMPTY_DIRECTOR_MODEL_OPTIONS);
  const [isLoadingLoraData, setIsLoadingLoraData] = useState(false);

  useEffect(() => {
    if (!apiBaseUrl) {
      setLoraProfiles([]);
      setLoraCatalogEntries([]);
      setSelectedLoraProfileId('');
      setLoraCapabilities(EMPTY_LORA_CAPABILITIES);
      setDirectorModelOptions(EMPTY_DIRECTOR_MODEL_OPTIONS);
      return undefined;
    }

    let isCancelled = false;
    setIsLoadingLoraData(true);

    Promise.all([
      listLoraProfiles(apiBaseUrl),
      fetchDirectorConfig(apiBaseUrl),
      listLoraCatalog(apiBaseUrl, { limit: 100 }).catch(() => ({ items: [] })),
    ])
      .then(([profilePayload, configPayload, catalogPayload]) => {
        if (isCancelled) return;

        const profileItems = Array.isArray(profilePayload?.items)
          ? profilePayload.items
              .map(item => ({
                id: String(item?.id || item?.characterId || '').trim(),
                characterId: String(item?.characterId || item?.id || '').trim(),
                displayName: String(item?.displayName || item?.name || '').trim(),
                name: String(item?.name || item?.displayName || '').trim(),
              }))
              .filter(item => item.id && item.id !== '__whisk_civitai_runtime__')
          : [];
        setLoraProfiles(profileItems);
        setSelectedLoraProfileId(current =>
          profileItems.some(item => item.id === current || item.characterId === current) ? current : ''
        );

        const catalogItems = Array.isArray(catalogPayload?.items)
          ? catalogPayload.items
              .map(item => ({
                catalogId: String(item?.catalogId || '').trim(),
                name: String(item?.name || item?.modelName || '').trim(),
                modelName: String(item?.modelName || '').trim(),
                baseModel: String(item?.baseModel || '').trim(),
                creatorName: String(item?.creatorName || '').trim(),
                triggerWords: Array.isArray(item?.triggerWords)
                  ? item.triggerWords.map(w => String(w || '').trim()).filter(Boolean)
                  : [],
                downloadUrl: String(item?.downloadUrl || '').trim(),
              }))
              .filter(item => item.catalogId)
          : [];
        setLoraCatalogEntries(catalogItems);

        const imageSupportMap = toLoraSupportMap(configPayload?.options?.generation?.imageModels);
        const civitaiImageSupportMap = toLoraSupportMap(configPayload?.options?.generation?.civitaiModels);
        const videoSupportMap = toLoraSupportMap(configPayload?.options?.video?.models);
        const imageModels = Array.isArray(configPayload?.options?.generation?.imageModels)
          ? configPayload.options.generation.imageModels
          : [];
        const civitaiModels = Array.isArray(configPayload?.options?.generation?.civitaiModels)
          ? configPayload.options.generation.civitaiModels
          : [];
        const generationByModel =
          configPayload?.options?.generation?.byModel &&
          typeof configPayload.options.generation.byModel === 'object'
            ? configPayload.options.generation.byModel
            : {};
        const videoModels = Array.isArray(configPayload?.options?.video?.models)
          ? configPayload.options.video.models
          : [];

        setDirectorModelOptions({ imageModels, civitaiModels, generationByModel, videoModels });
        setLoraCapabilities({
          imageByModel: imageSupportMap,
          imageByProviderModel: { replicate: imageSupportMap, civitai: civitaiImageSupportMap },
          videoByModel: videoSupportMap,
          supportedImageModels: buildSupportedModels(imageSupportMap),
          supportedImageModelsByProvider: {
            replicate: buildSupportedModels(imageSupportMap),
            civitai: buildSupportedModels(civitaiImageSupportMap),
          },
          supportedVideoModels: buildSupportedModels(videoSupportMap),
        });
      })
      .catch(loadError => {
        if (isCancelled) return;
        setDirectorModelOptions(EMPTY_DIRECTOR_MODEL_OPTIONS);
        setLoraCatalogEntries([]);
        onError(loadError?.message || 'Failed to load configuration.');
      })
      .finally(() => {
        if (!isCancelled) setIsLoadingLoraData(false);
      });

    return () => { isCancelled = true; };
  }, [apiBaseUrl]); // eslint-disable-line

  return {
    loraProfiles,
    loraCatalogEntries,
    selectedLoraProfileId,
    setSelectedLoraProfileId,
    loraCapabilities,
    directorModelOptions,
    isLoadingLoraData,
  };
}
