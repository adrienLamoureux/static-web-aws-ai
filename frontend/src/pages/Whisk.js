import React, { useState, useCallback, useRef, useEffect } from 'react';
import SolarisImageWall from '../components/shared/SolarisImageWall';
import { useWhiskImages } from './whisk/hooks/useWhiskImages';
import { useImageStudio } from './whisk/hooks/useImageStudio';
import { useVideoGeneration } from './whisk/hooks/useVideoGeneration';
import { useWhiskInit } from './whisk/useWhiskInit';
import { useConfig } from '../contexts/ConfigContext';
import { shareImage } from '../services/s3';
import { selectGeneratedImage } from '../services/images';
import { removeSessionCache } from '../utils/sessionCache';
import CharacterLoraSelector from '../components/shared/CharacterLoraSelector';
import { useCompanion, CompanionActions } from '../lib/companion/CompanionContext';
import PromptHelperPanel from './whisk/PromptHelperPanel';
import CivitaiLoraPanel from './whisk/CivitaiLoraPanel';

const IMAGE_CACHE_KEY = 'whisk_images_cache';
const VIDEO_CACHE_KEY = 'whisk_videos_cache';
const CACHE_MAX_AGE_MS = 5 * 60 * 1000;

export default function Whisk() {
  const { apiBaseUrl } = useConfig();
  const { dispatch } = useCompanion();

  const [error, setError] = useState('');
  const [activeModal, setActiveModal] = useState(''); // '' | 'generate' | 'video'
  const [lightboxImage, setLightboxImage] = useState(null);
  const [promptPreviewImage, setPromptPreviewImage] = useState(null);
  const [sharingImageKey, setSharingImageKey] = useState('');

  // Character cascade (drives CharacterLoraSelector)
  const [selectedCharacterId, setSelectedCharacterId] = useState('');

  // Video source image selection
  const [selectedImageKey, setSelectedImageKey] = useState('');
  const [selectedSourceImageKey, setSelectedSourceImageKey] = useState('');
  const [selectedImageUrl, setSelectedImageUrl] = useState('');

  // Prompt helper collapsed state
  const [promptHelperCollapsed, setPromptHelperCollapsed] = useState(true);

  // ─── Init hook (LoRA catalog + director config) ─────────────────────────────

  const {
    loraProfiles,
    loraCatalogEntries,
    selectedLoraProfileId,
    setSelectedLoraProfileId,
    loraCapabilities,
    directorModelOptions,
  } = useWhiskInit({ apiBaseUrl, onError: setError });

  // ─── Image gallery hook ─────────────────────────────────────────────────────

  const { images, status, refreshImages, updateImages, removeImage, toggleImageFavorite } = useWhiskImages({
    apiBaseUrl,
    cacheKey: IMAGE_CACHE_KEY,
    cacheMaxAge: CACHE_MAX_AGE_MS,
    onError: setError,
  });

  // ─── Video helpers ──────────────────────────────────────────────────────────

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

  // ─── Image studio hook ──────────────────────────────────────────────────────

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

  // ─── Video generation hook ──────────────────────────────────────────────────

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

  // ─── Companion reactions for generation events ──────────────────────────────

  const prevGeneratingRef = useRef(false);
  useEffect(() => {
    if (isGeneratingImage && !prevGeneratingRef.current) {
      dispatch(CompanionActions.GENERATION_START, { type: "image" });
    } else if (!isGeneratingImage && prevGeneratingRef.current) {
      dispatch(CompanionActions.GENERATION_DONE, { type: "image", success: true });
    }
    prevGeneratingRef.current = isGeneratingImage;
  }, [isGeneratingImage, dispatch]);

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
    promptHelperProps,
  } = imageGenerationProps;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="skr-split" style={{ height: 'calc(100vh - 112px)' }}>

      {/* ── Left: image gallery ── */}
      <div className="skr-split-canvas">
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
          <div className="skr-lightbox" onClick={() => setLightboxImage(null)}>
            <button className="skr-lightbox-close" onClick={() => setLightboxImage(null)}>✕</button>
            <img src={lightboxImage.url} alt={lightboxImage.prompt || ''} onClick={e => e.stopPropagation()} />
          </div>
        )}

        {promptPreviewImage && (
          <div className="skr-modal-backdrop" onClick={() => setPromptPreviewImage(null)}>
            <div className="skr-modal" onClick={e => e.stopPropagation()}>
              <div className="skr-modal-header">
                <span className="skr-modal-title">Prompt</span>
                <button className="skr-modal-close" onClick={() => setPromptPreviewImage(null)}>✕</button>
              </div>
              <p style={{ fontSize: 13, color: 'var(--skr-text-secondary)', lineHeight: 1.6 }}>
                {promptPreviewImage?.prompt || 'No prompt recorded.'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Right: quick controls ── */}
      <div className="skr-split-controls">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%', overflowY: 'auto' }}>

          {/* Source tabs */}
          <div>
            <label className="skr-field-label">Source</label>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {(imageSourceOptions || []).map(opt => (
                <button
                  key={opt.key}
                  className={imageSource === opt.key ? 'skr-btn-primary' : 'skr-btn-secondary'}
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
                <label className="skr-field-label">Name <span style={{ color: 'var(--skr-text-tertiary)', fontWeight: 400 }}>(optional)</span></label>
                <input
                  className="skr-input"
                  placeholder="e.g. frieren-forest-scene"
                  value={imageGenerationName}
                  onChange={e => onImageNameChange(e.target.value)}
                />
              </div>

              {/* Model */}
              <div>
                <label className="skr-field-label">Model</label>
                <select className="skr-field-select" value={imageModel} onChange={e => onSelectModel(e.target.value)}>
                  {(imageModelOptions || []).map(m => (
                    <option key={m.key} value={m.key}>{m.name || m.label || m.key}</option>
                  ))}
                </select>
              </div>

              {/* Size */}
              <div>
                <label className="skr-field-label">Size</label>
                <select className="skr-field-select" value={imageSize} onChange={e => onImageSizeChange(e.target.value)}>
                  {(imageSizeOptions || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              {/* Prompt */}
              <div>
                <label className="skr-field-label">Prompt</label>
                <textarea
                  className="skr-input"
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
                className="skr-btn-secondary"
                style={{ fontSize: 12 }}
                onClick={() => setActiveModal('generate')}
              >
                ⚙ Full options…
              </button>

              {/* Notice */}
              {imageGenerationNotice && (
                <p style={{ fontSize: 11, color: 'var(--skr-text-secondary)', margin: 0 }}>{imageGenerationNotice}</p>
              )}

              {error && <p style={{ fontSize: 12, color: '#ef4444', margin: 0 }}>{error}</p>}

              <button
                className="skr-btn-primary"
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
                <label className="skr-field-label">Image name</label>
                <input
                  className="skr-input"
                  placeholder="my-image"
                  value={imageUploadProps.imageName}
                  onChange={e => imageUploadProps.onImageNameChange(e.target.value)}
                />
              </div>
              <div>
                <label className="skr-field-label">File</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={imageUploadProps.onFileChange}
                  style={{ fontSize: 13, color: 'var(--skr-text-primary)' }}
                />
              </div>
              {imageUploadProps.previewUrl && (
                <img src={imageUploadProps.previewUrl} alt="preview" style={{ maxWidth: '100%', borderRadius: 8, maxHeight: 200, objectFit: 'contain' }} />
              )}
              {error && <p style={{ fontSize: 12, color: '#ef4444', margin: 0 }}>{error}</p>}
              <button
                className="skr-btn-primary"
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
        <div className="skr-modal-backdrop" onClick={closeModal}>
          <div
            className="skr-modal"
            style={{ width: 680, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="skr-modal-header">
              <span className="skr-modal-title">Image Generation</span>
              <button className="skr-modal-close" onClick={closeModal}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Source selector */}
              <div>
                <label className="skr-field-label">Source</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(imageSourceOptions || []).map(opt => (
                    <button
                      key={opt.key}
                      className={imageSource === opt.key ? 'skr-btn-primary' : 'skr-btn-secondary'}
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
                    <label className="skr-field-label">Generation name <span style={{ color: 'var(--skr-text-tertiary)', fontWeight: 400 }}>(optional)</span></label>
                    <input
                      className="skr-input"
                      placeholder="e.g. frieren-forest-scene"
                      value={imageGenerationName}
                      onChange={e => onImageNameChange(e.target.value)}
                    />
                  </div>

                  {/* Model */}
                  <div>
                    <label className="skr-field-label">Model</label>
                    <select className="skr-field-select" value={imageModel} onChange={e => onSelectModel(e.target.value)}>
                      {(imageModelOptions || []).map(m => (
                        <option key={m.key} value={m.key}>{m.name || m.label || m.key}{m.description ? ` — ${m.description}` : ''}</option>
                      ))}
                    </select>
                  </div>

                  {/* Prompt */}
                  <div>
                    <label className="skr-field-label">Prompt</label>
                    <textarea
                      className="skr-input"
                      rows={5}
                      placeholder="Describe what to generate…"
                      value={imagePrompt}
                      onChange={e => onImagePromptChange(e.target.value)}
                      style={{ resize: 'vertical', width: '100%' }}
                    />
                  </div>

                  {/* Negative prompt */}
                  <div>
                    <label className="skr-field-label">Negative prompt</label>
                    <textarea
                      className="skr-input"
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
                      <label className="skr-field-label">Size</label>
                      <select className="skr-field-select" value={imageSize} onChange={e => onImageSizeChange(e.target.value)}>
                        {(imageSizeOptions || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="skr-field-label">Count</label>
                      <select className="skr-field-select" value={imageCount} onChange={e => onImageCountChange(e.target.value)}>
                        {(imageCountOptions || []).map(o => <option key={o.value} value={o.value}>{o.label || o.value}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="skr-field-label">Scheduler</label>
                      <select className="skr-field-select" value={imageScheduler} onChange={e => onImageSchedulerChange(e.target.value)}>
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
                      <label className="skr-field-label" style={{ marginBottom: 8 }}>LoRA configuration</label>
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
                    <p style={{ fontSize: 12, color: 'var(--skr-text-secondary)', margin: 0 }}>{imageGenerationNotice}</p>
                  )}
                  {error && <p style={{ fontSize: 12, color: '#ef4444', margin: 0 }}>{error}</p>}

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
                    <button
                      className="skr-btn-primary"
                      style={{ flex: 1 }}
                      onClick={() => { setError(''); onGenerateImage(); }}
                      disabled={isGeneratingImage || !imagePrompt.trim()}
                    >
                      {isGeneratingImage ? 'Generating…' : 'Generate'}
                    </button>
                    <button className="skr-btn-secondary" onClick={closeModal} disabled={isGeneratingImage}>Cancel</button>
                  </div>
                </>
              ) : (
                /* Upload tab in modal */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label className="skr-field-label">Image name</label>
                    <input
                      className="skr-input"
                      placeholder="my-image"
                      value={imageUploadProps.imageName}
                      onChange={e => imageUploadProps.onImageNameChange(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="skr-field-label">File</label>
                    <input type="file" accept="image/*" onChange={imageUploadProps.onFileChange} style={{ fontSize: 13, color: 'var(--skr-text-primary)' }} />
                  </div>
                  {imageUploadProps.previewUrl && (
                    <img src={imageUploadProps.previewUrl} alt="preview" style={{ maxWidth: '100%', borderRadius: 8, maxHeight: 200, objectFit: 'contain' }} />
                  )}
                  {error && <p style={{ fontSize: 12, color: '#ef4444', margin: 0 }}>{error}</p>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="skr-btn-primary" style={{ flex: 1 }} onClick={imageUploadProps.onUpload} disabled={isUploading || !imageUploadProps.selectedFile}>
                      {isUploading ? 'Uploading…' : 'Upload'}
                    </button>
                    <button className="skr-btn-secondary" onClick={closeModal} disabled={isUploading}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Video generation modal ── */}
      {activeModal === 'video' && (
        <div className="skr-modal-backdrop" onClick={() => setActiveModal('')}>
          <div className="skr-modal" style={{ width: 480, maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
            <div className="skr-modal-header">
              <span className="skr-modal-title">Generate Video</span>
              <button className="skr-modal-close" onClick={() => setActiveModal('')}>✕</button>
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
                <label className="skr-field-label">Provider</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(videoProviderOptions || []).map(opt => (
                    <button
                      key={opt.key}
                      className={videoProvider === opt.key ? 'skr-btn-primary' : 'skr-btn-secondary'}
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
                <label className="skr-field-label">Video model</label>
                <select className="skr-field-select" value={videoModel} onChange={e => setVideoModel(e.target.value)}>
                  {(videoModelOptions || []).map(m => (
                    <option key={m.key} value={m.key}>{m.name || m.label || m.key}{m.description ? ` — ${m.description}` : ''}</option>
                  ))}
                </select>
              </div>

              {/* Motion prompt */}
              <div>
                <label className="skr-field-label">Motion prompt</label>
                <textarea
                  className="skr-input"
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
                  <label htmlFor="vid-audio" className="skr-field-label" style={{ margin: 0, cursor: 'pointer' }}>Generate audio</label>
                </div>
              )}

              {error && <p style={{ fontSize: 12, color: '#ef4444', margin: 0 }}>{error}</p>}

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="skr-btn-primary"
                  style={{ flex: 1 }}
                  onClick={handleGenerateVideo}
                  disabled={isGeneratingVideo || isVideoInProgress}
                >
                  {isGeneratingVideo || isVideoInProgress ? 'Generating…' : 'Generate Video'}
                </button>
                <button className="skr-btn-secondary" onClick={() => setActiveModal('')} disabled={isGeneratingVideo || isVideoInProgress}>
                  Cancel
                </button>
              </div>

              {(isGeneratingVideo || isVideoInProgress) && (
                <p style={{ fontSize: 12, color: 'var(--skr-text-secondary)', textAlign: 'center' }}>
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
