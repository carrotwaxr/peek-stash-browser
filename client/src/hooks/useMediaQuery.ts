import { useEffect, useState } from "react";

/**
 * Hook to track whether a CSS media query matches.
 * Useful for responsive conditional rendering in React components.
 *
 * @param {string} query - CSS media query string (e.g., "(max-width: 768px)")
 * @returns {boolean} Whether the media query currently matches
 *
 * @example
 * const isMobile = useMediaQuery("(max-width: 768px)");
 * return isMobile ? <MobileView /> : <DesktopView />;
 */
export function useMediaQuery(query: string) {
  // Initialize with the current match state (SSR-safe fallback to false)
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQueryList = window.matchMedia(query);

    // Set initial state in case it changed between render and effect
    setMatches(mediaQueryList.matches);

    // Handler for media query changes
    const handleChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // Every browser the build targets (Safari 16 and later) has
    // addEventListener here; addListener was the Safari < 14 fallback
    mediaQueryList.addEventListener("change", handleChange);

    return () => {
      mediaQueryList.removeEventListener("change", handleChange);
    };
  }, [query]);

  return matches;
}
