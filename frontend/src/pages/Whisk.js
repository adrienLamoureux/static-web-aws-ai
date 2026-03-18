import React, { useEffect, useState, useCallback } from 'react';
import SolarisImageWall from '../components/shared/SolarisImageWall';
import { useWhiskImages } from './whisk/hooks/useWhiskImages';
import { useImageStudio } from './whisk/hooks/useImageStudio';
import { useVideoGeneration } from './whisk/hooks/useVideoGeneration';
import { useConfig } from '../contexts/ConfigContext';
import { shareImage } from '../services/s3';
import { selectGeneratedImage } from '../services/images';
import { listLoraCatalog, listLoraProfiles } from '../services/lora';
import { fetchDirectorConfig } from '../services/operations';
import { removeSessionCache } from '../utils/sessionCache';
import CharacterLoraSelector from '../components/shared/CharacterLoraSelector';

const CACHE_MAX_AGE_MS = 5 * 60 * 1000;
const IMAGE_CACHE_KEY = 'whisk_images_cache';
const VIDEO_CACHE_KEY = 'whisk_videos_cache';

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

const toLoraSupportMap = (models = []) =>
  (Array.isArray(models) ? models : []).reduce((acc, item) => {
    const key = String(item?.key || '').trim();
    if (key) acc[key] = Boolean(item?.supportsLora);
    return acc;
  }, {});

const buildSupportedModels = (supportMap = {}) =>
  Object.keys(supportMap).filter((k) => Boolean(supportMap[k]));

// ─── Sub-components ───────────────────────────────────────────────────────────

function PromptHelperPanel({ promptHelperProps, collapsed, onToggle }) {
  const {
    selections,
    onSelectionChange,
    onCharacterChange,
    onCreate,
    onAiGenerate,
    isLoading,
    status,
    promptBackgrounds,
    promptCharacters,
    promptPoses,
    promptTraits,
    promptFaceDetails,
    promptEyeDetails,
    promptBreastSizes,
    promptEars,
    promptTails,
    promptHorns,
    promptWings,
    promptHairStyles,
    promptViewDistance,
    promptAccessories,
    promptMarkings,
    promptOutfits,
    promptStyles,
  } = promptHelperProps;

  const fields = [
    { key: 'background', label: 'Background', options: promptBackgrounds },
    { key: 'pose', label: 'Pose', options: promptPoses },
    { key: 'signatureTraits', label: 'Traits', options: promptTraits },
    { key: 'faceDetails', label: 'Face', options: promptFaceDetails },
    { key: 'eyeDetails', label: 'Eyes', options: promptEyeDetails },
    { key: 'breastSize', label: 'Breast Size', options: promptBreastSizes },
    { key: 'ears', label: 'Ears', options: promptEars },
    { key: 'tails', label: 'Tails', options: promptTails },
    { key: 'horns', label: 'Horns', options: promptHorns },
    { key: 'wings', label: 'Wings', options: promptWings },
    { key: 'hairStyles', label: 'Hair', options: promptHairStyles },
    { key: 'viewDistance', label: 'View', options: promptViewDistance },
    { key: 'accessories', label: 'Accessories', options: promptAccessories },
    { key: 'markings', label: 'Markings', options: promptMarkings },
    { key: 'outfitMaterials', label: 'Outfit', options: promptOutfits },
    { key: 'styleReference', label: 'Style', options: promptStyles },
  ];

  return (
    <div style={{ border: '1px solid var(--sol-border)', borderRadius: 8, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: '100%', textAlign: 'left', padding: '10px 14px',
          background: 'var(--sol-surface)', border: 'none', cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: 13, fontWeight: 600, color: 'var(--sol-text-primary)',
        }}
      >
        <span>✨ Prompt Helper</span>
        <span style={{ fontSize: 11, opacity: 0.6 }}>{collapsed ? '▼ expand' : '▲ collapse'}</span>
      </button>
      {!collapsed && (
        <div style={{ padding: '14px', background: 'var(--sol-base)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Character preset */}
          <div>
            <label className="sol-field-label">Character preset</label>
            <select
              className="sol-field-select"
              value={selections.character || ''}
              onChange={e => onCharacterChange(e.target.value)}
            >
              <option value="">— None —</option>
              {(promptCharacters || []).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {/* All other fields in a 2-column grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {fields.map(({ key, label, options }) => (
              <div key={key}>
                <label className="sol-field-label" style={{ fontSize: 11 }}>{label}</label>
                <select
                  className="sol-field-select"
                  value={selections[key] || ''}
                  onChange={e => onSelectionChange(key, e.target.value)}
                  style={{ fontSize: 12 }}
                >
                  <option value="">—</option>
                  {(options || []).map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button className="sol-btn-secondary" style={{ flex: 1, fontSize: 12 }} onClick={onCreate} disabled={isLoading}>
              Build prompt
            </button>
            <button className="sol-btn-primary" style={{ flex: 1, fontSize: 12 }} onClick={onAiGenerate} disabled={isLoading}>
              {isLoading ? 'AI building…' : '✦ AI build'}
            </button>
          </div>
          {status === 'error' && <p style={{ fontSize: 11, color: '#ef4444', margin: 0 }}>Helper failed. Try again.</p>}
        </div>
      )}
    </div>
  );
}

function CivitaiLoraPanel({ imageGenerationProps, loraProfiles, selectedLoraProfileId, onLoraProfileChange }) {
  const {
    civitaiLoraMode,
    onCivitaiLoraModeChange,
    civitaiCatalogQuery,
    onCivitaiCatalogQueryChange,
    civitaiCatalogResults,
    civitaiRuntimeLoras,
    onAddCivitaiRuntimeLora,
    onRemoveCivitaiRuntimeLora,
    onCivitaiRuntimeLoraStrengthChange,
    civitaiRuntimeLoraLimit,
  } = imageGenerationProps;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          className={civitaiLoraMode === 'profile' ? 'sol-btn-primary' : 'sol-btn-secondary'}
          style={{ fontSize: 12, flex: 1 }}
          onClick={() => onCivitaiLoraModeChange('profile')}
        >
          Profile
        </button>
        <button
          className={civitaiLoraMode === 'quick' ? 'sol-btn-primary' : 'sol-btn-secondary'}
          style={{ fontSize: 12, flex: 1 }}
          onClick={() => onCivitaiLoraModeChange('quick')}
        >
          Quick Mode
        </button>
      </div>

      {civitaiLoraMode === 'profile' ? (
        <div>
          <label className="sol-field-label">LoRA Profile</label>
          <select className="sol-field-select" value={selectedLoraProfileId} onChange={e => onLoraProfileChange(e.target.value)}>
            <option value="">— None —</option>
            {loraProfiles.map(p => (
              <option key={p.id || p.characterId} value={p.id || p.characterId}>{p.name || p.displayName || p.id || p.characterId}</option>
            ))}
          </select>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Catalog search */}
          <div>
            <label className="sol-field-label">Search CivitAI catalog</label>
            <input
              className="sol-input"
              placeholder="e.g. frieren, outfit, style…"
              value={civitaiCatalogQuery}
              onChange={e => onCivitaiCatalogQueryChange(e.target.value)}
              style={{ fontSize: 12 }}
            />
          </div>
          {/* Catalog results */}
          {(civitaiCatalogResults || []).length > 0 && (
            <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {civitaiCatalogResults.map(entry => {
                const already = (civitaiRuntimeLoras || []).some(r => r.catalogId === entry.catalogId);
                const atLimit = (civitaiRuntimeLoras || []).length >= (civitaiRuntimeLoraLimit || 9);
                return (
                  <div key={entry.catalogId} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '6px 8px', background: 'var(--sol-surface)', borderRadius: 6, fontSize: 12,
                  }}>
                    <div>
                      <span style={{ fontWeight: 600, color: 'var(--sol-text-primary)' }}>{entry.name || entry.catalogId}</span>
                      {entry.baseModel && <span style={{ marginLeft: 6, color: 'var(--sol-text-tertiary)', fontSize: 11 }}>{entry.baseModel}</span>}
                    </div>
                    <button
                      className="sol-btn-secondary"
                      style={{ fontSize: 11, padding: '2px 8px' }}
                      onClick={() => onAddCivitaiRuntimeLora(entry)}
                      disabled={already || atLimit}
                    >
                      {already ? '✓' : '+'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {/* Active runtime LoRAs */}
          {(civitaiRuntimeLoras || []).length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <p style={{ fontSize: 11, color: 'var(--sol-text-tertiary)', margin: 0 }}>Active LoRAs ({civitaiRuntimeLoras.length}/{civitaiRuntimeLoraLimit || 9})</p>
              {civitaiRuntimeLoras.map(lora => (
                <div key={lora.catalogId} style={{ background: 'var(--sol-surface)', borderRadius: 6, padding: '6px 10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--sol-text-primary)' }}>{lora.name || lora.catalogId}</span>
                    <button
                      onClick={() => onRemoveCivitaiRuntimeLora(lora.catalogId)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sol-text-tertiary)', fontSize: 14 }}
                    >✕</button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="range" min={0} max={2} step={0.05}
                      value={lora.strength ?? 0.8}
                      onChange={e => onCivitaiRuntimeLoraStrengthChange(lora.catalogId, parseFloat(e.target.value))}
                      className="sol-strength-slider"
                      style={{ flex: 1 }}
                    />
                    <span style={{ fontSize: 11, color: 'var(--sol-text-secondary)', minWidth: 30 }}>{(lora.strength ?? 0.8).toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Whisk() {
  const { apiBaseUrl } = useConfig();

  const [error, setError] = useState('');
  const [activeModal, setActiveModal] = useState(''); // '' | 'generate' | 'video'
  const [lightboxImage, setLightboxImage] = useState(null);
  const [promptPreviewImage, setPromptPreviewImage] = useState(null);
  const [sharingImageKey, setSharingImageKey] = useState('');

  // LoRA / config state (parallel to pixnovel pattern)
  const [loraProfiles, setLoraProfiles] = useState([]);
  const [loraCatalogEntries, setLoraCatalogEntries] = useState([]);
  // Character + LoRA cascade: selectedCharacterId drives which LoRA profiles are available
  const [selectedCharacterId, setSelectedCharacterId] = useState('');
  const [selectedLoraProfileId, setSelectedLoraProfileId] = useState('');
  const [loraCapabilities, setLoraCapabilities] = useState(EMPTY_LORA_CAPABILITIES);
  const [directorModelOptions, setDirectorModelOptions] = useState(EMPTY_DIRECTOR_MODEL_OPTIONS);
  const [isLoadingLoraData, setIsLoadingLoraData] = useState(false);

  // Video source image selection
  const [selectedImageKey, setSelectedImageKey] = useState('');
  const [selectedSourceImageKey, setSelectedSourceImageKey] = useState('');
  const [selectedImageUrl, setSelectedImageUrl] = useState('');

  // Prompt helper collapsed state
  const [promptHelperCollapsed, setPromptHelperCollapsed] = useState(true);

  // ─── Hooks ─────────────────────────────────────────────────────────────────

  const { images, status, refreshImages, updateImages, removeImage, toggleImageFavorite } = useWhiskImages({
    apiBaseUrl,
    cacheKey: IMAGE_CACHE_KEY,
    cacheMaxAge: CACHE_MAX_AGE_MS,
    onError: setError,
  });

  const invalidateVideoCache = useCallback(() => {
    removeSessionCache(VIDEO_CACHE_KEY);
  }, []);

  const handleVideoReady = useCallback(({ key, url, sourceKey }) => {
    if (key) setSelectedImageKey(key);
    if (sourceKey) setSelectedSourceImageKey(sourceKey);
    if (typeof url === 'string') setSelectedImageUrl(url);
  }, []);

  const resetVideoReady = useCallback(() => {
    setSelectedImageKey('');
    setSelectedSourceImageKey('');
    setSelectedImageUrl('');
  }, []);

  const addVideoReadyImage = useCallback((image) => {
    if (!image?.key || !image?.url) return;
    updateImages((prev) => {
      if (prev.some(item => item.key === image.key)) return prev;
      return [image, ...prev];
    });
  }, [updateImages]);

  const {
    imageSource,
    setImageSource,
    imageSourceOptions,
    imageGenerationProps,
    imageUploadProps,
    isGeneratingImage,
    isUploading,
  } = useImageStudio({
    apiBaseUrl,
    selectedLoraProfileId,
    loraImageSupportByModel: loraCapabilities.imageByModel,
    loraImageSupportByProviderModel: loraCapabilities.imageByProviderModel,
    supportedImageLoraModels: loraCapabilities.supportedImageModels,
    supportedImageLoraModelsByProvider: loraCapabilities.supportedImageModelsByProvider,
    loraCatalogEntries,
    directorImageModels: directorModelOptions.imageModels,
    directorCivitaiModels: directorModelOptions.civitaiModels,
    directorGenerationByModel: directorModelOptions.generationByModel,
    onError: setError,
    onVideoReady: handleVideoReady,
    onResetVideoReady: resetVideoReady,
    onAddVideoReadyImage: addVideoReadyImage,
    onCloseImageModal: () => setActiveModal(''),
    onGenerationComplete: () => refreshImages(true),
  });

  const {
    videoProvider,
    videoProviderOptions,
    videoModel,
    videoModelOptions,
    setVideoProvider,
    setVideoModel,
    videoGenerateAudio,
    setVideoGenerateAudio,
    isReplicateAudioOption,
    isGenerating: isGeneratingVideo,
    isVideoInProgress,
    prompt: videoPrompt,
    setPrompt: setVideoPrompt,
    handleGenerateVideo,
  } = useVideoGeneration({
    apiBaseUrl,
    selectedImageKey,
    selectedSourceImageKey,
    selectedImageUrl,
    selectedLoraProfileId,
    loraVideoSupportByModel: loraCapabilities.videoByModel,
    supportedVideoLoraModels: loraCapabilities.supportedVideoModels,
    directorVideoModels: directorModelOptions.videoModels,
    onError: setError,
    onSubmitted: () => {},
    onCompleted: () => {
      invalidateVideoCache();
      setActiveModal('');
    },
  });

  // ─── Load config on mount ───────────────────────────────────────────────────

  useEffect(() => {
    if (!apiBaseUrl) {
      setLoraProfiles([]);
      setLoraCatalogEntries([]);
      setSelectedCharacterId('');
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
        const imageModels = Array.isArray(configPayload?.options?.generation?.imageModels) ? configPayload.options.generation.imageModels : [];
        const civitaiModels = Array.isArray(configPayload?.options?.generation?.civitaiModels) ? configPayload.options.generation.civitaiModels : [];
        const generationByModel = (configPayload?.options?.generation?.byModel && typeof configPayload.options.generation.byModel === 'object')
          ? configPayload.options.generation.byModel : {};
        const videoModels = Array.isArray(configPayload?.options?.video?.models) ? configPayload.options.video.models : [];

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
        setError(loadError?.message || 'Failed to load configuration.');
      })
      .finally(() => {
        if (!isCancelled) setIsLoadingLoraData(false);
      });

    return () => { isCancelled = true; };
  }, [apiBaseUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleShare = useCallback(async (image) => {
    if (!apiBaseUrl || !image?.key) return;
    setSharingImageKey(image.key);
    try {
      await shareImage(apiBaseUrl, image.key);
    } catch (e) {
      setError(e?.message || 'Failed to share image.');
    } finally {
      setSharingImageKey('');
    }
  }, [apiBaseUrl]);

  const handleOpenVideo = useCallback(async (image) => {
    if (!image?.key || !apiBaseUrl) return;
    try {
      await selectGeneratedImage(apiBaseUrl, image.key);
      setSelectedImageKey(image.key);
      setSelectedSourceImageKey(image.key);
      setSelectedImageUrl(image.url || '');
    } catch (e) {
      setError(e?.message || 'Failed to select image for video.');
      return;
    }
    setActiveModal('video');
  }, [apiBaseUrl]);

  const closeModal = useCallback(() => {
    setActiveModal('');
    refreshImages(true);
  }, [refreshImages]);

  // ─── Destructure generation props for quick panel ──────────────────────────

  const {
    imageModel,
    imageModelOptions,
    onSelectModel,
    imagePrompt,
    onImagePromptChange,
    imageNegativePrompt,
    onImageNegativePromptChange,
    imageSize,
    imageSizeOptions,
    onImageSizeChange,
    imageCount,
    imageCountOptions,
    onImageCountChange,
    imageScheduler,
    imageSchedulerOptions,
    onImageSchedulerChange,
    imageGenerationName,
    onImageNameChange,
    onGenerateImage,
    imageGenerationNotice,
    loraSupportNotice,
    promptHelperProps,
  } = imageGenerationProps;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="sol-split" style={{ height: 'calc(100vh - 112px)' }}>

      {/* ── Left: image gallery ── */}
      <div className="sol-split-canvas">
        <div className="sol-page-header">
          <h2 className="sol-page-title">Generator</h2>
          <p className="sol-page-subtitle">
            {isLoadingLoraData ? 'Loading configuration…' : 'Your generated images'}
          </p>
        </div>

        <SolarisImageWall
          images={images}
          status={status}
          onOpenLightbox={setLightboxImage}
          onDeleteImage={removeImage}
          onToggleFavorite={toggleImageFavorite}
          onShareImage={handleShare}
          sharingImageKey={sharingImageKey}
          onViewPrompt={setPromptPreviewImage}
          onOpenVideo={handleOpenVideo}
          canLoadMore={false}
          totalCount={images.length}
        />

        {lightboxImage && (
          <div className="sol-lightbox" onClick={() => setLightboxImage(null)}>
            <button className="sol-lightbox-close" onClick={() => setLightboxImage(null)}>✕</button>
            <img src={lightboxImage.url} alt={lightboxImage.prompt || ''} onClick={e => e.stopPropagation()} />
          </div>
        )}

        {promptPreviewImage && (
          <div className="sol-modal-backdrop" onClick={() => setPromptPreviewImage(null)}>
            <div className="sol-modal" onClick={e => e.stopPropagation()}>
              <div className="sol-modal-header">
                <span className="sol-modal-title">Prompt</span>
                <button className="sol-modal-close" onClick={() => setPromptPreviewImage(null)}>✕</button>
              </div>
              <p style={{ fontSize: 13, color: 'var(--sol-text-secondary)', lineHeight: 1.6 }}>
                {promptPreviewImage?.prompt || 'No prompt recorded.'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Right: quick controls ── */}
      <div className="sol-split-controls">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%', overflowY: 'auto' }}>

          {/* Source tabs */}
          <div>
            <label className="sol-field-label">Source</label>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {(imageSourceOptions || []).map(opt => (
                <button
                  key={opt.key}
                  className={imageSource === opt.key ? 'sol-btn-primary' : 'sol-btn-secondary'}
                  style={{ fontSize: 11, padding: '4px 10px' }}
                  onClick={() => setImageSource(opt.key)}
                >
                  {opt.name}
                </button>
              ))}
            </div>
          </div>

          {imageSource !== 'upload' ? (
            <>
              {/* Image name */}
              <div>
                <label className="sol-field-label">Name <span style={{ color: 'var(--sol-text-tertiary)', fontWeight: 400 }}>(optional)</span></label>
                <input
                  className="sol-input"
                  placeholder="e.g. frieren-forest-scene"
                  value={imageGenerationName}
                  onChange={e => onImageNameChange(e.target.value)}
                />
              </div>

              {/* Model */}
              <div>
                <label className="sol-field-label">Model</label>
                <select className="sol-field-select" value={imageModel} onChange={e => onSelectModel(e.target.value)}>
                  {(imageModelOptions || []).map(m => (
                    <option key={m.key} value={m.key}>{m.name || m.label || m.key}</option>
                  ))}
                </select>
              </div>

              {/* Size */}
              <div>
                <label className="sol-field-label">Size</label>
                <select className="sol-field-select" value={imageSize} onChange={e => onImageSizeChange(e.target.value)}>
                  {(imageSizeOptions || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              {/* Prompt */}
              <div>
                <label className="sol-field-label">Prompt</label>
                <textarea
                  className="sol-input"
                  rows={4}
                  placeholder="Describe what to generate…"
                  value={imagePrompt}
                  onChange={e => onImagePromptChange(e.target.value)}
                  style={{ resize: 'vertical', width: '100%' }}
                />
              </div>

              {/* Character + LoRA cascade (non-civitai) */}
              {imageSource !== 'civitai' && (
                <CharacterLoraSelector
                  apiBaseUrl={apiBaseUrl}
                  characterId={selectedCharacterId}
                  loraProfileId={selectedLoraProfileId}
                  onCharacterChange={setSelectedCharacterId}
                  onLoraChange={setSelectedLoraProfileId}
                  compact
                />
              )}

              {/* CivitAI: LoRA panel */}
              {imageSource === 'civitai' && (
                <CivitaiLoraPanel
                  imageGenerationProps={imageGenerationProps}
                  loraProfiles={loraProfiles}
                  selectedLoraProfileId={selectedLoraProfileId}
                  onLoraProfileChange={setSelectedLoraProfileId}
                />
              )}

              {/* Full options button */}
              <button
                className="sol-btn-secondary"
                style={{ fontSize: 12 }}
                onClick={() => setActiveModal('generate')}
              >
                ⚙ Full options…
              </button>

              {/* Notice */}
              {imageGenerationNotice && (
                <p style={{ fontSize: 11, color: 'var(--sol-text-secondary)', margin: 0 }}>{imageGenerationNotice}</p>
              )}

              {error && <p style={{ fontSize: 12, color: '#ef4444', margin: 0 }}>{error}</p>}

              <button
                className="sol-btn-primary"
                style={{ width: '100%', marginTop: 4 }}
                onClick={() => { setError(''); onGenerateImage(); }}
                disabled={isGeneratingImage || !imagePrompt.trim()}
              >
                {isGeneratingImage ? 'Generating…' : 'Generate'}
              </button>

            </>
          ) : (
            /* Upload panel */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label className="sol-field-label">Image name</label>
                <input
                  className="sol-input"
                  placeholder="my-image"
                  value={imageUploadProps.imageName}
                  onChange={e => imageUploadProps.onImageNameChange(e.target.value)}
                />
              </div>
              <div>
                <label className="sol-field-label">File</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={imageUploadProps.onFileChange}
                  style={{ fontSize: 13, color: 'var(--sol-text-primary)' }}
                />
              </div>
              {imageUploadProps.previewUrl && (
                <img src={imageUploadProps.previewUrl} alt="preview" style={{ maxWidth: '100%', borderRadius: 8, maxHeight: 200, objectFit: 'contain' }} />
              )}
              {error && <p style={{ fontSize: 12, color: '#ef4444', margin: 0 }}>{error}</p>}
              <button
                className="sol-btn-primary"
                onClick={imageUploadProps.onUpload}
                disabled={isUploading || !imageUploadProps.selectedFile}
              >
                {isUploading ? 'Uploading…' : 'Upload'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Full generation modal ── */}
      {activeModal === 'generate' && (
        <div className="sol-modal-backdrop" onClick={closeModal}>
          <div
            className="sol-modal"
            style={{ width: 680, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="sol-modal-header">
              <span className="sol-modal-title">Image Generation</span>
              <button className="sol-modal-close" onClick={closeModal}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Source selector */}
              <div>
                <label className="sol-field-label">Source</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(imageSourceOptions || []).map(opt => (
                    <button
                      key={opt.key}
                      className={imageSource === opt.key ? 'sol-btn-primary' : 'sol-btn-secondary'}
                      style={{ fontSize: 12, padding: '5px 12px' }}
                      onClick={() => setImageSource(opt.key)}
                    >
                      {opt.name}
                    </button>
                  ))}
                </div>
              </div>

              {imageSource !== 'upload' ? (
                <>
                  {/* Generation name */}
                  <div>
                    <label className="sol-field-label">Generation name <span style={{ color: 'var(--sol-text-tertiary)', fontWeight: 400 }}>(optional)</span></label>
                    <input
                      className="sol-input"
                      placeholder="e.g. frieren-forest-scene"
                      value={imageGenerationName}
                      onChange={e => onImageNameChange(e.target.value)}
                    />
                  </div>

                  {/* Model */}
                  <div>
                    <label className="sol-field-label">Model</label>
                    <select className="sol-field-select" value={imageModel} onChange={e => onSelectModel(e.target.value)}>
                      {(imageModelOptions || []).map(m => (
                        <option key={m.key} value={m.key}>{m.name || m.label || m.key}{m.description ? ` — ${m.description}` : ''}</option>
                      ))}
                    </select>
                  </div>

                  {/* Prompt */}
                  <div>
                    <label className="sol-field-label">Prompt</label>
                    <textarea
                      className="sol-input"
                      rows={5}
                      placeholder="Describe what to generate…"
                      value={imagePrompt}
                      onChange={e => onImagePromptChange(e.target.value)}
                      style={{ resize: 'vertical', width: '100%' }}
                    />
                  </div>

                  {/* Negative prompt */}
                  <div>
                    <label className="sol-field-label">Negative prompt</label>
                    <textarea
                      className="sol-input"
                      rows={3}
                      placeholder="What to avoid…"
                      value={imageNegativePrompt}
                      onChange={e => onImageNegativePromptChange(e.target.value)}
                      style={{ resize: 'vertical', width: '100%' }}
                    />
                  </div>

                  {/* Size / Count / Scheduler */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    <div>
                      <label className="sol-field-label">Size</label>
                      <select className="sol-field-select" value={imageSize} onChange={e => onImageSizeChange(e.target.value)}>
                        {(imageSizeOptions || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="sol-field-label">Count</label>
                      <select className="sol-field-select" value={imageCount} onChange={e => onImageCountChange(e.target.value)}>
                        {(imageCountOptions || []).map(o => <option key={o.value} value={o.value}>{o.label || o.value}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="sol-field-label">Scheduler</label>
                      <select className="sol-field-select" value={imageScheduler} onChange={e => onImageSchedulerChange(e.target.value)}>
                        {(imageSchedulerOptions || []).map(o => <option key={o.value} value={o.value}>{o.label || o.value}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Character + LoRA cascade (non-civitai) */}
                  {imageSource !== 'civitai' && (
                    <CharacterLoraSelector
                      apiBaseUrl={apiBaseUrl}
                      characterId={selectedCharacterId}
                      loraProfileId={selectedLoraProfileId}
                      onCharacterChange={setSelectedCharacterId}
                      onLoraChange={setSelectedLoraProfileId}
                    />
                  )}

                  {/* CivitAI LoRA panel */}
                  {imageSource === 'civitai' && (
                    <div>
                      <label className="sol-field-label" style={{ marginBottom: 8 }}>LoRA configuration</label>
                      <CivitaiLoraPanel
                        imageGenerationProps={imageGenerationProps}
                        loraProfiles={loraProfiles}
                        selectedLoraProfileId={selectedLoraProfileId}
                        onLoraProfileChange={setSelectedLoraProfileId}
                      />
                    </div>
                  )}

                  {/* Prompt helper */}
                  <PromptHelperPanel
                    promptHelperProps={promptHelperProps}
                    collapsed={promptHelperCollapsed}
                    onToggle={() => setPromptHelperCollapsed(v => !v)}
                  />

                  {/* Notice / error */}
                  {imageGenerationNotice && (
                    <p style={{ fontSize: 12, color: 'var(--sol-text-secondary)', margin: 0 }}>{imageGenerationNotice}</p>
                  )}
                  {error && <p style={{ fontSize: 12, color: '#ef4444', margin: 0 }}>{error}</p>}

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
                    <button
                      className="sol-btn-primary"
                      style={{ flex: 1 }}
                      onClick={() => { setError(''); onGenerateImage(); }}
                      disabled={isGeneratingImage || !imagePrompt.trim()}
                    >
                      {isGeneratingImage ? 'Generating…' : 'Generate'}
                    </button>
                    <button className="sol-btn-secondary" onClick={closeModal} disabled={isGeneratingImage}>Cancel</button>
                  </div>
                </>
              ) : (
                /* Upload tab in modal */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label className="sol-field-label">Image name</label>
                    <input
                      className="sol-input"
                      placeholder="my-image"
                      value={imageUploadProps.imageName}
                      onChange={e => imageUploadProps.onImageNameChange(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="sol-field-label">File</label>
                    <input type="file" accept="image/*" onChange={imageUploadProps.onFileChange} style={{ fontSize: 13, color: 'var(--sol-text-primary)' }} />
                  </div>
                  {imageUploadProps.previewUrl && (
                    <img src={imageUploadProps.previewUrl} alt="preview" style={{ maxWidth: '100%', borderRadius: 8, maxHeight: 200, objectFit: 'contain' }} />
                  )}
                  {error && <p style={{ fontSize: 12, color: '#ef4444', margin: 0 }}>{error}</p>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="sol-btn-primary" style={{ flex: 1 }} onClick={imageUploadProps.onUpload} disabled={isUploading || !imageUploadProps.selectedFile}>
                      {isUploading ? 'Uploading…' : 'Upload'}
                    </button>
                    <button className="sol-btn-secondary" onClick={closeModal} disabled={isUploading}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Video generation modal ── */}
      {activeModal === 'video' && (
        <div className="sol-modal-backdrop" onClick={() => setActiveModal('')}>
          <div className="sol-modal" style={{ width: 480, maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
            <div className="sol-modal-header">
              <span className="sol-modal-title">Generate Video</span>
              <button className="sol-modal-close" onClick={() => setActiveModal('')}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Source image preview */}
              {selectedImageUrl && (
                <img
                  src={selectedImageUrl}
                  alt="Source"
                  style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 8 }}
                />
              )}

              {/* Provider */}
              <div>
                <label className="sol-field-label">Provider</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(videoProviderOptions || []).map(opt => (
                    <button
                      key={opt.key}
                      className={videoProvider === opt.key ? 'sol-btn-primary' : 'sol-btn-secondary'}
                      style={{ fontSize: 12, padding: '4px 12px' }}
                      onClick={() => setVideoProvider(opt.key)}
                    >
                      {opt.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Video model */}
              <div>
                <label className="sol-field-label">Video model</label>
                <select className="sol-field-select" value={videoModel} onChange={e => setVideoModel(e.target.value)}>
                  {(videoModelOptions || []).map(m => (
                    <option key={m.key} value={m.key}>{m.name || m.label || m.key}{m.description ? ` — ${m.description}` : ''}</option>
                  ))}
                </select>
              </div>

              {/* Motion prompt */}
              <div>
                <label className="sol-field-label">Motion prompt</label>
                <textarea
                  className="sol-input"
                  rows={3}
                  placeholder="Describe the motion or scene…"
                  value={videoPrompt}
                  onChange={e => setVideoPrompt(e.target.value)}
                  style={{ resize: 'vertical', width: '100%' }}
                />
              </div>

              {/* Audio toggle (Replicate only) */}
              {isReplicateAudioOption && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    id="vid-audio"
                    checked={videoGenerateAudio}
                    onChange={e => setVideoGenerateAudio(e.target.checked)}
                  />
                  <label htmlFor="vid-audio" className="sol-field-label" style={{ margin: 0, cursor: 'pointer' }}>Generate audio</label>
                </div>
              )}

              {error && <p style={{ fontSize: 12, color: '#ef4444', margin: 0 }}>{error}</p>}

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="sol-btn-primary"
                  style={{ flex: 1 }}
                  onClick={handleGenerateVideo}
                  disabled={isGeneratingVideo || isVideoInProgress}
                >
                  {isGeneratingVideo || isVideoInProgress ? 'Generating…' : 'Generate Video'}
                </button>
                <button className="sol-btn-secondary" onClick={() => setActiveModal('')} disabled={isGeneratingVideo || isVideoInProgress}>
                  Cancel
                </button>
              </div>

              {(isGeneratingVideo || isVideoInProgress) && (
                <p style={{ fontSize: 12, color: 'var(--sol-text-secondary)', textAlign: 'center' }}>
                  Video generation is running in the background. You can close this dialog — check the Videos page when done.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
