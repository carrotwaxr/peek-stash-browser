import { useEffect, useRef } from "react";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts.js";

/**
 * Global rating mode state - shared across hooks
 * This allows useMediaKeys to check if we're in rating mode before handling
 * keys like 'f' (fullscreen) and '0-9' (seek) that conflict with rating hotkeys.
 */
let globalRatingMode = false;
let globalRatingModeTimeout = null;

/**
 * Check if currently in rating mode (for use by other hooks like useMediaKeys)
 * @returns {boolean} True if in rating mode
 */
export const isInRatingMode = () => globalRatingMode;

/**
 * Hook for rating and favorite keyboard shortcuts (Stash-compatible)
 *
 * Provides "r + key" hotkey support for setting ratings and toggling favorites.
 * Follows Stash's pattern: press "r" then "1-5" for ratings (20/40/60/80/100),
 * "0" to clear rating, or "f" to toggle favorite.
 *
 * @param {Object} options Configuration options
 * @param {boolean} options.enabled Whether hotkeys are enabled
 * @param {Function} options.setRating Callback to set rating (receives number 0-100 or null)
 * @param {Function} options.toggleFavorite Optional callback to toggle favorite status
 *
 * @example
 * useRatingHotkeys({
 *   enabled: true,
 *   setRating: (newRating) => updateEntityRating(newRating),
 *   toggleFavorite: () => setFavorite(!favorite)
 * });
 */
export const useRatingHotkeys = ({
  enabled = true,
  setRating,
  toggleFavorite = null,
}) => {
  const ratingModeTimeoutRef = useRef(null);
  const inRatingModeRef = useRef(false);

  // Map of number keys to rating values (1-5 = 20/40/60/80/100, 0 = null)
  const ratingMap = {
    "0": null, // Clear rating
    "1": 20,
    "2": 40,
    "3": 60,
    "4": 80,
    "5": 100,
  };

  // Clear any pending timeout when component unmounts
  useEffect(() => {
    return () => {
      if (ratingModeTimeoutRef.current) {
        clearTimeout(ratingModeTimeoutRef.current);
      }
    };
  }, []);

  // Build shortcuts object dynamically based on rating mode state
  const shortcuts = {};

  // Helper to enter rating mode (updates both local and global state)
  const enterRatingMode = () => {
    inRatingModeRef.current = true;
    globalRatingMode = true;

    // Clear any existing timeout
    if (ratingModeTimeoutRef.current) {
      clearTimeout(ratingModeTimeoutRef.current);
    }
    if (globalRatingModeTimeout) {
      clearTimeout(globalRatingModeTimeout);
    }

    // Exit rating mode after 1 second (matching Stash behavior)
    const timeout = setTimeout(() => {
      inRatingModeRef.current = false;
      globalRatingMode = false;
    }, 1000);
    ratingModeTimeoutRef.current = timeout;
    globalRatingModeTimeout = timeout;
  };

  // Helper to exit rating mode (updates both local and global state)
  const exitRatingMode = () => {
    inRatingModeRef.current = false;
    globalRatingMode = false;
    if (ratingModeTimeoutRef.current) {
      clearTimeout(ratingModeTimeoutRef.current);
    }
    if (globalRatingModeTimeout) {
      clearTimeout(globalRatingModeTimeout);
    }
  };

  // Always register 'r' key to trigger rating mode
  shortcuts["r"] = () => {
    // Blur active element to prevent video player number keys from interfering
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    enterRatingMode();
  };

  // Register number keys (0-5) - these only work in rating mode
  Object.keys(ratingMap).forEach((key) => {
    shortcuts[key] = () => {
      if (inRatingModeRef.current) {
        const ratingValue = ratingMap[key];
        setRating(ratingValue);
        exitRatingMode();
      }
    };
  });

  // Register 'f' key for favorite toggle (only if callback provided)
  if (toggleFavorite) {
    shortcuts["f"] = () => {
      if (inRatingModeRef.current) {
        toggleFavorite();
        exitRatingMode();
      }
    };
  }

  // Register keyboard shortcuts
  // Note: Video player shortcuts (useMediaKeys) check isInRatingMode() before handling
  // conflicting keys (f, 0-5), so we use regular context here
  useKeyboardShortcuts(shortcuts, {
    enabled,
    context: "rating-hotkeys",
    // Custom handler to check rating mode for number keys and 'f' key
    shouldHandle: (event) => {
      const key = event.key;

      // Always handle 'r' key
      if (key === "r" || key === "R") {
        return true;
      }

      // Only handle number keys if in rating mode
      if (key >= "0" && key <= "5") {
        return inRatingModeRef.current;
      }

      // Only handle 'f' key if in rating mode and toggleFavorite is provided
      if ((key === "f" || key === "F") && toggleFavorite) {
        return inRatingModeRef.current;
      }

      return false;
    },
  });
};
