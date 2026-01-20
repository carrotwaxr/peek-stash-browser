import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { apiGet } from "../../services/api.js";
import {
  startOfYear,
  endOfYear,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  startOfDay,
  endOfDay,
  format,
  parse,
} from "date-fns";

const ZOOM_LEVELS = ["years", "months", "weeks", "days"];

function parsePeriodToDateRange(period, zoomLevel) {
  if (!period) return null;

  try {
    let start, end, label;

    switch (zoomLevel) {
      case "years": {
        const date = parse(period, "yyyy", new Date());
        if (isNaN(date.getTime())) return null;
        start = format(startOfYear(date), "yyyy-MM-dd");
        end = format(endOfYear(date), "yyyy-MM-dd");
        label = period;
        break;
      }
      case "months": {
        const date = parse(period, "yyyy-MM", new Date());
        if (isNaN(date.getTime())) return null;
        start = format(startOfMonth(date), "yyyy-MM-dd");
        end = format(endOfMonth(date), "yyyy-MM-dd");
        label = format(date, "MMMM yyyy");
        break;
      }
      case "weeks": {
        // Format: "2024-W12"
        if (!period.includes("-W")) return null;
        const [year, weekStr] = period.split("-W");
        const date = parse(`${year}-W${weekStr}-1`, "RRRR-'W'II-i", new Date());
        if (isNaN(date.getTime())) return null;
        start = format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
        end = format(endOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
        label = `Week ${weekStr}, ${year}`;
        break;
      }
      case "days": {
        const date = parse(period, "yyyy-MM-dd", new Date());
        if (isNaN(date.getTime())) return null;
        start = format(startOfDay(date), "yyyy-MM-dd");
        end = format(endOfDay(date), "yyyy-MM-dd");
        label = format(date, "MMMM d, yyyy");
        break;
      }
      default:
        return null;
    }

    return { period, start, end, label };
  } catch {
    // Return null for any parsing errors
    return null;
  }
}

export function useTimelineState({ entityType, autoSelectRecent = false, initialPeriod = null, filters = null }) {
  // Determine initial zoom level from initialPeriod format if provided
  const getInitialZoomLevel = () => {
    if (!initialPeriod) return "months";
    if (initialPeriod.includes("-W")) return "weeks";
    if (initialPeriod.match(/^\d{4}$/)) return "years";
    if (initialPeriod.match(/^\d{4}-\d{2}-\d{2}$/)) return "days";
    if (initialPeriod.match(/^\d{4}-\d{2}$/)) return "months";
    return "months";
  };

  const [zoomLevel, setZoomLevelState] = useState(getInitialZoomLevel);
  const [selectedPeriod, setSelectedPeriod] = useState(() => {
    // Parse initial period from URL if provided
    if (initialPeriod) {
      const zoom = getInitialZoomLevel();
      return parsePeriodToDateRange(initialPeriod, zoom);
    }
    return null;
  });
  const [distribution, setDistribution] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Memoize filter key to prevent unnecessary refetches
  const filterKey = useMemo(() => {
    if (!filters) return null;
    return JSON.stringify(filters);
  }, [filters]);

  // Track whether we've done the initial load (for autoSelectRecent)
  const hasInitiallyLoaded = useRef(!!initialPeriod); // Skip auto-select if we have initialPeriod

  // Clear selection when zoom level changes
  const setZoomLevel = useCallback((newLevel) => {
    setZoomLevelState((prevLevel) => {
      if (prevLevel !== newLevel) {
        setSelectedPeriod(null);
      }
      return newLevel;
    });
  }, []);

  // Fetch distribution when entityType or zoomLevel changes
  useEffect(() => {
    let cancelled = false;

    async function fetchDistribution() {
      setIsLoading(true);
      setError(null);

      try {
        // Build query params
        const params = new URLSearchParams({ granularity: zoomLevel });
        if (filters?.performerId) params.set("performerId", filters.performerId);
        if (filters?.tagId) params.set("tagId", filters.tagId);
        if (filters?.studioId) params.set("studioId", filters.studioId);
        if (filters?.groupId) params.set("groupId", filters.groupId);

        const response = await apiGet(
          `/timeline/${entityType}/distribution?${params.toString()}`
        );

        if (!cancelled) {
          setDistribution(response.distribution || []);

          // Auto-select most recent period only on initial fetch
          if (
            autoSelectRecent &&
            !hasInitiallyLoaded.current &&
            response.distribution?.length > 0
          ) {
            const mostRecent = response.distribution[response.distribution.length - 1];
            setSelectedPeriod(parsePeriodToDateRange(mostRecent.period, zoomLevel));
          }

          hasInitiallyLoaded.current = true;
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to fetch distribution");
          setDistribution([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchDistribution();

    return () => {
      cancelled = true;
    };
  }, [entityType, zoomLevel, autoSelectRecent, filterKey]);

  const selectPeriod = useCallback(
    (period) => {
      setSelectedPeriod((prev) =>
        prev?.period === period ? null : parsePeriodToDateRange(period, zoomLevel)
      );
    },
    [zoomLevel]
  );

  const clearSelection = useCallback(() => {
    setSelectedPeriod(null);
  }, []);

  // Calculate max count for bar height scaling
  const maxCount = useMemo(() => {
    if (distribution.length === 0) return 0;
    return Math.max(...distribution.map((d) => d.count));
  }, [distribution]);

  return {
    zoomLevel,
    setZoomLevel,
    selectedPeriod,
    selectPeriod,
    clearSelection,
    distribution,
    maxCount,
    isLoading,
    error,
    ZOOM_LEVELS,
  };
}
