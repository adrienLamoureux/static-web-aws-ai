import { useEffect, useRef, useState, useCallback } from "react";
import { Application, Ticker } from "pixi.js";
import { Live2DModel } from "pixi-live2d-display/cubism4";
import CompanionDialog from "./CompanionDialog";

Live2DModel.registerTicker(Ticker);

const MODEL_URL = "live2d/hiyori/runtime/hiyori_free_t08.model3.json";
const CANVAS_H = 280;
const SPEED = 1.2;
const PAUSE_MS = 1800;
const CHAR_SCALE_TARGET = 0.85;
// Bottom offset matches SakuraShell nav height (px)
const BOTTOM_OFFSET = 64;

export default function CharacterWalker() {
  const canvasRef = useRef(null);
  const stateRef = useRef({ x: 120, dir: 1, walking: true, baseScale: 1, halfW: 60 });
  const [dialog, setDialog] = useState(null);

  const closeDialog = useCallback(() => setDialog(null), []);

  useEffect(() => {
    let app;
    let raf;
    let alive = true;
    let model = null;
    const s = stateRef.current;

    (async () => {
      if (!window.Live2DCubismCore) {
        console.error("[CharacterWalker] Live2DCubismCore not found — is live2dcubismcore.min.js in index.html?");
        return;
      }

      app = new Application({
        view: canvasRef.current,
        width: window.innerWidth,
        height: CANVAS_H,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
      });

      try {
        model = await Live2DModel.from(MODEL_URL, { autoInteract: false });
      } catch (err) {
        console.error("[CharacterWalker] Model load failed:", err);
        return;
      }
      if (!alive) { model.destroy(); return; }

      app.stage.addChild(model);

      // Scale to fill CHAR_SCALE_TARGET of canvas height
      const baseScale = (CANVAS_H * CHAR_SCALE_TARGET) / model.height;
      s.baseScale = baseScale;
      s.halfW = (model.width * baseScale) / 2;
      model.scale.set(baseScale);
      model.anchor.set(0.5, 1);
      model.y = CANVAS_H;
      model.x = s.x;

      model.motion("Idle");

      // Click detection via document listener — canvas stays pointer-events:none
      // so it never blocks underlying app clicks; we manually hit-test
      const onDocumentClick = (e) => {
        if (!alive || !model) return;
        const canvasTopY = window.innerHeight - BOTTOM_OFFSET - CANVAS_H;
        const relY = e.clientY - canvasTopY;
        if (relY < 0 || relY > CANVAS_H) return;
        if (Math.abs(e.clientX - s.x) < s.halfW) {
          setDialog({ x: Math.round(s.x) });
          model.motion("Tap");
        }
      };
      document.addEventListener("click", onDocumentClick);
      s._removeClick = () => document.removeEventListener("click", onDocumentClick);

      const tick = () => {
        if (!alive) return;
        if (s.walking && model) {
          s.x += SPEED * s.dir;
          const minX = s.halfW;
          const maxX = window.innerWidth - s.halfW;

          if (s.x >= maxX || s.x <= minX) {
            s.x = s.x >= maxX ? maxX : minX;
            s.dir *= -1;
            s.walking = false;
            model.scale.x = s.baseScale * s.dir;
            model.motion("Flick");
            setTimeout(() => {
              if (alive) { s.walking = true; model.motion("Idle"); }
            }, PAUSE_MS);
          }

          model.x = s.x;
          model.scale.x = s.baseScale * s.dir;
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      const onResize = () => {
        if (alive && app) app.renderer.resize(window.innerWidth, CANVAS_H);
      };
      window.addEventListener("resize", onResize);
      s._removeResize = () => window.removeEventListener("resize", onResize);
    })();

    return () => {
      alive = false;
      if (raf) cancelAnimationFrame(raf);
      if (s._removeClick) { s._removeClick(); delete s._removeClick; }
      if (s._removeResize) { s._removeResize(); delete s._removeResize; }
      if (model) { model.destroy(); model = null; }
      if (app) { app.destroy(false); app = null; }
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          position: "fixed",
          bottom: BOTTOM_OFFSET,
          left: 0,
          width: "100%",
          height: CANVAS_H,
          pointerEvents: "none",
          zIndex: 50,
          display: "none", // TODO: re-enable after refinement
        }}
      />
      {dialog && (
        <CompanionDialog
          anchorX={dialog.x}
          canvasBottomOffset={BOTTOM_OFFSET + CANVAS_H}
          onClose={closeDialog}
        />
      )}
    </>
  );
}
