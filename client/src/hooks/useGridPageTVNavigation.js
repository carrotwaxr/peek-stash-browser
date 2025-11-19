import { useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useTVMode } from "./useTVMode.js";
import { useTVNavigation } from "./useTVNavigation.js";
import { useSpatialNavigation } from "./useSpatialNavigation.js";

/**
 * Shared TV navigation logic for grid pages (Performers, Scenes, Studios, etc.)
 * Manages zones: search, topPagination, grid, bottomPagination, mainNav
 *
 * @param {Object} options Configuration options
 * @param {Array} options.items Grid items to navigate
 * @param {number} options.columns Number of columns in grid
 * @param {number} options.totalPages Total number of pages
 * @param {Function} options.onItemSelect Callback when item is selected (Enter)
 * @returns {Object} TV navigation state and handlers
 */
export const useGridPageTVNavigation = ({
  items = [],
  columns = 6,
  totalPages = 1,
  onItemSelect,
}) => {
  const { isTVMode } = useTVMode();
  const [searchParams] = useSearchParams();
  const paginationHandlerRef = useRef(null);

  // Get current page from URL
  const urlPage = parseInt(searchParams.get("page") || "1", 10);

  // TV Navigation zones
  const tvNavigation = useTVNavigation({
    zones: ["search", "topPagination", "grid", "bottomPagination", "mainNav"],
    initialZone: "grid",
    enabled: isTVMode,
  });

  // Spatial navigation for grid
  const gridNavigation = useSpatialNavigation({
    items,
    columns,
    enabled: isTVMode && tvNavigation.isZoneActive("grid"),
    onSelect: onItemSelect,
    onEscapeUp: useCallback(() => {
      // Blur the currently focused element before switching zones
      if (document.activeElement) {
        document.activeElement.blur();
      }
      tvNavigation.goToPreviousZone();
    }, [tvNavigation]),
    onEscapeDown: useCallback(() => {
      // Blur the currently focused element before switching zones
      if (document.activeElement) {
        document.activeElement.blur();
      }
      tvNavigation.goToNextZone();
    }, [tvNavigation]),
    onEscapeLeft: useCallback(() => {
      // Blur the currently focused element before switching zones
      if (document.activeElement) {
        document.activeElement.blur();
      }
      tvNavigation.goToZone("mainNav");
    }, [tvNavigation]),
  });

  // PageUp/PageDown handlers
  const handlePageUpKey = useCallback(() => {
    if (urlPage > 1 && paginationHandlerRef.current) {
      paginationHandlerRef.current(urlPage - 1);
    }
  }, [urlPage]);

  const handlePageDownKey = useCallback(() => {
    if (urlPage < totalPages && paginationHandlerRef.current) {
      paginationHandlerRef.current(urlPage + 1);
    }
  }, [urlPage, totalPages]);

  // Dispatch zone change events for global listeners (e.g., Sidebar)
  useEffect(() => {
    if (isTVMode) {
      window.dispatchEvent(
        new CustomEvent("tvZoneChange", {
          detail: { zone: tvNavigation.currentZone },
        })
      );
    }
  }, [isTVMode, tvNavigation.currentZone]);

  // Listen for search zone escape events
  useEffect(() => {
    if (!isTVMode) return;

    const handleSearchZoneEscape = (e) => {
      const { direction } = e.detail;
      if (direction === "up") {
        const moved = tvNavigation.goToPreviousZone();
        console.log(
          moved
            ? `🔼 Moved to previous zone: ${tvNavigation.currentZone}`
            : "🔼 Already at first zone"
        );
      } else if (direction === "down") {
        tvNavigation.goToZone("topPagination");
        console.log("🔽 Moved from search to topPagination");
      }
    };

    window.addEventListener("tvSearchZoneEscape", handleSearchZoneEscape);
    return () => window.removeEventListener("tvSearchZoneEscape", handleSearchZoneEscape);
  }, [isTVMode, tvNavigation]);

  // Listen for pagination zone escape events
  useEffect(() => {
    if (!isTVMode) return;

    const handlePaginationEscape = (e) => {
      const { zone, direction } = e.detail;

      if (zone === "top") {
        if (direction === "up") {
          tvNavigation.goToZone("search");
          console.log("🔼 Moved from topPagination to search");
        } else if (direction === "down") {
          tvNavigation.goToZone("grid");
          console.log("🔽 Moved from topPagination to grid");
        }
      } else if (zone === "bottom") {
        if (direction === "up") {
          tvNavigation.goToZone("grid");
          console.log("🔼 Moved from bottomPagination to grid");
        } else if (direction === "down") {
          console.log("🔽 Already at last content zone");
        }
      }
    };

    window.addEventListener("tvPaginationEscape", handlePaginationEscape);
    return () => window.removeEventListener("tvPaginationEscape", handlePaginationEscape);
  }, [isTVMode, tvNavigation]);

  // Global keyboard handler for mainNav zone
  useEffect(() => {
    if (!isTVMode || !tvNavigation.isZoneActive("mainNav")) return;

    const handleGlobalKeyDown = (e) => {
      // Sidebar (mainNav) navigation
      if (e.key === "ArrowRight") {
        e.preventDefault();
        tvNavigation.goToZone("grid");
        console.log("➡️ Moved from sidebar to grid");
      }
      // Up/Down navigation handled by Sidebar component itself
    };

    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, [isTVMode, tvNavigation]);

  // Global keyboard handler for content zones (search, pagination)
  useEffect(() => {
    if (!isTVMode || tvNavigation.isZoneActive("grid") || tvNavigation.isZoneActive("mainNav")) return;

    const handleGlobalKeyDown = (e) => {
      // Content zones (search, topPagination, bottomPagination)
      // Navigation within these zones is now handled by useHorizontalNavigation in each component
      // Only handle Left arrow to move to sidebar
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        tvNavigation.goToZone("mainNav");
        console.log("⬅️ Moved to sidebar from content zone");
      }
    };

    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, [isTVMode, tvNavigation]);

  // PageUp/PageDown keyboard handler
  useEffect(() => {
    if (!isTVMode) return;

    const handleKeyDown = (e) => {
      if (e.key === "PageUp") {
        e.preventDefault();
        handlePageUpKey();
      } else if (e.key === "PageDown") {
        e.preventDefault();
        handlePageDownKey();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isTVMode, handlePageUpKey, handlePageDownKey]);

  return {
    isTVMode,
    tvNavigation,
    gridNavigation,
    paginationHandlerRef,
    // Props to pass to SearchControls
    searchControlsProps: {
      tvSearchZoneActive: isTVMode && tvNavigation.isZoneActive("search"),
      tvTopPaginationZoneActive: isTVMode && tvNavigation.isZoneActive("topPagination"),
      tvBottomPaginationZoneActive: isTVMode && tvNavigation.isZoneActive("bottomPagination"),
      paginationHandlerRef,
    },
    // Props to pass to grid items
    gridItemProps: (index) => ({
      ref: (el) => gridNavigation.setItemRef(index, el),
      className: gridNavigation.isFocused(index) ? "keyboard-focus" : "",
      tabIndex: gridNavigation.isFocused(index) ? 0 : -1,
    }),
  };
};
