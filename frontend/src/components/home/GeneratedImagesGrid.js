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
    <div className="rounded-2xl border border-slate-200 bg-white/70 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
        Latest generations
      </p>
      <p className="mt-2 text-xs text-slate-500">
        Click one to keep it. The other image will be discarded.
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {images.map((image) => {
          const isSelected = selectedKey === image.key;
          const isActive = selectingKey === image.key;
          return (
            <button
              key={image.key}
              type="button"
              onClick={() => onSelect(image)}
              disabled={isSelecting}
              className={`overflow-hidden rounded-2xl border p-2 text-left transition ${
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
              <p className="mt-2 text-[11px] font-medium text-slate-600">
                {image.key}
              </p>
              {isActive && (
                <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
                  <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                  Preparing video-ready...
                </div>
              )}
              {image.url && (
                <a
                  className="mt-2 inline-flex rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-accent hover:text-ink"
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
