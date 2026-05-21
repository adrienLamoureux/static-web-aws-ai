/**
 * BrowseGalleryPanel — renders the `browse_gallery` tool result.
 *
 * Shows a horizontal strip of community-shared image thumbnails (the public
 * `shared/images/` prefix). Clicking a tile opens it in a lightbox-style
 * full-size view. Pure visual inspiration — no prompts to surface (the
 * shared bucket only stores keys + signed URLs).
 */

import React, { useState } from "react";

export default function BrowseGalleryPanel({ payload }) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const [zoomKey, setZoomKey] = useState(null);

  if (items.length === 0) {
    return (
      <div className="skr-recall-empty">
        Gallery's quiet right now — let's make something to fill it, neh~
      </div>
    );
  }

  const zoomItem = zoomKey ? items.find((i) => i.key === zoomKey) : null;

  return (
    <div className="skr-recall-panel">
      <div className="skr-recall-head">
        ◆ <strong>{items.length}</strong> recent from the gallery
      </div>
      <div className="skr-recall-strip" role="list">
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            className="skr-recall-tile"
            role="listitem"
            onClick={() => it.url && setZoomKey(it.key)}
            title="Tap to view full size"
            aria-label="Open full-size preview"
          >
            {it.url ? (
              <img src={it.url} alt="" loading="lazy" />
            ) : (
              <span className="skr-recall-tile-fallback" aria-hidden="true">
                ✦
              </span>
            )}
          </button>
        ))}
      </div>
      {zoomItem ? (
        <div className="skr-gallery-zoom" onClick={() => setZoomKey(null)} role="presentation">
          <img src={zoomItem.url} alt="" />
          <button
            type="button"
            className="skr-gallery-zoom-close"
            onClick={(e) => {
              e.stopPropagation();
              setZoomKey(null);
            }}
            aria-label="Close preview"
          >
            ✕
          </button>
        </div>
      ) : null}
    </div>
  );
}
