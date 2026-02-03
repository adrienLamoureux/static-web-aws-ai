import React from "react";
import PromptHelperForm from "./PromptHelperForm";
import GeneratedImagesGrid from "./GeneratedImagesGrid";

function ImageGenerationPanel({
  imageModel,
  imageModelOptions,
  onSelectModel,
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
  imageScheduler,
  imageSchedulerOptions,
  onImageSchedulerChange,
  imageNumImages,
  onImageNumImagesChange,
  onGenerateImage,
  isGeneratingImage,
  imageGenerationNotice,
  generatedImages,
  selectedGeneratedKey,
  selectingImageKey,
  isSelectingImage,
  onSelectGeneratedImage,
}) {
  return (
    <div className="gallery-grid-2 lg:grid-cols-[1.2fr_0.8fr]">
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
                  <p className="text-sm font-semibold text-ink">
                    {option.name}
                  </p>
                  <p className="mt-1 text-xs text-[#7a6a51]">
                    {option.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="gallery-section">
          <label className="field-label">Image name</label>
          <input
            className="field-input mt-3"
            value={imageGenerationName}
            onChange={(event) => onImageNameChange(event.target.value)}
            placeholder="frieren"
          />
          <p className="mt-2 text-xs text-[#7a6a51]">
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

            <div className="min-w-[140px]">
              <label className="field-label">Images</label>
              <select
                className="field-select mt-3"
                value={imageNumImages}
                onChange={(event) =>
                  onImageNumImagesChange(Number(event.target.value))
                }
                disabled={isGeneratingImage || imageScheduler === "diff"}
              >
                {[1, 2, 3].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {isGeneratingImage && (
            <div className="mt-4 flex items-center gap-3 text-xs text-[#7a6a51]">
              <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              {imageGenerationNotice ||
                "Rendering two images sequentially. This can take a bit..."}
            </div>
          )}
        </div>

        <GeneratedImagesGrid
          images={generatedImages}
          selectedKey={selectedGeneratedKey}
          selectingKey={selectingImageKey}
          isSelecting={isSelectingImage}
          onSelect={onSelectGeneratedImage}
        />
      </div>
    </div>
  );
}

export default ImageGenerationPanel;
