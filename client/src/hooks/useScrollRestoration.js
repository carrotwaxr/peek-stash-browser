import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * Saves and restores scroll position across route navigations.
 * - On POP (back/forward): restores saved scroll position
 * - On PUSH/REPLACE: scrolls to top
 */
const useScrollRestoration = () => {
  const location = useLocation();
  const navigationType = useNavigationType();
  const scrollYRef = useRef(0);
  const prevKeyRef = useRef("");

  // Track current scroll position via passive listener
  useEffect(() => {
    const handleScroll = () => {
      scrollYRef.current = window.scrollY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Save/restore on route changes
  useEffect(() => {
    const key = location.pathname + location.search;

    // Save the scroll position of the route we're leaving
    if (prevKeyRef.current && prevKeyRef.current !== key) {
      try {
        sessionStorage.setItem(
          `scrollPos:${prevKeyRef.current}`,
          String(scrollYRef.current)
        );
      } catch {
        // sessionStorage full or unavailable
      }
    }

    prevKeyRef.current = key;

    if (navigationType === "POP") {
      // Back/forward navigation — restore saved position
      const saved = sessionStorage.getItem(`scrollPos:${key}`);
      if (saved) {
        const y = parseInt(saved, 10);
        // Try immediately, then retry for lazy-loaded content
        window.scrollTo(0, y);
        requestAnimationFrame(() => window.scrollTo(0, y));
        const timer = setTimeout(() => window.scrollTo(0, y), 100);
        return () => clearTimeout(timer);
      }
    } else {
      // PUSH or REPLACE — scroll to top
      window.scrollTo(0, 0);
    }
  }, [location.pathname, location.search, navigationType]);
};

export default useScrollRestoration;
