import React, { useMemo } from "react";
import SOL_MASONRY_DEFAULTS from "../data/sol-masonry-defaults.json";

const COLUMNS = [
  { id: "col-a", durationSeconds: 86,  startOffset: "0%"   },
  { id: "col-b", durationSeconds: 94,  startOffset: "-11%" },
  { id: "col-c", durationSeconds: 102, startOffset: "-22%" },
];

const REPEAT_COUNT = 3;

function buildLoopedImages(base, repeat) {
  const out = [];
  for (let r = 0; r < repeat; r++) {
    for (const img of base) {
      out.push({ ...img, loopId: `${img.id}-${r}` });
    }
  }
  return out;
}

/**
 * Animated vertical-scrolling masonry hero.
 * Props:
 *   images  – array of { id, src }  (falls back to bundled defaults when empty)
 *   title   – headline text
 *   subtitle – sub-headline text
 */
export default function SolarisMasonry({ images = [], title, subtitle }) {
  const base = images.length > 0 ? images : SOL_MASONRY_DEFAULTS;
  const looped = useMemo(() => buildLoopedImages(base, REPEAT_COUNT), [base]);

  return (
    <div className="yk-masonry-hero" aria-hidden="true">
      <div className="yk-masonry-grid">
        {COLUMNS.map((col) => (
          <div
            key={col.id}
            className="yk-masonry-column"
            style={{
              "--yk-masonry-duration": `${col.durationSeconds}s`,
              "--yk-masonry-start": col.startOffset,
            }}
          >
            {looped.map((img) => (
              <figure key={`${col.id}-${img.loopId}`} className="yk-masonry-card">
                <img src={img.src} alt="" loading="lazy" decoding="async" />
              </figure>
            ))}
          </div>
        ))}
      </div>

      {(title || subtitle) && (
        <div className="yk-masonry-overlay">
          {title   && <p className="yk-masonry-title">{title}</p>}
          {subtitle && <p className="yk-masonry-subtitle">{subtitle}</p>}
        </div>
      )}
    </div>
  );
}
