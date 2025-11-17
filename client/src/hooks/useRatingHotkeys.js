import { useEffect, useRef } from "react";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts.js";

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

  // Always register 'r' key to trigger rating mode
  shortcuts["r"] = () => {
    // Blur active element to prevent video player number keys from interfering
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    // Enter rating mode
    inRatingModeRef.current = true;

    // Clear any existing timeout
    if (ratingModeTimeoutRef.current) {
      clearTimeout(ratingModeTimeoutRef.current);
    }

    // Exit rating mode after 1 second (matching Stash behavior)
    ratingModeTimeoutRef.current = setTimeout(() => {
      inRatingModeRef.current = false;
    }, 1000);
  };

  // Register number keys (0-5) - these only work in rating mode
  Object.keys(ratingMap).forEach((key) => {
    shortcuts[key] = () => {
      // Only handle if in rating mode
      if (inRatingModeRef.current) {
        const ratingValue = ratingMap[key];
        setRating(ratingValue);

        // Exit rating mode immediately after setting rating
        inRatingModeRef.current = false;
        if (ratingModeTimeoutRef.current) {
          clearTimeout(ratingModeTimeoutRef.current);
        }
      }
    };
  });

  // Register 'f' key for favorite toggle (only if callback provided)
  if (toggleFavorite) {
    shortcuts["f"] = () => {
      // Only handle if in rating mode
      if (inRatingModeRef.current) {
        toggleFavorite();

        // Exit rating mode immediately after toggling favorite
        inRatingModeRef.current = false;
        if (ratingModeTimeoutRef.current) {
          clearTimeout(ratingModeTimeoutRef.current);
        }
      }
    };
  }

  // Register keyboard shortcuts
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

export default useRatingHotkeys;
