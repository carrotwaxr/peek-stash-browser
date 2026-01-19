// client/src/components/timeline/TimelineStrip.jsx
import { memo, useRef, useState, useCallback, useEffect, useMemo } from "react";
import TimelineBar from "./TimelineBar.jsx";
import TimelineEdgeNav from "./TimelineEdgeNav.jsx";
import { format, parse } from "date-fns";

// Extract context (year, month) from period for marker detection
function getContext(period, zoomLevel) {
  if (!period) return { year: null, month: null };
  try {
    switch (zoomLevel) {
      case "years":
        return { year: period, month: null };
      case "months": {
        const [year] = period.split("-");
        return { year, month: null };
      }
      case "weeks": {
        const [year] = period.split("-W");
        return { year, month: null };
      }
      case "days": {
        const [year, month] = period.split("-");
        return { year, month };
      }
      default:
        return { year: null, month: null };
    }
  } catch {
    return { year: null, month: null };
  }
}

// Short labels without redundant context (year shown on markers)
const SHORT_LABELS = {
  years: (period) => period,
  months: (period) => {
    try {
      const date = parse(period, "yyyy-MM", new Date());
      if (isNaN(date.getTime())) return period;
      return format(date, "MMM"); // Just month, no year
    } catch {
      return period;
    }
  },
  weeks: (period) => {
    if (!period || !period.includes("-W")) return period;
    const [, week] = period.split("-W");
    return `W${week}`;
  },
  days: (period) => {
    try {
      const date = parse(period, "yyyy-MM-dd", new Date());
      if (isNaN(date.getTime())) return period;
      return format(date, "d"); // Just day number
    } catch {
      return period;
    }
  },
};

// Bar width per zoom level (wider = fewer visible, less cramped)
const BAR_WIDTHS = {
  years: 48,
  months: 56,
  weeks: 48,
  days: 40,
};

// Full labels for accessibility (aria-label)
const FULL_LABELS = {
  years: (period) => period,
  months: (period) => {
    try {
      const date = parse(period, "yyyy-MM", new Date());
      if (isNaN(date.getTime())) return period;
      return format(date, "MMM yyyy");
    } catch {
      return period;
    }
  },
  weeks: (period) => {
    if (!period || !period.includes("-W")) return period;
    const [year, week] = period.split("-W");
    return `Week ${week}, ${year}`;
  },
  days: (period) => {
    try {
      const date = parse(period, "yyyy-MM-dd", new Date());
      if (isNaN(date.getTime())) return period;
      return format(date, "MMM d, yyyy");
    } catch {
      return period;
    }
  },
};

function TimelineStrip({
  distribution,
  maxCount,
  zoomLevel,
  selectedPeriod,
  onSelectPeriod,
  onKeyboardNavigate,
  onVisibleRangeChange,
  className = "",
}) {
  const containerRef = useRef(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [scrollState, setScrollState] = useState({ atStart: true, atEnd: true });
  const [edgeLabels, setEdgeLabels] = useState({ left: "", right: "" });

  const getShortLabel = useCallback(
    (period) => {
      const labelFn = SHORT_LABELS[zoomLevel] || SHORT_LABELS.months;
      return labelFn(period);
    },
    [zoomLevel]
  );

  const getFullLabel = useCallback(
    (period) => {
      const labelFn = FULL_LABELS[zoomLevel] || FULL_LABELS.months;
      return labelFn(period);
    },
    [zoomLevel]
  );

  // Get bar width for current zoom level
  const barWidth = BAR_WIDTHS[zoomLevel] || BAR_WIDTHS.months;

  // Compute context markers (where year/month changes)
  const contextMarkers = useMemo(() => {
    if (zoomLevel === "years") return []; // Years don't need markers

    const markers = [];
    let lastYear = null;
    let lastMonth = null;

    distribution.forEach((item, index) => {
      const ctx = getContext(item.period, zoomLevel);

      if (zoomLevel === "months" || zoomLevel === "weeks") {
        // Show year marker when year changes
        if (ctx.year && ctx.year !== lastYear) {
          markers.push({ index, type: "year", label: ctx.year });
          lastYear = ctx.year;
        }
      } else if (zoomLevel === "days") {
        // Show month marker when month changes
        if (ctx.year && ctx.month) {
          const monthKey = `${ctx.year}-${ctx.month}`;
          const prevMonthKey = lastYear && lastMonth ? `${lastYear}-${lastMonth}` : null;
          if (monthKey !== prevMonthKey) {
            try {
              const date = parse(`${ctx.year}-${ctx.month}-01`, "yyyy-MM-dd", new Date());
              if (!isNaN(date.getTime())) {
                markers.push({ index, type: "month", label: format(date, "MMM yyyy") });
              }
            } catch {
              // Skip invalid dates
            }
            lastYear = ctx.year;
            lastMonth = ctx.month;
          }
        }
      }
    });

    return markers;
  }, [distribution, zoomLevel]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e) => {
      if (distribution.length === 0) return;

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          setFocusedIndex((prev) =>
            prev <= 0 ? distribution.length - 1 : prev - 1
          );
          break;
        case "ArrowRight":
          e.preventDefault();
          setFocusedIndex((prev) =>
            prev >= distribution.length - 1 ? 0 : prev + 1
          );
          break;
        case "Home":
          e.preventDefault();
          setFocusedIndex(0);
          break;
        case "End":
          e.preventDefault();
          setFocusedIndex(distribution.length - 1);
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < distribution.length) {
            onSelectPeriod(distribution[focusedIndex].period);
          }
          break;
        default:
          if (onKeyboardNavigate) {
            onKeyboardNavigate(e);
          }
      }
    },
    [distribution, focusedIndex, onSelectPeriod, onKeyboardNavigate]
  );

  // Check if an index has a context marker
  const getMarkerAt = useCallback(
    (index) => contextMarkers.find((m) => m.index === index),
    [contextMarkers]
  );

  // Scroll focused bar into view
  useEffect(() => {
    if (focusedIndex >= 0 && containerRef.current) {
      const bars = containerRef.current.querySelectorAll('[role="option"]');
      if (bars[focusedIndex]) {
        bars[focusedIndex].scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        });
      }
    }
  }, [focusedIndex]);

  // Track visible range, edge state, and report to parent
  useEffect(() => {
    if (distribution.length === 0) return;

    const container = containerRef.current;
    if (!container) return;

    const calculateVisibleRange = () => {
      const scrollLeft = container.scrollLeft;
      const scrollWidth = container.scrollWidth;
      const viewportWidth = container.clientWidth;
      const padding = 16; // px-4 = 16px padding

      // Calculate edge state
      const atStart = scrollLeft <= 1;
      const atEnd = scrollLeft + viewportWidth >= scrollWidth - 1;
      setScrollState({ atStart, atEnd });

      // Calculate which bars are visible
      const firstVisibleIndex = Math.max(
        0,
        Math.floor((scrollLeft - padding) / (barWidth + 4))
      );
      const lastVisibleIndex = Math.min(
        distribution.length - 1,
        Math.floor((scrollLeft + viewportWidth - padding) / (barWidth + 4))
      );

      // Calculate edge labels (what's beyond the viewport)
      if (firstVisibleIndex > 0) {
        const leftLabel = getFullLabel(distribution[0].period);
        setEdgeLabels((prev) => ({ ...prev, left: leftLabel }));
      }
      if (lastVisibleIndex < distribution.length - 1) {
        const rightLabel = getFullLabel(distribution[distribution.length - 1].period);
        setEdgeLabels((prev) => ({ ...prev, right: rightLabel }));
      }

      const firstPeriod = distribution[firstVisibleIndex]?.period;
      const lastPeriod = distribution[lastVisibleIndex]?.period;

      if (firstPeriod && lastPeriod && onVisibleRangeChange) {
        onVisibleRangeChange({
          firstPeriod,
          lastPeriod,
          firstLabel: getFullLabel(firstPeriod),
          lastLabel: getFullLabel(lastPeriod),
        });
      }
    };

    // Calculate on mount and scroll
    calculateVisibleRange();
    container.addEventListener("scroll", calculateVisibleRange);

    // Also recalculate on resize
    const resizeObserver = new ResizeObserver(calculateVisibleRange);
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener("scroll", calculateVisibleRange);
      resizeObserver.disconnect();
    };
  }, [distribution, barWidth, onVisibleRangeChange, getFullLabel]);

  // Scroll handlers for edge navigation
  const scrollLeft = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollBy({ left: -container.clientWidth * 0.8, behavior: "smooth" });
  }, []);

  const scrollRight = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollBy({ left: container.clientWidth * 0.8, behavior: "smooth" });
  }, []);

  // Convert vertical mousewheel to horizontal scroll
  const handleWheel = useCallback((e) => {
    const container = containerRef.current;
    if (!container) return;

    // Only intercept if there's vertical scroll (deltaY) and container can scroll horizontally
    if (e.deltaY !== 0 && container.scrollWidth > container.clientWidth) {
      e.preventDefault();
      container.scrollBy({ left: e.deltaY, behavior: "auto" });
    }
  }, []);

  if (distribution.length === 0) {
    return (
      <div
        className={`flex items-center justify-center h-20 ${className}`}
        style={{ color: "var(--text-secondary)" }}
      >
        No dated content available
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {/* Edge navigation overlays */}
      <TimelineEdgeNav
        side="left"
        label={edgeLabels.left}
        visible={!scrollState.atStart}
        onClick={scrollLeft}
      />
      <TimelineEdgeNav
        side="right"
        label={edgeLabels.right}
        visible={!scrollState.atEnd}
        onClick={scrollRight}
      />

      {/* Scrollable timeline container */}
      <div
        ref={containerRef}
        className="relative flex items-end gap-1 overflow-x-auto pb-10 pt-2 px-4 min-h-[120px]"
        role="listbox"
        aria-label="Timeline"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onWheel={handleWheel}
        onFocus={() => {
          if (focusedIndex === -1 && distribution.length > 0) {
            // Focus on selected period or last (most recent)
            const selectedIndex = distribution.findIndex(
              (d) => d.period === selectedPeriod?.period
            );
            setFocusedIndex(
              selectedIndex >= 0 ? selectedIndex : distribution.length - 1
            );
          }
        }}
      >
        {/* Baseline */}
        <div
          className="absolute bottom-10 left-4 right-4 h-px"
          style={{ backgroundColor: "var(--border-primary)" }}
        />

      {distribution.map((item, index) => {
        const marker = getMarkerAt(index);
        const isSelected = selectedPeriod?.period === item.period;

        return (
          <div
            key={item.period}
            className="relative flex flex-col items-center"
            style={{ minWidth: `${barWidth}px` }}
          >
            {/* Context marker (year/month indicator) */}
            {marker && (
              <div
                className="absolute -bottom-9 left-0 flex flex-col items-start"
                data-testid="context-marker"
              >
                {/* Vertical tick mark */}
                <div
                  className="absolute -top-4 left-1/2 w-px h-3"
                  style={{ backgroundColor: "var(--border-secondary)" }}
                />
                {/* Context label */}
                <span
                  className="text-[10px] font-medium whitespace-nowrap"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {marker.label}
                </span>
              </div>
            )}

            <TimelineBar
              period={item.period}
              count={item.count}
              maxCount={maxCount}
              isSelected={isSelected}
              isFocused={focusedIndex === index}
              onClick={onSelectPeriod}
              label={getFullLabel(item.period)}
              tabIndex={-1}
            />

            {/* Period label - slanted 45° */}
            <div
              className="absolute -bottom-6 left-1/2 origin-top-left"
              style={{
                transform: "rotate(45deg) translateX(-50%)",
              }}
            >
              <span
                className="text-xs whitespace-nowrap"
                style={{
                  color: isSelected
                    ? "var(--accent-primary)"
                    : "var(--text-secondary)",
                  fontWeight: isSelected ? 500 : 400,
                }}
              >
                {getShortLabel(item.period)}
              </span>
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}

export default memo(TimelineStrip);
