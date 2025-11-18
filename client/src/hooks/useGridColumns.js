import { useEffect, useState } from "react";

/**
 * Custom hook to calculate and track grid columns based on screen width
 * Handles responsive column calculation and window resize events
 *
 * @param {string} gridType - Type of grid: 'scenes', 'performers', 'studios', or 'tags'
 * @returns {number} Current number of columns
 */
export const useGridColumns = (gridType = "default") => {
  const [columns, setColumns] = useState(4);

  useEffect(() => {
    const getColumns = () => {
      if (typeof window === "undefined") return 4;
      const width = window.innerWidth;

      switch (gridType) {
        case "scenes":
          if (width >= 3840) return 8;
          if (width >= 2560) return 5;
          if (width >= 1920) return 4;
          if (width >= 1280) return 3;
          if (width >= 768) return 2;
          return 1;

        case "performers":
        case "tags":
        case "galleries":
        case "groups":
        case "studios":
        default:
          if (width >= 3840) return 10;
          if (width >= 2560) return 6;
          if (width >= 1920) return 5;
          if (width >= 1024) return 3;
          if (width >= 640) return 2;
          return 1;
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
