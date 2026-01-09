import { useRef } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Low-level hook for URL state management.
 * Reads URL once on mount, writes silently on changes.
 *
 * @param {Object} options
 * @param {Object} options.defaults - Default values when URL params missing
 * @returns {Object} { values, setValue, setValues }
 */
export const useUrlState = ({ defaults = {} } = {}) => {
  const [searchParams] = useSearchParams();
  const initializedRef = useRef(false);
  const valuesRef = useRef(null);

  // Read URL params only once on first render
  if (!initializedRef.current) {
    initializedRef.current = true;
    const parsed = {};

    // Start with defaults
    Object.keys(defaults).forEach((key) => {
      parsed[key] = defaults[key];
    });

    // Override with URL params
    for (const [key, value] of searchParams.entries()) {
      parsed[key] = value;
    }

    valuesRef.current = parsed;
  }

  return {
    values: valuesRef.current,
    setValue: () => {}, // Placeholder
    setValues: () => {}, // Placeholder
  };
};
