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
  let start, end, label;

  switch (zoomLevel) {
    case "years": {
      const date = parse(period, "yyyy", new Date());
      start = format(startOfYear(date), "yyyy-MM-dd");
      end = format(endOfYear(date), "yyyy-MM-dd");
      label = period;
      break;
    }
    case "months": {
      const date = parse(period, "yyyy-MM", new Date());
      start = format(startOfMonth(date), "yyyy-MM-dd");
      end = format(endOfMonth(date), "yyyy-MM-dd");
      label = format(date, "MMMM yyyy");
      break;
    }
    case "weeks": {
      // Format: "2024-W12"
      const [year, weekStr] = period.split("-W");
      const date = parse(`${year}-W${weekStr}-1`, "RRRR-'W'II-i", new Date());
      start = format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
      end = format(endOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
      label = `Week ${weekStr}, ${year}`;
      break;
    }
    case "days": {
      const date = parse(period, "yyyy-MM-dd", new Date());
      start = format(startOfDay(date), "yyyy-MM-dd");
      end = format(endOfDay(date), "yyyy-MM-dd");
      label = format(date, "MMMM d, yyyy");
      break;
    }
    default:
      return null;
  }

  return { period, start, end, label };
}

export function useTimelineState({ entityType, autoSelectRecent = false }) {
  const [zoomLevel, setZoomLevelState] = useState("months");
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [distribution, setDistribution] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Track whether we've done the initial load (for autoSelectRecent)
  const hasInitiallyLoaded = useRef(false);

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
        const response = await apiGet(
          `/timeline/${entityType}/distribution?granularity=${zoomLevel}`
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
  }, [entityType, zoomLevel, autoSelectRecent]);

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
