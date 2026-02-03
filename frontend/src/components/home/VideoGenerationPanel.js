import React from "react";

function VideoGenerationPanel({
  videoProvider,
  videoProviderOptions,
  onSelectVideoProvider,
  videoModel,
  videoModelOptions,
  onSelectVideoModel,
  imageListStatus,
  onRefreshImages,
  availableImages,
  selectedImageKey,
  onSelectImage,
  onDeleteImage,
  hideImageSelector = false,
  singleColumn = false,
  prompt,
  onPromptChange,
  isReplicateAudioOption,
  videoGenerateAudio,
  onToggleAudio,
  onGenerateVideo,
  isVideoInProgress,
  isGenerating,
  generationResponse,
  availableVideos,
}) {
  return (
    <div
      className={
        singleColumn
          ? "gallery-grid-2"
          : "gallery-grid-2 lg:grid-cols-[1.1fr_0.9fr]"
      }
    >
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

          {generationResponse && (
            <div className="mt-4 text-sm text-[#6b5c45]">
              <p className="font-semibold text-ink">Job submitted</p>
              <p className="mt-2">
                Output:{" "}
                <span className="font-mono">{generationResponse.outputS3Uri}</span>
              </p>
              <p className="mt-1">Model: {generationResponse.modelId}</p>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {!hideImageSelector && (
          <div className="gallery-section">
            <div className="flex items-center justify-between gap-3">
              <p className="field-label">Select an image</p>
              <button
                type="button"
                onClick={onRefreshImages}
                className="btn-ghost px-3 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                disabled={imageListStatus === "loading"}
              >
                {imageListStatus === "loading" ? "Loading..." : "Load images"}
              </button>
            </div>
            {availableImages.length === 0 ? (
              <p className="mt-3 text-sm text-[#7a6a51]">
                {imageListStatus === "error"
                  ? "Failed to load images."
                  : "Click “Load images” to fetch from S3."}
              </p>
            ) : (
              <div className="gallery-grid-3 mt-4 md:grid-cols-2">
                {availableImages.map((image) => {
                  const isSelected = selectedImageKey === image.key;
                  return (
                    <button
                      key={image.key}
                      type="button"
                      onClick={() => onSelectImage(image)}
                      className={`gallery-thumb p-3 text-left ${
                        isSelected ? "choice-tile--active" : ""
                      }`}
                    >
                      <img
                        src={image.url}
                        alt={image.key}
                        className="h-28 w-full rounded-xl object-cover"
                      />
                      <p className="mt-2 text-[11px] font-medium text-[#6b5c45]">
                        {image.key}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {image.url && (
                          <a
                            className="btn-ghost inline-flex px-3 py-1 text-[11px]"
                            href={image.url}
                            download
                            onClick={(event) => event.stopPropagation()}
                          >
                            Download
                          </a>
                        )}
                        <button
                          type="button"
                          className="btn-ghost inline-flex px-3 py-1 text-[11px] hover:border-[#c97b6b] hover:text-[#a15546]"
                          onClick={(event) => {
                            event.stopPropagation();
                            onDeleteImage(image);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            <p className="mt-3 text-xs text-[#7a6a51]">
              Showing video-ready images only.
            </p>
          </div>
        )}

        <div className="gallery-section">
          <p className="field-label">Available videos in S3</p>
          {availableVideos.length === 0 ? (
            <p className="mt-3 text-sm text-[#7a6a51]">No videos found yet.</p>
          ) : (
            <div className="mt-4 space-y-2 text-sm text-[#6b5c45]">
              {availableVideos.map((video) => (
                <div
                  key={video.key}
                  className="flex flex-col gap-2 rounded-xl border border-[#e3d8c6] bg-white/70 px-3 py-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs text-ink">
                      {video.fileName || video.key}
                    </span>
                    {video.url && (
                      <a
                        className="btn-ghost px-3 py-1 text-[11px]"
                        href={video.url}
                        download
                      >
                        Download
                      </a>
                    )}
                  </div>
                  <span className="text-xs text-[#7a6a51]">
                    {video.lastModified
                      ? new Date(video.lastModified).toLocaleString()
                      : "Unknown time"}
                    {typeof video.size === "number"
                      ? ` · ${Math.round(video.size / 1024)} KB`
                      : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default VideoGenerationPanel;
