import { useState, useEffect } from "react";

/**
 * Custom hook to calculate and track grid columns based on screen width
 * Handles responsive column calculation and window resize events
 *
 * @param {string} gridType - Type of grid: 'scenes', 'performers', 'studios', or 'tags'
 * @returns {number} Current number of columns
 */
export const useGridColumns = (gridType = 'default') => {
  const [columns, setColumns] = useState(4);

  useEffect(() => {
    const getColumns = () => {
      if (typeof window === "undefined") return 4;
      const width = window.innerWidth;

      switch (gridType) {
        case 'scenes':
          // Matches scene-grid-responsive CSS breakpoints
          if (width >= 3840) return 12; // 4K
          if (width >= 2560) return 10; // 2K
          if (width >= 1920) return 8;  // 1080p
          if (width >= 1600) return 7;  // Large desktop
          if (width >= 1280) return 6;  // xl
          if (width >= 1024) return 5;  // lg
          if (width >= 768) return 4;   // md
          if (width >= 640) return 3;   // sm
          return 2; // xs

        case 'performers':
          // Matches xs:1 sm:2 md:3 lg:4 xl:5 2xl:6
          if (width >= 1536) return 6; // 2xl
          if (width >= 1280) return 5; // xl
          if (width >= 1024) return 4; // lg
          if (width >= 768) return 3;  // md
          if (width >= 640) return 2;  // sm
          return 1; // xs

        case 'studios':
        case 'tags':
          // Matches grid-cols-1 md:2 lg:3
          if (width >= 1024) return 3; // lg
          if (width >= 768) return 2;  // md
          return 1; // base

        default:
          // Generic responsive grid
          if (width >= 1280) return 6;
          if (width >= 1024) return 5;
          if (width >= 768) return 4;
          if (width >= 640) return 3;
          return 2;
      }
    };

    const updateColumns = () => {
      setColumns(getColumns());
    };

    // Initial calculation
    updateColumns();

    // Update on window resize
    window.addEventListener("resize", updateColumns);
    return () => window.removeEventListener("resize", updateColumns);
  }, [gridType]);

  return columns;
};
