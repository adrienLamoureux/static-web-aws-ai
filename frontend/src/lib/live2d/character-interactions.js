/**
 * character-interactions.js
 *
 * Two exported contracts for companion characters:
 *
 *  Interaction  — discrete, event-driven actions (click, greet, celebrate…).
 *                 Consumers call engine.interact(Interaction.X).
 *                 Each model maps these to its specific motion groups + emotions
 *                 via `interactionMap` in model-registry.js.
 *
 *  Capability   — continuous, passive behaviours a model can support.
 *                 Checked with engine.hasCapability(Capability.X).
 *                 Implementation details live in the per-model config fields
 *                 referenced below (e.g. `lookAt`).
 */

// ─── Passive capabilities ─────────────────────────────────────────────────────
// A model advertises support by including the matching config field.

export const Capability = {
  /**
   * LOOK_AT — head, eyes and body continuously follow the mouse cursor.
   * Implemented by: model-registry `lookAt` config (weights + smoothing).
   * Engine behaviour: lerped every frame in _tickOverrides via ParamAngleX/Y,
   * ParamEyeBallX/Y and optional ParamBodyAngleX/Y.
   * A model that omits `lookAt` will not track the cursor.
   */
  LOOK_AT: "look_at",

  /**
   * IDLE_VARIETY — periodic non-idle motions to break the static look.
   * Implemented by: model-registry `idleVariants` array.
   */
  IDLE_VARIETY: "idle_variety",

  /**
   * HIT_TEST — click zones mapped to touch interactions.
   * Implemented by: model-registry `hitZones` array.
   */
  HIT_TEST: "hit_test",

  /**
   * INITIATIVE — character proactively starts conversation topics on its own.
   * Implemented by: SideChatPanel inactivity timer + /api/companion/initiative.
   * The companion draws from DynamoDB memory (auth users) or the current
   * session message history (anonymous users) to pick relevant topics.
   * Fires after ~4 minutes of user inactivity, up to 3 times per session.
   */
  INITIATIVE: "initiative",
};

// ─── Discrete interactions ────────────────────────────────────────────────────

export const Interaction = {
  // ── Ambient ──────────────────────────────────────────────────────────────
  IDLE:           "idle",          // base idle loop (played on model load)
  IDLE_VARIANT:   "idle_variant",  // periodic variety motion to break the static look

  // ── Click / touch zones ──────────────────────────────────────────────────
  TOUCH_HEAD:     "touch_head",    // user clicks the top of the character
  TOUCH_BODY:     "touch_body",    // user clicks the body/torso area

  // ── App lifecycle ────────────────────────────────────────────────────────
  GREET:          "greet",         // page arrival / returning user
  ACKNOWLEDGE:    "acknowledge",   // confirming / "got it"
  DISMISS:        "dismiss",       // cancel / close / decline
  REACT:          "react",         // generic excited reaction

  // ── Task events ──────────────────────────────────────────────────────────
  TASK_START:     "task_start",    // generation / story / music started
  TASK_DONE:      "task_done",     // generation succeeded
  TASK_FAIL:      "task_fail",     // generation failed / error
  CELEBRATE:      "celebrate",     // special achievement (first story, milestone…)

  // ── Story ────────────────────────────────────────────────────────────────
  STORY_MOMENT:   "story_moment",  // dramatic / surprising story beat

  // ── Emotional states (direct override) ──────────────────────────────────
  HAPPY:          "happy",
  SAD:            "sad",
  SURPRISED:      "surprised",
  THINKING:       "thinking",
};
