import { useEffect, useState } from "react";

/**
 * The value, but only after it has stopped changing for `delayMs`.
 *
 * Used by player search: every keystroke re-filters the whole dictionary and
 * re-renders the result list, and a broad prefix like "a" matches hundreds of
 * players, so the render is the expensive half rather than the filter.
 */
export const useDebouncedValue = <T,>(value: T, delayMs = 150): T => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
};
