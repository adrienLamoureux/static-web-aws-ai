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
    <div className="mt-6 space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-sm font-medium text-slate-600">Video provider</p>
          <div className="mt-3 grid gap-2">
            {videoProviderOptions.map((option) => {
              const isSelected = videoProvider === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => onSelectVideoProvider(option.key)}
                  className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${
                    isSelected
                      ? "border-accent bg-glow shadow-soft"
                      : "border-slate-200 bg-white/70 hover:border-slate-300"
                  }`}
                >
                  <p className="font-semibold text-ink">{option.name}</p>
                  <p className="text-xs text-slate-500">{option.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-slate-600">Model</p>
          <div className="mt-3 grid gap-2">
            {videoModelOptions.map((option) => {
              const isSelected = videoModel === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => onSelectVideoModel(option.key)}
                  className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${
                    isSelected
                      ? "border-accent bg-glow shadow-soft"
                      : "border-slate-200 bg-white/70 hover:border-slate-300"
                  }`}
                >
                  <p className="font-semibold text-ink">{option.name}</p>
                  <p className="text-xs text-slate-500">{option.description}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-slate-600">Select an image</p>
          <button
            type="button"
            onClick={onRefreshImages}
            className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-accent hover:text-ink disabled:cursor-not-allowed disabled:bg-slate-100"
            disabled={imageListStatus === "loading"}
          >
            {imageListStatus === "loading" ? "Loading..." : "Load images"}
          </button>
        </div>
        {availableImages.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            {imageListStatus === "error"
              ? "Failed to load images."
              : "Click “Load images” to fetch from S3."}
          </p>
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {availableImages.map((image) => {
              const isSelected = selectedImageKey === image.key;
              return (
                <button
                  key={image.key}
                  type="button"
                  onClick={() => onSelectImage(image)}
                  className={`overflow-hidden rounded-2xl border p-3 text-left transition ${
                    isSelected
                      ? "border-accent bg-glow shadow-soft"
                      : "border-slate-200 bg-white/70 hover:border-slate-300"
                  }`}
                >
                  <img
                    src={image.url}
                    alt={image.key}
                    className="h-32 w-full rounded-xl object-cover"
                  />
                  <p className="mt-2 text-xs font-medium text-slate-600">
                    {image.key}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {image.url && (
                      <a
                        className="inline-flex rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-accent hover:text-ink"
                        href={image.url}
                        download
                        onClick={(event) => event.stopPropagation()}
                      >
                        Download
                      </a>
                    )}
                    <button
                      type="button"
                      className="inline-flex rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-red-400 hover:text-red-600"
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
        <p className="mt-3 text-xs text-slate-500">
          Showing video-ready images only.
        </p>
      </div>

      <div>
        <label className="text-sm font-medium text-slate-600">Prompt</label>
        <textarea
          className="mt-2 min-h-[96px] w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-ink shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
        />
      </div>

      {isReplicateAudioOption && (
        <label className="flex items-center gap-3 text-sm text-slate-600">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-accent focus:ring-accent"
            checked={videoGenerateAudio}
            onChange={(event) => onToggleAudio(event.target.checked)}
          />
          Generate audio
        </label>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded-full bg-accent px-6 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          onClick={onGenerateVideo}
          disabled={!selectedImageKey || isVideoInProgress}
        >
          {isVideoInProgress ? "Generating…" : "Start video job"}
        </button>
      </div>

      {isVideoInProgress && (
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          {isGenerating ? "Submitting video job..." : "Rendering video in Bedrock..."}
        </div>
      )}

      {generationResponse && (
        <div className="rounded-2xl border border-slate-200 bg-white/60 p-4 text-sm text-slate-600">
          <p className="font-semibold text-ink">Job submitted</p>
          <p className="mt-2">
            Output: <span className="font-mono">{generationResponse.outputS3Uri}</span>
          </p>
          <p className="mt-1">Model: {generationResponse.modelId}</p>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white/60 p-4">
        <p className="text-sm font-semibold text-ink">Available videos in S3</p>
        {availableVideos.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No videos found yet.</p>
        ) : (
          <div className="mt-3 space-y-2 text-sm text-slate-600">
            {availableVideos.map((video) => (
              <div
                key={video.key}
                className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/70 px-3 py-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs text-ink">
                    {video.fileName || video.key}
                  </span>
                  {video.url && (
                    <a
                      className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-accent hover:text-ink"
                      href={video.url}
                      download
                    >
                      Download
                    </a>
                  )}
                </div>
                <span className="text-xs text-slate-500">
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
  );
}

export default VideoGenerationPanel;
