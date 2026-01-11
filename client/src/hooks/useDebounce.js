import { useCallback, useEffect, useRef, useState } from "react";

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
export const useDebouncedValue = (value, delay = 300) => {
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
export const useDebouncedCallback = (callback, delay = 300) => {
  const timeoutRef = useRef(null);
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
    (...args) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => callbackRef.current(...args), delay);
    },
    [delay]
  );
};
