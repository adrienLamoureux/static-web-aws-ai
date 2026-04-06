/**
 * useProactiveCompanion — hook that listens to companion events and fetches
 * AI-generated proactive messages from the backend, with cooldown management
 * to avoid being annoying.
 *
 * Cooldown rules:
 *   - Global cooldown: 90s between any proactive message
 *   - Per-trigger cooldown: 5min for the same trigger type
 *   - Session cap: max 8 proactive messages total
 *   - First-visit grace: handled naturally by the 2s mount delay in CompanionContext
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useCompanionEvent, CompanionActions } from "./CompanionContext";
import { useConfig } from "../../contexts/ConfigContext";
import { buildApiUrl, postJson } from "../../services/apiClient";
import { COMPANION_PROACTIVE } from "../../constants/api-routes";

const GLOBAL_COOLDOWN_MS   = 90_000;  // 90s between any proactive message
const TRIGGER_COOLDOWN_MS  = 5 * 60_000; // 5min same trigger
const SESSION_CAP          = 8;
const BUBBLE_DURATION_MS   = 6000;

// Map CompanionActions to proactive trigger names sent to backend
const ACTION_TO_TRIGGER = {
  [CompanionActions.PAGE_NAVIGATE]:    "page_navigate",
  [CompanionActions.GENERATION_DONE]:  "generation_done",
  [CompanionActions.GENERATION_ERROR]: "generation_error",
  [CompanionActions.USER_IDLE]:        "idle",
  [CompanionActions.USER_RETURN]:      "return",
  [CompanionActions.FIRST_VISIT]:      "first_visit",
  [CompanionActions.LONG_SESSION]:     "long_session",
  [CompanionActions.STORY_TURN]:       "story_turn",
};

// Page labels for context (duplicated from CompanionChat to avoid circular dep)
const PAGE_LABELS = {
  "/":          "Realm (Home)",
  "/atelier":   "Atelier (Image & Video Forge)",
  "/chronicle": "Chronicle (Story)",
  "/gallery":   "Gallery",
  "/sanctum":   "Sanctum (Director)",
};

export default function useProactiveCompanion() {
  const { apiBaseUrl } = useConfig();
  const [proactiveText, setProactiveText] = useState(null);
  const [proactiveEmotion, setProactiveEmotion] = useState("neutral");

  const lastGlobalRef     = useRef(0);
  const triggerTimesRef   = useRef({});
  const sessionCountRef   = useRef(0);
  const bubbleTimerRef    = useRef(null);
  const abortRef          = useRef(null);

  const dismissProactive = useCallback(() => {
    setProactiveText(null);
    clearTimeout(bubbleTimerRef.current);
  }, []);

  const canFire = useCallback((trigger) => {
    const now = Date.now();
    if (sessionCountRef.current >= SESSION_CAP) return false;
    if (now - lastGlobalRef.current < GLOBAL_COOLDOWN_MS) return false;
    if (triggerTimesRef.current[trigger] && now - triggerTimesRef.current[trigger] < TRIGGER_COOLDOWN_MS) return false;
    return true;
  }, []);

  const fetchProactive = useCallback(async (trigger, payload) => {
    if (!apiBaseUrl || !canFire(trigger)) return;

    // Mark cooldowns optimistically
    const now = Date.now();
    lastGlobalRef.current = now;
    triggerTimesRef.current[trigger] = now;
    sessionCountRef.current += 1;

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    // Build context from payload
    const context = {};
    if (payload?.page) {
      context.page = payload.page;
    } else if (typeof window !== "undefined") {
      const path = window.location.pathname;
      context.page = PAGE_LABELS[path] || path;
    }
    if (payload?.recentAction) context.recentAction = payload.recentAction;

    try {
      const data = await postJson(
        buildApiUrl(apiBaseUrl, COMPANION_PROACTIVE),
        { trigger, context }
      );

      if (data?.text) {
        setProactiveText(data.text);
        setProactiveEmotion(data.emotion || "neutral");

        clearTimeout(bubbleTimerRef.current);
        bubbleTimerRef.current = setTimeout(() => {
          setProactiveText(null);
        }, BUBBLE_DURATION_MS);
      }
    } catch {
      // Proactive messages are best-effort — silent failure
      // Roll back counters on failure so the user isn't penalized
      sessionCountRef.current = Math.max(0, sessionCountRef.current - 1);
    }
  }, [apiBaseUrl, canFire]);

  // Subscribe to companion events
  useCompanionEvent(useCallback((action, payload) => {
    const trigger = ACTION_TO_TRIGGER[action];
    if (!trigger) return;

    // Skip generation_start — we don't want to interrupt during generation
    if (action === CompanionActions.GENERATION_START) return;

    fetchProactive(trigger, payload);
  }, [fetchProactive]));

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimeout(bubbleTimerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  return {
    proactiveText,
    proactiveEmotion,
    dismissProactive,
  };
}
