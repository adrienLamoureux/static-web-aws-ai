/**
 * Live2DEngine — owns a PIXI Application + Live2DModel lifecycle.
 *
 * Responsibilities:
 *  - Load / swap models from model-registry manifest entries
 *  - Cursor look-at tracking (head + eyeball follow mouse)
 *  - Emotion parameter overrides via emotion-interpolator
 *  - Simple lip sync via ParamMouthOpenY oscillation
 *  - Visibility-based pause/resume (document.visibilitychange)
 *
 * Usage:
 *   const engine = new Live2DEngine(canvasEl);
 *   await engine.loadModel(getDefaultModel());
 *   engine.playMotion("greet");
 *   engine.setEmotion("happy", 3000);
 *   engine.startLipSync(2000);
 *   engine.dispose(); // on unmount
 */

import { Application, Ticker, UPDATE_PRIORITY } from "pixi.js";
import { Live2DModel } from "pixi-live2d-display/cubism4";
import { applyEmotion } from "./emotion-interpolator";

// Register PIXI Ticker so pixi-live2d-display advances on every frame.
Live2DModel.registerTicker(Ticker);

export class Live2DEngine {
  constructor(canvas) {
    this._canvas    = canvas;
    this._app       = null;
    this._model     = null;
    this._manifest  = null;
    this._alive     = false;

    // Emotion
    this._cancelEmotion = null;

    // Look-at
    this._lookTarget  = { x: 0, y: 0 };
    this._lookCurrent = { x: 0, y: 0 };
    this._mouseHandler = null;
    this._isMobile = window.matchMedia("(pointer: coarse)").matches;

    // Lip sync
    this._lipSyncActive   = false;
    this._lipSyncStart    = 0;
    this._lipSyncDuration = 0;

    // Reduce look-at influence while a motion plays
    this._motionPlaying = false;
    this._motionTimer   = null;

    this._onVisibilityChange = () => {
      if (document.hidden) this.pause();
      else this.resume();
    };
    document.addEventListener("visibilitychange", this._onVisibilityChange);
  }

  get isLoaded() { return this._model !== null; }

  // ─── Public API ───────────────────────────────────────────────

  async loadModel(manifest) {
    this._disposeModel();

    const rect = this._canvas.getBoundingClientRect();
    const W = rect.width  || this._canvas.offsetWidth  || 240;
    const H = rect.height || this._canvas.offsetHeight || 280;

    if (!this._app) {
      this._app = new Application({
        view: this._canvas,
        width:  W,
        height: H,
        backgroundAlpha: 0,
        antialias:   true,
        autoDensity: true,
        resolution:  window.devicePixelRatio || 1,
      });
    } else {
      this._app.renderer.resize(W, H);
    }

    this._alive = true;

    let model;
    try {
      model = await Live2DModel.from(manifest.modelPath, { autoInteract: false });
    } catch (err) {
      console.error("[Live2DEngine] Model load failed:", err);
      return;
    }
    if (!this._alive) { model.destroy(); return; }

    this._manifest = manifest;
    this._model    = model;
    this._app.stage.addChild(model);

    // Scale to fill manifest.scale of canvas height, anchor at bottom-center
    const baseScale = (H * manifest.scale) / model.height;
    model.scale.set(baseScale);
    model.anchor.set(manifest.anchor.x, manifest.anchor.y);
    model.x = W / 2;
    model.y = H;

    model.motion(manifest.motionMap.idle);

    // Register our look-at + lip sync ticker at LOW priority so it runs
    // AFTER the model's own motion update (which runs at NORMAL priority).
    this._app.ticker.add(this._tickOverrides, null, UPDATE_PRIORITY.LOW);

    // Mouse tracking (desktop only)
    if (!this._isMobile) {
      this._mouseHandler = (e) => {
        const rect = this._canvas.getBoundingClientRect();
        const cx = rect.left + rect.width  / 2;
        const cy = rect.top  + rect.height / 2;
        this._lookTarget.x = Math.max(-1, Math.min(1, (e.clientX - cx) / (window.innerWidth  / 2)));
        this._lookTarget.y = Math.max(-1, Math.min(1, (e.clientY - cy) / (window.innerHeight / 2)));
      };
      document.addEventListener("mousemove", this._mouseHandler);
    }
  }

  setEmotion(emotionName, durationMs = 3000) {
    if (this._cancelEmotion) { this._cancelEmotion(); this._cancelEmotion = null; }
    if (!this._model || !this._manifest) return;
    const core = this._model.internalModel?.coreModel;
    if (!core) return;
    this._cancelEmotion = applyEmotion(core, this._manifest.emotionMap, emotionName, durationMs);
  }

  playMotion(semanticName) {
    if (!this._model || !this._manifest) return;
    const group = this._manifest.motionMap[semanticName];
    if (!group) return;
    this._model.motion(group);
    this._motionPlaying = true;
    if (this._motionTimer) clearTimeout(this._motionTimer);
    this._motionTimer = setTimeout(() => { this._motionPlaying = false; }, 2000);
  }

  startLipSync(durationMs) {
    this._lipSyncStart    = performance.now();
    this._lipSyncDuration = durationMs;
    this._lipSyncActive   = true;
  }

  stopLipSync() {
    this._lipSyncActive = false;
    const core = this._model?.internalModel?.coreModel;
    if (core) {
      try { core.setParameterValueById("ParamMouthOpenY", 0); } catch {}
    }
  }

  setLookAtTarget(x, y) {
    this._lookTarget.x = x;
    this._lookTarget.y = y;
  }

  resizeTo(width, height) {
    if (this._app) {
      this._app.renderer.resize(width, height);
      if (this._model && this._manifest) {
        const baseScale = (height * this._manifest.scale) / (this._model.height / this._model.scale.y);
        this._model.scale.set(baseScale);
        this._model.x = width  / 2;
        this._model.y = height;
      }
    }
  }

  pause()  { if (this._app) this._app.ticker.stop();  }
  resume() { if (this._app) this._app.ticker.start(); }

  // ─── Internal ──────────────────────────────────────────────────

  /**
   * Ticker callback — runs at LOW priority every frame, after the model's
   * motion + physics update. Applies look-at and lip sync parameters.
   */
  _tickOverrides = () => {
    if (!this._model || !this._manifest) return;
    const cfg = this._manifest.lookAt;
    const influence = this._motionPlaying ? 0.4 : 1.0;
    const s = cfg.smoothing;

    // Lerp current look toward target
    this._lookCurrent.x += (this._lookTarget.x - this._lookCurrent.x) * s;
    this._lookCurrent.y += (this._lookTarget.y - this._lookCurrent.y) * s;

    const core = this._model.internalModel?.coreModel;
    if (!core) return;

    try {
      core.setParameterValueById("ParamAngleX",   this._lookCurrent.x *  cfg.headWeight.x * influence);
      core.setParameterValueById("ParamAngleY",   this._lookCurrent.y * -cfg.headWeight.y * influence);
      core.setParameterValueById("ParamEyeBallX", this._lookCurrent.x *  cfg.eyeWeight.x  * influence);
      core.setParameterValueById("ParamEyeBallY", this._lookCurrent.y * -cfg.eyeWeight.y  * influence);
    } catch {}

    // Lip sync — simple 6Hz sine wave for mouth opening
    if (this._lipSyncActive) {
      const elapsed = performance.now() - this._lipSyncStart;
      if (elapsed < this._lipSyncDuration) {
        const mouth = Math.abs(Math.sin(elapsed * 0.006 * Math.PI * 2)) * 0.8;
        try { core.setParameterValueById("ParamMouthOpenY", mouth); } catch {}
      } else {
        this._lipSyncActive = false;
        try { core.setParameterValueById("ParamMouthOpenY", 0); } catch {}
      }
    }
  };

  _disposeModel() {
    this._alive = false;
    if (this._cancelEmotion) { this._cancelEmotion(); this._cancelEmotion = null; }
    if (this._motionTimer)   { clearTimeout(this._motionTimer); this._motionTimer = null; }
    if (this._mouseHandler) {
      document.removeEventListener("mousemove", this._mouseHandler);
      this._mouseHandler = null;
    }
    if (this._model) {
      if (this._app) this._app.ticker.remove(this._tickOverrides, null);
      this._app?.stage.removeChild(this._model);
      this._model.destroy();
      this._model = null;
    }
    this._manifest = null;
  }

  dispose() {
    document.removeEventListener("visibilitychange", this._onVisibilityChange);
    this._disposeModel();
    if (this._app) {
      this._app.destroy(false);
      this._app = null;
    }
  }
}
