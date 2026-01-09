import { useRef, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Low-level hook for URL state management.
 * Reads URL once on mount, writes silently on changes.
 *
 * @param {Object} options
 * @param {Object} options.defaults - Default values when URL params missing
 * @param {string[]} options.ignoreKeys - Keys to ignore when computing hasUrlParams
 * @returns {Object} { values, setValue, setValues, hasUrlParams }
 */
export const useUrlState = ({ defaults = {}, ignoreKeys = [] } = {}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initializedRef = useRef(false);
  const hadUrlParamsRef = useRef(false);

  // Parse initial URL only once
  const getInitialValues = () => {
    const parsed = { ...defaults };
    let hasNonIgnoredParams = false;

    for (const [key, value] of searchParams.entries()) {
      parsed[key] = value;
      if (!ignoreKeys.includes(key)) {
        hasNonIgnoredParams = true;
      }
    }

    hadUrlParamsRef.current = hasNonIgnoredParams;
    return parsed;
  };

  const [values, setValuesState] = useState(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      return getInitialValues();
    }
    return {};
  });

  const setValue = useCallback((key, value, options = {}) => {
    const { replace = false } = options;

    // Update internal state
    setValuesState((prev) => ({
      ...prev,
      [key]: value,
    }));

    // Update URL silently
    setSearchParams((prevParams) => {
      const newParams = new URLSearchParams(prevParams);
      if (value === null || value === undefined || value === "") {
        newParams.delete(key);
      } else {
        newParams.set(key, String(value));
      }
      return newParams;
    }, { replace });
  }, [setSearchParams]);

  const setValues = useCallback((updates, options = {}) => {
    const { replace = false } = options;

    setValuesState((prev) => ({
      ...prev,
      ...updates,
    }));

    setSearchParams((prevParams) => {
      const newParams = new URLSearchParams(prevParams);
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === undefined || value === "") {
          newParams.delete(key);
        } else {
          newParams.set(key, String(value));
        }
      });
      return newParams;
    }, { replace });
  }, [setSearchParams]);

  return {
    values,
    setValue,
    setValues,
    hasUrlParams: hadUrlParamsRef.current,
  };
};
