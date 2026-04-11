/**
 * CompanionCanvas — owns the <canvas> element and Live2DEngine lifecycle.
 * Calls onEngineReady(engine) when the engine and model are initialized.
 * Handles ResizeObserver to keep the PIXI app sized to its container.
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { Live2DEngine } from "../../../lib/live2d/Live2DEngine";

// Small visual ripple rendered at click position for tactile feedback
function ClickRipple({ x, y, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 500);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div style={{
      position: "absolute", left: x - 18, top: y - 18,
      width: 36, height: 36, borderRadius: "50%",
      border: "2px solid rgba(255,107,157,0.7)",
      animation: "skr-ripple 0.5s ease-out forwards",
      pointerEvents: "none",
    }} />
  );
}

export default function CompanionCanvas({ modelEntry, onEngineReady, style }) {
  const canvasRef  = useRef(null);
  const engineRef  = useRef(null);
  const entryRef   = useRef(modelEntry);
  const [ripple, setRipple] = useState(null); // { x, y, key }

  const initEngine = useCallback(async (canvas, entry) => {
    if (!window.Live2DCubismCore) {
      console.warn("[CompanionCanvas] Live2DCubismCore not found — check index.html");
      return;
    }

    const engine = new Live2DEngine(canvas);
    engineRef.current = engine;
    onEngineReady(engine);

    await engine.loadModel(entry);
  }, [onEngineReady]);

  // Initialize engine on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    initEngine(canvas, entryRef.current);

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        engineRef.current?.resizeTo(width, height);
      }
    });
    observer.observe(canvas.parentElement || canvas);

    return () => {
      observer.disconnect();
      engineRef.current?.dispose();
      engineRef.current = null;
      onEngineReady(null);
    };
  }, []); // intentional: runs once on mount; model entry handled in the effect below

  // Swap model when modelEntry changes
  useEffect(() => {
    if (entryRef.current === modelEntry) return;
    entryRef.current = modelEntry;
    if (engineRef.current && modelEntry) {
      engineRef.current.loadModel(modelEntry);
    }
  }, [modelEntry]);

  // Click → hit-test → interact
  const handleClick = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const zone = engineRef.current?.hitTest(y, rect.height);
    if (zone) {
      engineRef.current.interact(zone);
      setRipple({ x: e.clientX - rect.left, y, key: Date.now() });
    }
  }, []);

  return (
    <div
      style={{ position: "relative", width: "100%", height: "100%", cursor: "pointer", ...style }}
      onClick={handleClick}
    >
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%", pointerEvents: "none" }}
      />
      {ripple && (
        <ClickRipple
          key={ripple.key}
          x={ripple.x}
          y={ripple.y}
          onDone={() => setRipple(null)}
        />
      )}
    </div>
  );
}
