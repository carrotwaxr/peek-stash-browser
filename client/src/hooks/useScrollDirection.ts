import { useEffect, useRef, useState } from "react";

/**
 * Custom hook to detect scroll direction
 * Returns 'up', 'down', or 'top'
 *
 * @param {number} threshold - Minimum scroll distance before hiding (default: 100px)
 * @returns {string} 'up' | 'down' | 'top'
 */
export const useScrollDirection = (threshold = 100) => {
  const [scrollDirection, setScrollDirection] = useState("top");
  const lastScrollYRef = useRef(window.scrollY);

  useEffect(() => {
    let ticking = false;

    const updateScrollDirection = () => {
      const scrollY = window.scrollY;

      // At the top of the page
      if (scrollY < threshold) {
        setScrollDirection("top");
      }
      // Scrolling down
      else if (scrollY > lastScrollYRef.current && scrollY > threshold) {
        setScrollDirection("down");
      }
      // Scrolling up
      else if (scrollY < lastScrollYRef.current) {
        setScrollDirection("up");
      }

      lastScrollYRef.current = scrollY;
      ticking = false;
    };

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateScrollDirection);
        ticking = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [threshold]);

  return scrollDirection;
};
