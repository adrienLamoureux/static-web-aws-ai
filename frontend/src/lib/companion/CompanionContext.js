/**
 * CompanionContext — global event bus for companion reactions.
 *
 * Any component can dispatch an action:
 *   const { dispatch } = useCompanion();
 *   dispatch(CompanionActions.GENERATION_START, { type: "image" });
 *
 * The CompanionPanel subscribes to events via useCompanionEvent():
 *   useCompanionEvent((action, payload) => { ... });
 *
 * The idle timer lives here: fires USER_IDLE after 60s of inactivity,
 * USER_RETURN when activity resumes.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from "react";

export const CompanionActions = {
  PAGE_NAVIGATE:    "page_navigate",    // { page: string }
  GENERATION_START: "generation_start", // { type: "image" | "story" | "video" }
  GENERATION_DONE:  "generation_done",  // { type, success: true }
  GENERATION_ERROR: "generation_error", // { type, error }
  USER_IDLE:        "user_idle",        // {}
  USER_RETURN:      "user_return",      // {}
};

const IDLE_TIMEOUT_MS = 60_000;
const IDLE_EVENTS = ["mousemove", "click", "keydown", "scroll", "touchstart"];

const CompanionContext = createContext({
  dispatch:  () => {},
  subscribe: () => () => {},
});

export function CompanionProvider({ children }) {
  const listenersRef = useRef([]);
  const idleTimerRef = useRef(null);
  const isIdleRef    = useRef(false);

  const dispatch = useCallback((action, payload = {}) => {
    listenersRef.current.forEach((fn) => {
      try { fn(action, payload); } catch {}
    });
  }, []);

  const subscribe = useCallback((fn) => {
    listenersRef.current = [...listenersRef.current, fn];
    return () => {
      listenersRef.current = listenersRef.current.filter((f) => f !== fn);
    };
  }, []);

  // Idle timer
  useEffect(() => {
    const resetIdle = () => {
      if (isIdleRef.current) {
        isIdleRef.current = false;
        dispatch(CompanionActions.USER_RETURN, {});
      }
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        isIdleRef.current = true;
        dispatch(CompanionActions.USER_IDLE, {});
      }, IDLE_TIMEOUT_MS);
    };

    IDLE_EVENTS.forEach((ev) =>
      document.addEventListener(ev, resetIdle, { passive: true })
    );
    resetIdle();

    return () => {
      IDLE_EVENTS.forEach((ev) => document.removeEventListener(ev, resetIdle));
      clearTimeout(idleTimerRef.current);
    };
  }, [dispatch]);

  return (
    <CompanionContext.Provider value={{ dispatch, subscribe }}>
      {children}
    </CompanionContext.Provider>
  );
}

export function useCompanion() {
  return useContext(CompanionContext);
}

/**
 * Subscribe to companion events. The callback receives (action, payload).
 * Stable reference via callbackRef — safe to use inline functions.
 */
export function useCompanionEvent(callback) {
  const { subscribe } = useContext(CompanionContext);
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    return subscribe((action, payload) => cbRef.current(action, payload));
  }, [subscribe]);
}
