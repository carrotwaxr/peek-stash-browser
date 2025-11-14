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
          // Matches card-grid-responsive CSS: minmax(320px, 1fr) with gap-6 (24px)
          // Required width for N columns: (N × 320) + ((N-1) × 24)
          if (width >= 4104) return 12; // 3840 + 264
          if (width >= 3416) return 10; // 3200 + 216
          if (width >= 2728) return 8; // 2560 + 168
          if (width >= 2384) return 7; // 2240 + 144
          if (width >= 2040) return 6; // 1920 + 120
          if (width >= 1696) return 5; // 1600 + 96
          if (width >= 1352) return 4; // 1280 + 72
          if (width >= 1008) return 3; // 960 + 48
          if (width >= 664) return 2; // 640 + 24
          return 1; // < 664px (mobile)

        case "performers":
          // Matches xs:1 sm:2 md:3 lg:4 xl:5 2xl:6
          if (width >= 1536) return 6; // 2xl
          if (width >= 1280) return 5; // xl
          if (width >= 1024) return 4; // lg
          if (width >= 768) return 3; // md
          if (width >= 640) return 2; // sm
          return 1; // xs

        case "tags":
        case "galleries":
        case "groups":
        case "studios":
          // Matches xs:1 sm:2 md:3 lg:4 xl:5 2xl:6
          if (width >= 1536) return 6; // 2xl
          if (width >= 1280) return 5; // xl
          if (width >= 1024) return 4; // lg
          if (width >= 768) return 3; // md
          if (width >= 640) return 2; // sm
          return 1; // xs

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
