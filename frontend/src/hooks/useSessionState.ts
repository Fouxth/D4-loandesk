import { useState } from "react";

/**
 * Custom hook that works like useState, but persists state in sessionStorage.
 * State will survive route changes within the same session, and will reset
 * when the tab/webapp is closed or swiped away.
 */
export function useSessionState<T>(key: string, defaultValue: T): [T, (val: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const stored = sessionStorage.getItem(key);
      if (stored !== null) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error(`Failed to read sessionStorage for key "${key}"`, e);
    }
    return defaultValue;
  });

  const setSessionState = (valueOrFn: T | ((prev: T) => T)) => {
    setState((prev) => {
      const next = typeof valueOrFn === "function" ? (valueOrFn as (prev: T) => T)(prev) : valueOrFn;
      try {
        sessionStorage.setItem(key, JSON.stringify(next));
      } catch (e) {
        console.error(`Failed to save sessionStorage for key "${key}"`, e);
      }
      return next;
    });
  };

  return [state, setSessionState];
}
