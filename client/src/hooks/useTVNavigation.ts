import { useCallback, useState } from "react";

/**
 * Custom hook for managing TV mode multi-zone navigation
 *
 * Handles navigation between different UI zones (nav, search, pagination, grid)
 * and manages focus state within each zone.
 *
 * @param {Object} options Configuration options
 * @param {Array<string>} options.zones Array of zone IDs in order (e.g., ['mainNav', 'search', 'topPagination', 'grid', 'bottomPagination'])
 * @param {string} options.initialZone Initial zone to focus (default: first zone)
 * @param {boolean} options.enabled Whether TV navigation is enabled
 * @returns {Object} Navigation state and control functions
 */
interface UseTVNavigationOptions {
  zones?: string[];
  initialZone?: string | null;
  enabled?: boolean;
}

export const useTVNavigation = ({
  zones = [],
  initialZone = null,
  enabled = true,
}: UseTVNavigationOptions) => {
  const [currentZone, setCurrentZone] = useState<string>(initialZone || zones[0]);
  const [focusIndex, setFocusIndex] = useState(0); // Focus index within current zone

  /**
   * Move to the next zone (down)
   */
  const goToNextZone = useCallback(() => {
    const currentIndex = zones.indexOf(currentZone);
    if (currentIndex < zones.length - 1) {
      const nextZone = zones[currentIndex + 1];
      setCurrentZone(nextZone);
      setFocusIndex(0); // Reset focus to first item in new zone
      return true;
    }
    return false; // Already at last zone
  }, [zones, currentZone]);

  /**
   * Move to the previous zone (up)
   */
  const goToPreviousZone = useCallback(() => {
    const currentIndex = zones.indexOf(currentZone);
    if (currentIndex > 0) {
      const prevZone = zones[currentIndex - 1];
      setCurrentZone(prevZone);
      setFocusIndex(0); // Reset focus to first item in new zone
      return true;
    }
    return false; // Already at first zone
  }, [zones, currentZone]);

  /**
   * Jump directly to a specific zone
   */
  const goToZone = useCallback(
    (zoneName: string) => {
      if (zones.includes(zoneName)) {
        setCurrentZone(zoneName);
        setFocusIndex(0);
        return true;
      }
      return false;
    },
    [zones]
  );

  /**
   * Check if a given zone is currently active
   */
  const isZoneActive = useCallback(
    (zoneName: string) => {
      return enabled && currentZone === zoneName;
    },
    [enabled, currentZone]
  );

  /**
   * Update focus index within current zone
   */
  const updateFocusIndex = useCallback((index: number) => {
    setFocusIndex(index);
  }, []);

  /**
   * Reset to initial zone and focus
   */
  const reset = useCallback(() => {
    setCurrentZone(initialZone || zones[0]);
    setFocusIndex(0);
  }, [zones, initialZone]);

  return {
    currentZone,
    focusIndex,
    goToNextZone,
    goToPreviousZone,
    goToZone,
    isZoneActive,
    updateFocusIndex,
    reset,
  };
};
