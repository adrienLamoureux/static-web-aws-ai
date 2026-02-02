import React from "react";

function ImageUploadPanel({
  imageName,
  onImageNameChange,
  selectedFile,
  previewUrl,
  onFileChange,
  onUpload,
  uploadKey,
  isUploading,
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-slate-600">Image name</label>
          <input
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-ink shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            value={imageName}
            onChange={(event) => onImageNameChange(event.target.value)}
            placeholder="frieren"
          />
          <p className="mt-2 text-xs text-slate-500">
            Stored as <span className="font-mono">images/NAME.jpg</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-accent hover:text-ink">
            Choose image
            <input
              hidden
              type="file"
              accept="image/jpeg"
              onChange={onFileChange}
            />
          </label>
          <button
            className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white transition hover:bg-black/90 disabled:cursor-not-allowed disabled:bg-slate-300"
            onClick={onUpload}
            disabled={!selectedFile || isUploading || !imageName.trim()}
          >
            Upload to S3
          </button>
        </div>

        {isUploading && (
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            Uploading image to S3...
          </div>
        )}

        {uploadKey && (
          <p className="text-sm text-slate-500">
            Uploaded as <span className="font-mono text-ink">{uploadKey}</span>
          </p>
        )}
      </div>

      <div className="space-y-4">
        {selectedFile && (
          <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white/60 p-4 md:grid-cols-[1.2fr_1fr]">
            <div>
              <p className="text-xs uppercase tracking-[0.26em] text-slate-500">
                Selected image
              </p>
              <p className="mt-2 text-base font-semibold text-ink">
                {selectedFile.name}
              </p>
              <p className="text-sm text-slate-500">
                {Math.round(selectedFile.size / 1024)} KB
              </p>
            </div>
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Preview"
                className="h-40 w-full rounded-2xl border border-slate-200 object-cover"
              />
            )}
          </div>
        )}
        <p className="text-xs text-slate-500">JPEG only, 1280x720 recommended.</p>
      </div>
    </div>
  );
}

export default ImageUploadPanel;
