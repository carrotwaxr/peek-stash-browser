import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * Returns a debounced version of a value.
 * The returned value only updates after the specified delay
 * has passed without the input value changing.
 *
 * @param {any} value - The value to debounce
 * @param {number} delay - Debounce delay in milliseconds (default: 300)
 * @returns {any} The debounced value
 *
 * @example
 * const debouncedSearch = useDebouncedValue(searchTerm, 300);
 * useEffect(() => { loadOptions(debouncedSearch); }, [debouncedSearch]);
 */
export const useDebouncedValue = <T>(value: T, delay = 300): T => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
};

/**
 * Returns a debounced version of a callback function.
 * The callback only executes after the specified delay has passed
 * without the function being called again.
 *
 * @param {Function} callback - The function to debounce
 * @param {number} delay - Debounce delay in milliseconds (default: 300)
 * @returns {Function} The debounced function
 *
 * @example
 * const debouncedSave = useDebouncedCallback((value) => saveRating(value), 300);
 * const handleChange = (e) => { setValue(e.target.value); debouncedSave(e.target.value); };
 */
export const useDebouncedCallback = (
  callback: (...args: unknown[]) => void,
  delay = 300
) => {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);

  // Keep callback ref fresh to avoid stale closures
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback(
    (...args: unknown[]) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(
        () => callbackRef.current(...args),
        delay
      );
    },
    [delay]
  );
};

/** A debounced call that can run at once or be dropped */
export interface FlushableDebounce<A extends unknown[]> {
  /** Waits `delay`, then calls with these arguments; a later call replaces it */
  run: (...args: A) => void;
  /** Calls the waiting call now; nothing when none waits */
  flush: () => void;
  /** Drops the waiting call */
  cancel: () => void;
}

/**
 * A trailing debounce of `callback` with a flush: `run` waits `delay` after
 * the last call, `flush` runs the waiting call at once (a popover closing
 * with a change not yet applied) and `cancel` drops it. The functions keep
 * their identity across renders and call the latest `callback`. An unmount
 * drops the waiting call, so a caller that must not lose it flushes first.
 */
export function useFlushableDebounce<A extends unknown[]>(
  callback: (...args: A) => void,
  delay = 300
): FlushableDebounce<A> {
  const callbackRef = useRef(callback);
  useLayoutEffect(() => {
    callbackRef.current = callback;
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waitingRef = useRef<{ args: A } | null>(null);

  const debounce = useMemo<FlushableDebounce<A>>(() => {
    const cancel = () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = null;
      waitingRef.current = null;
    };
    const flush = () => {
      const waiting = waitingRef.current;
      cancel();
      if (waiting !== null) callbackRef.current(...waiting.args);
    };
    const run = (...args: A) => {
      cancel();
      waitingRef.current = { args };
      timerRef.current = setTimeout(flush, delay);
    };
    return { run, flush, cancel };
  }, [delay]);

  useEffect(() => debounce.cancel, [debounce]);

  return debounce;
}
