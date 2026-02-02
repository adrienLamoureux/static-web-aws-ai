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
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium text-slate-600">Choose a model</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {imageModelOptions.map((option) => {
              const isSelected = imageModel === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => onSelectModel(option.key)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    isSelected
                      ? "border-accent bg-glow shadow-soft"
                      : "border-slate-200 bg-white/70 hover:border-slate-300"
                  }`}
                >
                  <p className="text-sm font-semibold text-ink">
                    {option.name}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {option.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-slate-600">
            Image name
          </label>
          <input
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-ink shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            value={imageGenerationName}
            onChange={(event) => onImageNameChange(event.target.value)}
            placeholder="frieren"
          />
          <p className="mt-2 text-xs text-slate-500">
            Used for generated image and video filenames.
          </p>
        </div>

        <PromptHelperForm {...promptHelperProps} />

        <div>
          <label className="text-sm font-medium text-slate-600">Prompt</label>
          <textarea
            className="mt-2 min-h-[96px] w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-ink shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            value={imagePrompt}
            onChange={(event) => onImagePromptChange(event.target.value)}
            maxLength={900}
          />
        </div>

        <div>
          <label className="text-sm font-medium text-slate-600">
            Negative prompt
          </label>
          <textarea
            className="mt-2 min-h-[72px] w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-ink shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            value={imageNegativePrompt}
            onChange={(event) => onImageNegativePromptChange(event.target.value)}
            maxLength={900}
          />
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-slate-600">
            Size preset
          </label>
          <select
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-ink shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
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
          <div>
            <label className="text-sm font-medium text-slate-600">
              Scheduler
            </label>
            <select
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-ink shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
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

        <div className="flex flex-wrap items-end gap-3">
          <button
            className="flex-1 rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-black/90 disabled:cursor-not-allowed disabled:bg-slate-300"
            onClick={onGenerateImage}
            disabled={!imagePrompt.trim() || !imageGenerationName.trim() || isGeneratingImage}
          >
            Generate image
          </button>

          <div className="min-w-[140px]">
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Images
            </label>
            <select
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-2 text-sm text-ink shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              value={imageNumImages}
              onChange={(event) => onImageNumImagesChange(Number(event.target.value))}
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

        <GeneratedImagesGrid
          images={generatedImages}
          selectedKey={selectedGeneratedKey}
          selectingKey={selectingImageKey}
          isSelecting={isSelectingImage}
          onSelect={onSelectGeneratedImage}
        />

        {isGeneratingImage && (
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            {imageGenerationNotice ||
              "Rendering two images sequentially. This can take a bit..."}
          </div>
        )}
      </div>
    </div>
  );
}

export default ImageGenerationPanel;
