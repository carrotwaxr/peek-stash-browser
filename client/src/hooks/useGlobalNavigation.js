import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts.js";

/**
 * Hook for global navigation keyboard shortcuts (Stash-style)
 *
 * Provides "g + letter" hotkey support for navigating between pages.
 * Follows Stash's vim-style pattern: press "g" then a letter to navigate.
 *
 * @example
 * useGlobalNavigation(); // Call in App.jsx or top-level component
 *
 * Key mappings:
 * - g s → Scenes
 * - g r → Recommended
 * - g p → Performers
 * - g u → Studios
 * - g t → Tags
 * - g c → Collections
 * - g v → Collections (alternative)
 * - g l → Galleries
 * - g y → Playlists
 * - g z → Settings
 */
export const useGlobalNavigation = () => {
  const navigate = useNavigate();
  const inNavModeRef = useRef(false);
  const navTimeoutRef = useRef(null);

  // Clear any pending timeout when component unmounts
  useEffect(() => {
    return () => {
      if (navTimeoutRef.current) {
        clearTimeout(navTimeoutRef.current);
      }
    };
  }, []);

  // Navigation mappings (both g c and g v go to collections)
  const navMap = {
    s: "/scenes",
    r: "/recommended",
    p: "/performers",
    u: "/studios",
    t: "/tags",
    c: "/collections",
    v: "/collections", // Alternative for collections (matches Stash g v)
    l: "/galleries",
    y: "/playlists",
    z: "/settings",
  };

  // Build shortcuts object
  const shortcuts = {};

  // Register 'g' key to enter navigation mode
  shortcuts["g"] = () => {
    // Enter navigation mode
    inNavModeRef.current = true;

    // Clear any existing timeout
    if (navTimeoutRef.current) {
      clearTimeout(navTimeoutRef.current);
    }

    // Exit navigation mode after 1 second (matching Stash/rating behavior)
    navTimeoutRef.current = setTimeout(() => {
      inNavModeRef.current = false;
    }, 1000);
  };

  // Register navigation keys (only work in nav mode)
  Object.keys(navMap).forEach((key) => {
    shortcuts[key] = () => {
      // Only handle if in navigation mode
      if (inNavModeRef.current) {
        const path = navMap[key];
        navigate(path);

        // Exit navigation mode immediately after navigating
        inNavModeRef.current = false;
        if (navTimeoutRef.current) {
          clearTimeout(navTimeoutRef.current);
        }
      }
    };
  });

  // Register keyboard shortcuts
  useKeyboardShortcuts(shortcuts, {
    enabled: true,
    context: "global-navigation",
    // Custom handler to check navigation mode for letter keys
    shouldHandle: (event) => {
      const key = event.key;

      // Always handle 'g' key
      if (key === "g" || key === "G") {
        return true;
      }

      // Only handle navigation keys if in navigation mode
      const normalizedKey = key.toLowerCase();
      if (navMap[normalizedKey]) {
        return inNavModeRef.current;
      }

      return false;
    },
  });
};
