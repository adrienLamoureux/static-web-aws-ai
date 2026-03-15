import React from "react";
import PromptHelperForm from "./PromptHelperForm";

function ImageGenerationPanel({
  imageSource,
  imageModel,
  imageModelOptions,
  onSelectModel,
  loraProfileId,
  loraProfileOptions,
  onSelectLoraProfile,
  loraProfileDisabled,
  loraSupportNotice,
  civitaiLoraMode,
  onCivitaiLoraModeChange,
  civitaiCatalogQuery,
  onCivitaiCatalogQueryChange,
  civitaiCatalogResults = [],
  civitaiRuntimeLoras = [],
  onAddCivitaiRuntimeLora,
  onRemoveCivitaiRuntimeLora,
  onCivitaiRuntimeLoraStrengthChange,
  civitaiRuntimeLoraLimit = 9,
  imageGenerationName,
  onImageNameChange,
  promptHelperProps,
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
  onGenerateImage,
  isGeneratingImage,
  imageGenerationNotice,
  singleColumn = false,
}) {
  const isCivitaiQuickMode =
    imageSource === "civitai" && civitaiLoraMode === "quick";
  const canAddMoreRuntimeLoras =
    (civitaiRuntimeLoras || []).length < Number(civitaiRuntimeLoraLimit || 0);

  return (
    <div
      className={
        singleColumn
          ? "gallery-grid-2"
          : "gallery-grid-2 lg:grid-cols-[1.2fr_0.8fr]"
      }
    >
      <div className="space-y-6">
        <div className="gallery-section">
          <p className="field-label">Choose a model</p>
          <div className="choice-row mt-3 md:grid-cols-2">
            {imageModelOptions.map((option) => {
              const isSelected = imageModel === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => onSelectModel(option.key)}
                  className={`choice-tile ${
                    isSelected ? "choice-tile--active" : ""
                  }`}
                >
                  <p className="text-sm font-semibold pix-text-strong">
                    {option.name}
                  </p>
                  <p className="mt-1 text-xs pix-text-muted">
                    {option.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="gallery-section">
          <label className="field-label">LoRA setup</label>
          {imageSource === "civitai" ? (
            <>
              <div className="choice-row choice-row--inline mt-3">
                <button
                  type="button"
                  onClick={() => onCivitaiLoraModeChange?.("profile")}
                  className={`choice-tile choice-tile--compact ${
                    !isCivitaiQuickMode ? "choice-tile--active" : ""
                  }`}
                >
                  <p className="text-xs font-semibold pix-text-strong">
                    Saved profile
                  </p>
                  <p className="mt-1 text-[11px] pix-text-muted">
                    Use a predefined character profile.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => onCivitaiLoraModeChange?.("quick")}
                  className={`choice-tile choice-tile--compact ${
                    isCivitaiQuickMode ? "choice-tile--active" : ""
                  }`}
                >
                  <p className="text-xs font-semibold pix-text-strong">
                    Quick resources
                  </p>
                  <p className="mt-1 text-[11px] pix-text-muted">
                    Pick LoRAs from your synced CivitAI catalog.
                  </p>
                </button>
              </div>

              {isCivitaiQuickMode ? (
                <div className="mt-3 space-y-3">
                  <input
                    className="field-input"
                    value={civitaiCatalogQuery}
                    onChange={(event) =>
                      onCivitaiCatalogQueryChange?.(event.target.value)
                    }
                    placeholder="Search synced LoRAs by name, tag, creator..."
                  />

                  <div className="civitai-lora-catalog">
                    {(civitaiCatalogResults || []).length === 0 ? (
                      <p className="text-xs pix-text-muted">
                        No synced catalog result. Sync LoRAs in `/lora` first.
                      </p>
                    ) : (
                      (civitaiCatalogResults || []).map((entry) => {
                        const alreadySelected = (civitaiRuntimeLoras || []).some(
                          (item) => item.catalogId === entry.catalogId
                        );
                        return (
                          <article
                            className="civitai-lora-item"
                            key={entry.catalogId}
                          >
                            <div className="civitai-lora-item-copy">
                              <p className="civitai-lora-item-title">
                                {entry.name || entry.catalogId}
                              </p>
                              <p className="civitai-lora-item-meta">
                                {[entry.baseModel, entry.creatorName]
                                  .filter(Boolean)
                                  .join(" • ") || "Catalog resource"}
                              </p>
                            </div>
                            <button
                              type="button"
                              className="btn-ghost px-3 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                              onClick={() => onAddCivitaiRuntimeLora?.(entry)}
                              disabled={alreadySelected || !canAddMoreRuntimeLoras}
                            >
                              {alreadySelected ? "Added" : "Add"}
                            </button>
                          </article>
                        );
                      })
                    )}
                  </div>

                  <div className="civitai-lora-selected">
                    {(civitaiRuntimeLoras || []).length === 0 ? (
                      <p className="text-xs pix-text-muted">
                        No quick LoRA selected.
                      </p>
                    ) : (
                      (civitaiRuntimeLoras || []).map((entry) => (
                        <article
                          className="civitai-lora-selected-item"
                          key={entry.catalogId}
                        >
                          <div>
                            <p className="civitai-lora-item-title">
                              {entry.name || entry.catalogId}
                            </p>
                            <p className="civitai-lora-item-meta">
                              {entry.catalogId}
                            </p>
                          </div>
                          <label className="civitai-lora-strength-input">
                            <span className="sr-only">Strength</span>
                            <input
                              className="field-input"
                              type="number"
                              min={0}
                              max={2}
                              step={0.05}
                              value={entry.strength}
                              onChange={(event) =>
                                onCivitaiRuntimeLoraStrengthChange?.(
                                  entry.catalogId,
                                  event.target.value
                                )
                              }
                            />
                          </label>
                          <button
                            type="button"
                            className="btn-ghost px-3 py-1 text-xs"
                            onClick={() =>
                              onRemoveCivitaiRuntimeLora?.(entry.catalogId)
                            }
                          >
                            Remove
                          </button>
                        </article>
                      ))
                    )}
                    <p className="text-xs pix-text-muted">
                      {(civitaiRuntimeLoras || []).length}/{civitaiRuntimeLoraLimit} resources
                      selected.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <select
                    className="field-select mt-3"
                    value={loraProfileId}
                    onChange={(event) => onSelectLoraProfile?.(event.target.value)}
                    disabled={loraProfileDisabled}
                  >
                    <option value="">No LoRA profile</option>
                    {(loraProfileOptions || []).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs pix-text-muted">
                    Optional. Choose a profile to apply LoRA prompt and weight
                    injection.
                  </p>
                </>
              )}
            </>
          ) : (
            <>
              <select
                className="field-select mt-3"
                value={loraProfileId}
                onChange={(event) => onSelectLoraProfile?.(event.target.value)}
                disabled={loraProfileDisabled}
              >
                <option value="">No LoRA profile</option>
                {(loraProfileOptions || []).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs pix-text-muted">
                Optional. Choose a profile to apply LoRA prompt and weight
                injection.
              </p>
            </>
          )}
          {loraSupportNotice ? (
            <p className="mt-2 text-xs text-rose-600">{loraSupportNotice}</p>
          ) : null}
        </div>

        <div className="gallery-section">
          <label className="field-label">Image name</label>
          <input
            className="field-input mt-3"
            value={imageGenerationName}
            onChange={(event) => onImageNameChange(event.target.value)}
            placeholder="frieren"
          />
          <p className="mt-2 text-xs pix-text-muted">
            Used for generated image and video filenames.
          </p>
        </div>

        <PromptHelperForm {...promptHelperProps} />

        <div className="gallery-section">
          <label className="field-label">Prompt</label>
          <textarea
            className="field-textarea mt-3 min-h-[110px]"
            value={imagePrompt}
            onChange={(event) => onImagePromptChange(event.target.value)}
            maxLength={900}
          />
        </div>

        <div className="gallery-section">
          <label className="field-label">Negative prompt</label>
          <textarea
            className="field-textarea mt-3 min-h-[90px]"
            value={imageNegativePrompt}
            onChange={(event) => onImageNegativePromptChange(event.target.value)}
            maxLength={900}
          />
        </div>
      </div>

      <div className="space-y-6">
        <div className="gallery-section">
          <label className="field-label">Size preset</label>
          <select
            className="field-select mt-3"
            value={imageSize}
            onChange={(event) => onImageSizeChange(event.target.value)}
          >
            {imageSizeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {imageSource === "replicate" && (
          <div className="gallery-section">
            <label className="field-label">Images</label>
            <select
              className="field-select mt-3"
              value={imageCount}
              onChange={(event) => onImageCountChange(event.target.value)}
              disabled={imageScheduler === "diff"}
            >
              {imageCountOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {imageScheduler === "diff" && (
              <p className="mt-2 text-xs pix-text-muted">
                Both schedulers selected. Generating two images.
              </p>
            )}
          </div>
        )}

        {imageSchedulerOptions.length > 0 && (
          <div className="gallery-section">
            <label className="field-label">Scheduler</label>
            <select
              className="field-select mt-3"
              value={imageScheduler}
              onChange={(event) => onImageSchedulerChange(event.target.value)}
            >
              {imageSchedulerOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="gallery-section">
          <div className="flex flex-wrap items-end gap-3">
            <button
              className="btn-primary flex-1 px-6 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              onClick={onGenerateImage}
              disabled={
                !imagePrompt.trim() ||
                !imageGenerationName.trim() ||
                isGeneratingImage
              }
            >
              Generate image
            </button>

          </div>

          {isGeneratingImage && (
            <div className="mt-4 flex items-center gap-3 text-xs pix-text-muted">
              <span className="h-2.5 w-2.5 rounded-full border-2 border-accent border-t-transparent" />
              {imageGenerationNotice ||
                "Rendering the image. This can take a bit..."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ImageGenerationPanel;
