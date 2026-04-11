/**
 * Applies emotion parameter overrides to a Live2D Cubism core model.
 * Lerps in over FADE_MS, holds, then lerps back to captured resting values.
 * Returns a cancel function.
 */

const FADE_MS = 300;

function lerp(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

export function applyEmotion(coreModel, emotionMap, emotionName, durationMs = 3000) {
  const overrides = emotionMap[emotionName] || {};
  const paramIds = Object.keys(overrides);
  if (paramIds.length === 0) return () => {};

  // Capture starting values
  const startValues = {};
  for (const id of paramIds) {
    try {
      startValues[id] = coreModel.getParameterValueById(id) ?? 0;
    } catch {
      startValues[id] = 0;
    }
  }

  let cancelled = false;
  let rafId = null;
  const startTime = performance.now();
  const holdStart   = startTime + FADE_MS;
  const fadeOutStart = startTime + durationMs - FADE_MS;
  const endTime     = startTime + durationMs;

  function tick() {
    if (cancelled) return;
    const now = performance.now();

    if (now >= endTime) {
      for (const id of paramIds) {
        try { coreModel.setParameterValueById(id, startValues[id]); } catch {}
      }
      return;
    }

    let t;
    if (now < holdStart) {
      t = (now - startTime) / FADE_MS;
    } else if (now < fadeOutStart) {
      t = 1;
    } else {
      t = 1 - (now - fadeOutStart) / FADE_MS;
    }

    for (const id of paramIds) {
      try {
        coreModel.setParameterValueById(id, lerp(startValues[id], overrides[id], t));
      } catch {}
    }

    rafId = requestAnimationFrame(tick);
  }

  rafId = requestAnimationFrame(tick);

  return () => {
    cancelled = true;
    if (rafId) cancelAnimationFrame(rafId);
    // Restore on cancel
    for (const id of paramIds) {
      try { coreModel.setParameterValueById(id, startValues[id]); } catch {}
    }
  };
}
