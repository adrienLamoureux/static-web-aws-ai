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
    this._canvas = canvas;
    this._app = null;
    this._model = null;
    this._manifest = null;
    this._generation = 0; // incremented on every loadModel call; guards stale async completions

    // Emotion
    this._cancelEmotion = null;

    // Look-at
    this._lookTarget = { x: 0, y: 0 };
    this._lookCurrent = { x: 0, y: 0 };
    this._mouseHandler = null;
    this._isMobile = window.matchMedia("(pointer: coarse)").matches;

    // Lip sync
    this._lipSyncActive = false;
    this._lipSyncStart = 0;
    this._lipSyncDuration = 0;

    this._motionPlaying = false;
    this._motionTimer = null;

    // Idle variety cycling
    this._idleTimer = null;
    this._idleVariantIndex = 0;

    // Away / focus handlers (set after model load)
    this._focusHandler = null;
    this._blurHandler = null;
    this._blurClearHandler = null;
    this._blurTimer = null;

    this._onVisibilityChange = () => {
      if (document.hidden) this.pause();
      else this.resume();
    };
    document.addEventListener("visibilitychange", this._onVisibilityChange);
  }

  get isLoaded() {
    return this._model !== null;
  }

  /**
   * Returns true when the current model supports the given Capability constant.
   * Mirrors the Capability contract defined in character-interactions.js.
   */
  hasCapability(cap) {
    if (!this._manifest) return false;
    switch (cap) {
      case "look_at":
        return !!this._manifest.lookAt;
      case "idle_variety":
        return Array.isArray(this._manifest.idleVariants) && this._manifest.idleVariants.length > 0;
      case "hit_test":
        return Array.isArray(this._manifest.hitZones) && this._manifest.hitZones.length > 0;
      default:
        return false;
    }
  }

  // ─── Public API ───────────────────────────────────────────────

  async loadModel(manifest) {
    this._disposeModel();

    const gen = ++this._generation; // capture before the await

    const rect = this._canvas.getBoundingClientRect();
    const W = rect.width || this._canvas.offsetWidth || 240;
    const H = rect.height || this._canvas.offsetHeight || 280;

    if (!this._app) {
      this._app = new Application({
        view: this._canvas,
        width: W,
        height: H,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
      });
    } else {
      this._app.renderer.resize(W, H);
    }

    let model;
    try {
      model = await Live2DModel.from(manifest.modelPath, { autoInteract: false });
    } catch (err) {
      console.error("[Live2DEngine] Model load failed:", err);
      return;
    }
    // Another loadModel call happened while we were awaiting — discard this result
    if (gen !== this._generation) {
      model.destroy();
      return;
    }

    this._manifest = manifest;
    this._model = model;
    this._alive2 = true;
    this._app.stage.addChild(model);

    // Scale to fill manifest.scale of canvas height, anchor at bottom-center
    const baseScale = (H * manifest.scale) / model.height;
    model.scale.set(baseScale);
    model.anchor.set(manifest.anchor.x, manifest.anchor.y);
    model.x = W / 2;
    model.y = H;

    model.motion(manifest.interactionMap?.idle?.motion);
    if (manifest.idleVariants?.length) this._startIdleCycle();

    // Register our look-at + lip sync ticker at LOW priority so it runs
    // AFTER the model's own motion update (which runs at NORMAL priority).
    this._app.ticker.add(this._tickOverrides, null, UPDATE_PRIORITY.LOW);

    // On focus return from away — play greet then resume idle
    this._focusHandler = () => {
      if (sessionStorage.getItem("skr-companion-away") === "1") {
        sessionStorage.removeItem("skr-companion-away");
        this.playMotion("greet");
      }
    };
    window.addEventListener("focus", this._focusHandler);

    this._blurTimer = null;
    this._blurHandler = () => {
      this._blurTimer = setTimeout(() => {
        sessionStorage.setItem("skr-companion-away", "1");
      }, 30_000);
    };
    this._blurClearHandler = () => {
      clearTimeout(this._blurTimer);
    };
    window.addEventListener("blur", this._blurHandler);
    window.addEventListener("focus", this._blurClearHandler);

    // Mouse tracking — only for models that declare the LOOK_AT capability
    if (!this._isMobile && manifest.lookAt) {
      this._mouseHandler = (e) => {
        const rect = this._canvas.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        this._lookTarget.x = Math.max(-1, Math.min(1, (e.clientX - cx) / (window.innerWidth / 2)));
        this._lookTarget.y = Math.max(-1, Math.min(1, (e.clientY - cy) / (window.innerHeight / 2)));
      };
      document.addEventListener("mousemove", this._mouseHandler);
    }
  }

  setEmotion(emotionName, durationMs = 3000) {
    if (this._cancelEmotion) {
      this._cancelEmotion();
      this._cancelEmotion = null;
    }
    if (!this._model || !this._manifest) return;
    const entry = this._manifest.emotionMap[emotionName] ?? this._manifest.emotionMap.neutral ?? {};

    if (entry.expression !== undefined) {
      // Expression-file dispatch (models with .exp3.json, e.g. Kagura)
      this._model.expression(entry.expression);
      const neutralExpr = this._manifest.emotionMap.neutral?.expression;
      if (neutralExpr && durationMs > 0) {
        const t = setTimeout(() => this._model.expression(neutralExpr), durationMs);
        this._cancelEmotion = () => clearTimeout(t);
      }
    } else if (entry.motion !== undefined) {
      // Motion-group dispatch (game models without expression files, e.g. Azur Lane)
      this._model.motion(entry.motion);
      this._motionPlaying = true;
      if (this._motionTimer) clearTimeout(this._motionTimer);
      this._motionTimer = setTimeout(() => {
        this._motionPlaying = false;
      }, 2000);
    } else {
      // Parameter-override dispatch (Hiyori free tier)
      const core = this._model.internalModel?.coreModel;
      if (!core) return;
      this._cancelEmotion = applyEmotion(core, this._manifest.emotionMap, emotionName, durationMs);
    }
  }

  playMotion(semanticName) {
    if (!this._model || !this._manifest) return;
    const group = this._manifest.interactionMap?.[semanticName]?.motion;
    if (!group) return;
    this._model.motion(group);
    this._motionPlaying = true;
    if (this._motionTimer) clearTimeout(this._motionTimer);
    this._motionTimer = setTimeout(() => {
      this._motionPlaying = false;
    }, 2000);
  }

  startLipSync(durationMs) {
    this._lipSyncStart = performance.now();
    this._lipSyncDuration = durationMs;
    this._lipSyncActive = true;
  }

  stopLipSync() {
    this._lipSyncActive = false;
    const core = this._model?.internalModel?.coreModel;
    if (core) {
      try {
        core.setParameterValueById("ParamMouthOpenY", 0);
      } catch {}
    }
  }

  /**
   * High-level interaction dispatcher.
   * Looks up `semanticName` in the current model's interactionMap and fires
   * the appropriate motion and/or emotion. Falls back to playMotion() when
   * no interactionMap entry exists (backward-compat with old callers).
   */
  interact(semanticName) {
    if (!this._model || !this._manifest) return;
    const action = this._manifest.interactionMap?.[semanticName];
    if (!action) {
      // Graceful fallback: try motion map directly
      this.playMotion(semanticName);
      return;
    }
    if (action.motion) {
      this._model.motion(action.motion);
      this._motionPlaying = true;
      clearTimeout(this._motionTimer);
      this._motionTimer = setTimeout(() => {
        this._motionPlaying = false;
        // Return to idle after the interaction completes
        if (semanticName !== "idle" && semanticName !== "idle_variant") {
          this._model?.motion(this._manifest.interactionMap?.idle?.motion);
        }
      }, 3500);
    }
    if (action.emotion) {
      this.setEmotion(action.emotion, 3000);
    }
  }

  /**
   * Maps a canvas-relative click position to a hit zone name defined in the
   * current model's hitZones config. Returns null if no zone matches.
   * @param {number} canvasY  Y pixels relative to the canvas top edge.
   * @param {number} canvasH  Total canvas height in pixels.
   */
  hitTest(canvasY, canvasH) {
    const zones = this._manifest?.hitZones;
    if (!zones?.length || canvasH <= 0) return null;
    const ny = canvasY / canvasH; // normalised 0–1
    return zones.find((z) => ny >= z.yMin && ny < z.yMax)?.name ?? null;
  }

  setLookAtTarget(x, y) {
    this._lookTarget.x = x;
    this._lookTarget.y = y;
  }

  resizeTo(width, height) {
    if (this._app) {
      this._app.renderer.resize(width, height);
      if (this._model && this._manifest) {
        const baseScale =
          (height * this._manifest.scale) / (this._model.height / this._model.scale.y);
        this._model.scale.set(baseScale);
        this._model.x = width / 2;
        this._model.y = height;
      }
    }
  }

  pause() {
    if (this._app) this._app.ticker.stop();
  }
  resume() {
    if (this._app) this._app.ticker.start();
  }

  // ─── Internal ──────────────────────────────────────────────────

  /**
   * Ticker callback — runs at LOW priority every frame, after the model's
   * motion + physics update. Applies look-at and lip sync parameters.
   */
  _tickOverrides = () => {
    if (!this._model || !this._manifest) return;
    const cfg = this._manifest.lookAt;
    const s = cfg.smoothing;

    // Lerp current look toward target — full strength always (no reduction during motion)
    this._lookCurrent.x += (this._lookTarget.x - this._lookCurrent.x) * s;
    this._lookCurrent.y += (this._lookTarget.y - this._lookCurrent.y) * s;

    const core = this._model.internalModel?.coreModel;
    if (!core) return;

    const lx = this._lookCurrent.x;
    const ly = this._lookCurrent.y;

    try {
      core.setParameterValueById("ParamAngleX", lx * cfg.headWeight.x);
      core.setParameterValueById("ParamAngleY", ly * -cfg.headWeight.y);
      core.setParameterValueById("ParamEyeBallX", lx * cfg.eyeWeight.x);
      core.setParameterValueById("ParamEyeBallY", ly * -cfg.eyeWeight.y);
      if (cfg.bodyWeight) {
        core.setParameterValueById("ParamBodyAngleX", lx * cfg.bodyWeight.x);
        core.setParameterValueById("ParamBodyAngleY", ly * -cfg.bodyWeight.y);
      }
    } catch {}

    // Lip sync — simple 6Hz sine wave for mouth opening
    if (this._lipSyncActive) {
      const elapsed = performance.now() - this._lipSyncStart;
      if (elapsed < this._lipSyncDuration) {
        const mouth = Math.abs(Math.sin(elapsed * 0.006 * Math.PI * 2)) * 0.8;
        try {
          core.setParameterValueById("ParamMouthOpenY", mouth);
        } catch {}
      } else {
        this._lipSyncActive = false;
        try {
          core.setParameterValueById("ParamMouthOpenY", 0);
        } catch {}
      }
    }
  };

  /**
   * Periodically plays an idle variant motion to keep the character feeling
   * alive. Schedules itself recursively so the interval is randomised each time.
   */
  _startIdleCycle() {
    clearTimeout(this._idleTimer);
    const variants = this._manifest?.idleVariants;
    if (!variants?.length) return;

    const scheduleNext = () => {
      const delay = 10_000 + Math.random() * 15_000; // 10–25 s
      this._idleTimer = setTimeout(() => {
        if (!this._alive2) return; // engine disposed
        if (this._motionPlaying || !this._model) {
          scheduleNext(); // busy — try again later
          return;
        }
        const v = variants[this._idleVariantIndex % variants.length];
        this._idleVariantIndex += 1;
        this._model.motion(v);
        this._motionPlaying = true;
        clearTimeout(this._motionTimer);
        this._motionTimer = setTimeout(() => {
          this._motionPlaying = false;
          this._model?.motion(this._manifest?.interactionMap?.idle?.motion);
          scheduleNext();
        }, 4000);
      }, delay);
    };
    scheduleNext();
  }

  _disposeModel() {
    this._alive2 = false; // stop idle cycle
    clearTimeout(this._idleTimer);
    this._idleTimer = null;
    if (this._cancelEmotion) {
      this._cancelEmotion();
      this._cancelEmotion = null;
    }
    if (this._motionTimer) {
      clearTimeout(this._motionTimer);
      this._motionTimer = null;
    }
    if (this._mouseHandler) {
      document.removeEventListener("mousemove", this._mouseHandler);
      this._mouseHandler = null;
    }
    if (this._focusHandler) {
      window.removeEventListener("focus", this._focusHandler);
      this._focusHandler = null;
    }
    if (this._blurHandler) {
      window.removeEventListener("blur", this._blurHandler);
      this._blurHandler = null;
    }
    if (this._blurClearHandler) {
      window.removeEventListener("focus", this._blurClearHandler);
      this._blurClearHandler = null;
    }
    clearTimeout(this._blurTimer);
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
