/**
 * CompanionCanvas — owns the <canvas> element and Live2DEngine lifecycle.
 * Calls onEngineReady(engine) when the engine and model are initialized.
 * Handles ResizeObserver to keep the PIXI app sized to its container.
 */

import { useEffect, useRef, useCallback } from "react";
import { Live2DEngine } from "../../../lib/live2d/Live2DEngine";

export default function CompanionCanvas({ modelEntry, onEngineReady, style }) {
  const canvasRef  = useRef(null);
  const engineRef  = useRef(null);
  const entryRef   = useRef(modelEntry);

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

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        ...style,
      }}
    />
  );
}
