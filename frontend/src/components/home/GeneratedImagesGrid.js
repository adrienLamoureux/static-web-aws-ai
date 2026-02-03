import React from "react";

function GeneratedImagesGrid({
  images,
  selectedKey,
  selectingKey,
  isSelecting,
  onSelect,
}) {
  if (images.length === 0) return null;

  return (
    <div className="gallery-section">
      <p className="field-label">Latest generations</p>
      <p className="mt-2 text-xs text-[#7a6a51]">
        Click one to keep it. The other image will be discarded.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {images.map((image) => {
          const isSelected = selectedKey === image.key;
          const isActive = selectingKey === image.key;
          return (
            <button
              key={image.key}
              type="button"
              onClick={() => onSelect(image)}
              disabled={isSelecting}
              className={`gallery-thumb p-2 text-left ${
                isSelected ? "choice-tile--active" : ""
              }`}
            >
              <img
                src={image.url}
                alt={image.key}
                className="h-32 w-full rounded-xl object-cover"
              />
              <p className="mt-2 text-[11px] font-medium text-[#6b5c45]">
                {image.key}
              </p>
              {isActive && (
                <div className="mt-2 flex items-center gap-2 text-[11px] text-[#7a6a51]">
                  <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                  Preparing video-ready...
                </div>
              )}
              {image.url && (
                <a
                  className="btn-ghost mt-2 inline-flex px-3 py-1 text-[11px]"
                  href={image.url}
                  download
                  onClick={(event) => event.stopPropagation()}
                >
                  Download
                </a>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default GeneratedImagesGrid;
