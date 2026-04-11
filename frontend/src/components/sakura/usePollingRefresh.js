import { useEffect, useRef } from 'react';

/**
 * usePollingRefresh(loadFn, { intervalMs, pauseWhenHidden })
 * Calls loadFn on mount and every intervalMs.
 * Pauses when tab is hidden if pauseWhenHidden is true (default).
 */
export default function usePollingRefresh(loadFn, { intervalMs = 15000, pauseWhenHidden = true } = {}) {
  const savedFn = useRef(loadFn);

  useEffect(() => { savedFn.current = loadFn; }, [loadFn]);

  useEffect(() => {
    const tick = () => {
      if (pauseWhenHidden && document.visibilityState === 'hidden') return;
      savedFn.current();
    };

    const id = setInterval(tick, intervalMs);
    const onVis = () => { if (document.visibilityState === 'visible') tick(); };

    if (pauseWhenHidden) document.addEventListener('visibilitychange', onVis);

    return () => {
      clearInterval(id);
      if (pauseWhenHidden) document.removeEventListener('visibilitychange', onVis);
    };
  }, [intervalMs, pauseWhenHidden]);
}
