import React from "react";

function VideoGenerationPanel({
  videoProvider,
  videoProviderOptions,
  onSelectVideoProvider,
  videoModel,
  videoModelOptions,
  onSelectVideoModel,
  selectedImageKey,
  prompt,
  onPromptChange,
  isReplicateAudioOption,
  videoGenerateAudio,
  onToggleAudio,
  onGenerateVideo,
  isVideoInProgress,
  isGenerating,
}) {
  return (
    <div className="space-y-6">
      <div className="gallery-section">
        <p className="field-label">Video provider</p>
        <div className="choice-row mt-3">
          {videoProviderOptions.map((option) => {
            const isSelected = videoProvider === option.key;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => onSelectVideoProvider(option.key)}
                className={`choice-tile ${
                  isSelected ? "choice-tile--active" : ""
                }`}
              >
                <p className="font-semibold text-ink">{option.name}</p>
                <p className="text-xs text-[#7a6a51]">{option.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="gallery-section">
        <p className="field-label">Model</p>
        <div className="choice-row mt-3">
          {videoModelOptions.map((option) => {
            const isSelected = videoModel === option.key;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => onSelectVideoModel(option.key)}
                className={`choice-tile ${
                  isSelected ? "choice-tile--active" : ""
                }`}
              >
                <p className="font-semibold text-ink">{option.name}</p>
                <p className="text-xs text-[#7a6a51]">{option.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="gallery-section">
        <label className="field-label">Prompt</label>
        <textarea
          className="field-textarea mt-3 min-h-[110px]"
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
        />
      </div>

      {isReplicateAudioOption && (
        <label className="gallery-section flex items-center gap-3 text-sm text-[#6b5c45]">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-[#d1c3aa] text-accent focus:ring-accent"
            checked={videoGenerateAudio}
            onChange={(event) => onToggleAudio(event.target.checked)}
          />
          Generate audio
        </label>
      )}

      <div className="gallery-section">
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="btn-accent px-6 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onGenerateVideo}
            disabled={!selectedImageKey || isVideoInProgress}
          >
            {isVideoInProgress ? "Generating…" : "Start video job"}
          </button>
        </div>

        {isVideoInProgress && (
          <div className="mt-3 flex items-center gap-3 text-xs text-[#7a6a51]">
            <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            {isGenerating
              ? "Submitting video job..."
              : "Rendering video in Bedrock..."}
          </div>
        )}
      </div>
    </div>
  );
}

export default VideoGenerationPanel;
