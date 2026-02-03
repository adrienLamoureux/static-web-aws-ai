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
    <div className="gallery-grid-2 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-5">
        <div className="gallery-section">
          <label className="field-label">Image name</label>
          <input
            className="field-input mt-3"
            value={imageName}
            onChange={(event) => onImageNameChange(event.target.value)}
            placeholder="frieren"
          />
          <p className="mt-2 text-xs text-[#7a6a51]">
            Stored as <span className="font-mono">images/NAME.jpg</span>
          </p>
        </div>

        <div className="gallery-section">
          <div className="flex flex-wrap items-center gap-3">
            <label className="btn-ghost inline-flex cursor-pointer items-center gap-2 px-4 py-2 text-sm">
              Choose image
              <input
                hidden
                type="file"
                accept="image/jpeg"
                onChange={onFileChange}
              />
            </label>
            <button
              className="btn-primary px-5 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              onClick={onUpload}
              disabled={!selectedFile || isUploading || !imageName.trim()}
            >
              Upload to S3
            </button>
          </div>

          {isUploading && (
            <div className="mt-3 flex items-center gap-3 text-xs text-[#7a6a51]">
              <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              Uploading image to S3...
            </div>
          )}

          {uploadKey && (
            <p className="mt-3 text-sm text-[#7a6a51]">
              Uploaded as <span className="font-mono text-ink">{uploadKey}</span>
            </p>
          )}
        </div>
      </div>

      <div className="space-y-5">
        {selectedFile && (
          <div className="gallery-section">
            <p className="field-label">Selected image</p>
            <p className="mt-2 text-base font-semibold text-ink">
              {selectedFile.name}
            </p>
            <p className="text-sm text-[#7a6a51]">
              {Math.round(selectedFile.size / 1024)} KB
            </p>
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Preview"
                className="mt-4 h-44 w-full rounded-2xl border border-[#e3d8c6] object-cover"
              />
            )}
          </div>
        )}
        <p className="text-xs text-[#7a6a51]">JPEG only, 1280x720 recommended.</p>
      </div>
    </div>
  );
}

export default ImageUploadPanel;
