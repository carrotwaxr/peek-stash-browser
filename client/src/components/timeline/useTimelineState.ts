import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  parse,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";
import { apiPost } from "../../api";

interface DistributionItem {
  period: string;
  count: number;
}

interface DateRange {
  period: string;
  start: string;
  end: string;
  label: string;
}

interface DistributionResponse {
  distribution: DistributionItem[];
}

const ZOOM_LEVELS = ["years", "months", "weeks", "days"];

export function parsePeriodToDateRange(
  period: string,
  zoomLevel: string
): DateRange | null {
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

/** The zoom level a period's form names: "2024" years, "2024-W12" weeks, ... */
export function zoomLevelOfPeriod(period: string | null | undefined): string {
  if (!period) return "months";
  if (period.includes("-W")) return "weeks";
  if (/^\d{4}$/.test(period)) return "years";
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) return "days";
  return "months";
}

/** A period's first and last day, at the zoom its form names; null when it names none */
export function periodDateRange(
  period: string | null | undefined
): { start: string; end: string } | null {
  if (!period) return null;
  const range = parsePeriodToDateRange(period, zoomLevelOfPeriod(period));
  return range ? { start: range.start, end: range.end } : null;
}

interface UseTimelineStateOptions {
  entityType: string;
  autoSelectRecent?: boolean;
  initialPeriod?: string | null;
  /**
   * The list's own request (its search and `<entity>_filter`, no page, sort
   * or period): the bars count what the list shows. `null` is a list with no
   * request yet (its presets load): nothing is asked for until it has one.
   */
  request?: Record<string, unknown> | null;
  /**
   * The selected period, held by the owner (the list's URL): the selection
   * is this period, and a choice, a deselection, a zoom change and the
   * auto-selected latest period are reported through `onPeriodChange`.
   * Undefined leaves the selection to the hook.
   */
  period?: string | null;
  onPeriodChange?: (period: string | null) => void;
}

export function useTimelineState({
  entityType,
  autoSelectRecent = false,
  initialPeriod = null,
  request,
  period,
  onPeriodChange,
}: UseTimelineStateOptions) {
  const controlled = period !== undefined;
  // A controlled period that names no date is no selection
  const controlledRange = useMemo(
    () =>
      period ? parsePeriodToDateRange(period, zoomLevelOfPeriod(period)) : null,
    [period]
  );
  const firstPeriod = controlled ? controlledRange?.period : initialPeriod;

  const [zoomState, setZoomLevelState] = useState(() =>
    zoomLevelOfPeriod(firstPeriod)
  );
  const [ownSelection, setSelectedPeriod] = useState(() =>
    // Parse initial period from URL if provided
    !controlled && initialPeriod
      ? parsePeriodToDateRange(initialPeriod, zoomLevelOfPeriod(initialPeriod))
      : null
  );
  // A controlled period shows at its own zoom; without one, the chosen zoom
  const zoomLevel = controlledRange
    ? zoomLevelOfPeriod(controlledRange.period)
    : zoomState;
  const selectedPeriod = controlled ? controlledRange : ownSelection;

  // The owner's period moved (Back, a link): its zoom is the chosen one now
  useEffect(() => {
    if (controlledRange) {
      setZoomLevelState(zoomLevelOfPeriod(controlledRange.period));
    }
  }, [controlledRange]);

  const onPeriodChangeRef = useRef(onPeriodChange);
  onPeriodChangeRef.current = onPeriodChange;
  const [distribution, setDistribution] = useState<DistributionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The request by value, so a request rebuilt equal does not refetch
  const requestKey = JSON.stringify(request ?? null);
  const requestRef = useRef(request);
  requestRef.current = request;

  // Track whether we've done the initial load (for autoSelectRecent)
  const hasInitiallyLoaded = useRef(!!firstPeriod); // Skip auto-select if we have a period

  // Clear selection when zoom level changes
  const setZoomLevel = useCallback(
    (newLevel: string) => {
      if (controlled) {
        if (newLevel === zoomLevel) return;
        setZoomLevelState(newLevel);
        onPeriodChangeRef.current?.(null);
        return;
      }
      setZoomLevelState((prevLevel) => {
        if (prevLevel !== newLevel) {
          setSelectedPeriod(null);
        }
        return newLevel;
      });
    },
    [controlled, zoomLevel]
  );

  // Fetch distribution when entityType, zoomLevel or the list's request changes
  useEffect(() => {
    let cancelled = false;
    const listRequest = requestRef.current;

    async function fetchDistribution() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await apiPost<DistributionResponse>(
          `/timeline/${entityType}/distribution`,
          { ...listRequest, granularity: zoomLevel }
        );

        if (!cancelled) {
          setDistribution(response.distribution || []);

          // Auto-select most recent period only on initial fetch
          if (
            autoSelectRecent &&
            !hasInitiallyLoaded.current &&
            response.distribution?.length > 0
          ) {
            const mostRecent =
              response.distribution[response.distribution.length - 1];
            if (mostRecent && controlled) {
              onPeriodChangeRef.current?.(mostRecent.period);
            } else if (mostRecent) {
              setSelectedPeriod(
                parsePeriodToDateRange(mostRecent.period, zoomLevel)
              );
            }
          }

          hasInitiallyLoaded.current = true;
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to fetch distribution"
          );
          setDistribution([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    // A list with no request yet asks for nothing
    if (listRequest === null) {
      setIsLoading(true);
    } else {
      void fetchDistribution();
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requestKey = JSON.stringify(request) captures every change of the request (read through requestRef)
  }, [entityType, zoomLevel, autoSelectRecent, requestKey]);

  const selectPeriod = useCallback(
    (next: string) => {
      if (controlled) {
        // Choosing the selected period again deselects it
        onPeriodChangeRef.current?.(
          controlledRange?.period === next ? null : next
        );
        return;
      }
      setSelectedPeriod((prev) =>
        prev?.period === next ? null : parsePeriodToDateRange(next, zoomLevel)
      );
    },
    [controlled, controlledRange, zoomLevel]
  );

  const clearSelection = useCallback(() => {
    if (controlled) onPeriodChangeRef.current?.(null);
    else setSelectedPeriod(null);
  }, [controlled]);

  // Calculate max count for bar height scaling
  const maxCount = useMemo(() => {
    if (distribution.length === 0) return 0;
    return Math.max(...distribution.map((d: DistributionItem) => d.count));
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
