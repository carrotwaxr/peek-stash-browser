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

// Point spacing per zoom level
const POINT_SPACING = {
  years: 48,
  months: 44,
  weeks: 40,
  days: 36,
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
  const isMouseDownRef = useRef(false); // Track if focus came from mouse click

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

  // Get point spacing for current zoom level
  const pointSpacing = POINT_SPACING[zoomLevel] || POINT_SPACING.months;

  // Determine which labels to show (every other, unless selected or years zoom)
  const shouldShowLabel = useCallback(
    (index) => {
      // Years zoom: show all labels
      if (zoomLevel === "years") return true;

      // Find selected index
      const selectedIndex = selectedPeriod
        ? distribution.findIndex((d) => d.period === selectedPeriod.period)
        : -1;

      // Always show selected
      if (index === selectedIndex) return true;

      // Determine parity based on selection
      // If selected is at odd index, show odd indices; otherwise show even
      const showOdd = selectedIndex >= 0 && selectedIndex % 2 === 1;
      const indexIsOdd = index % 2 === 1;

      return showOdd ? indexIsOdd : !indexIsOdd;
    },
    [zoomLevel, selectedPeriod, distribution]
  );

  // Compute context markers (where year/month changes) with range info for sticky
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
          markers.push({ index, type: "year", label: ctx.year, context: ctx.year });
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
                markers.push({ index, type: "month", label: format(date, "MMM yyyy"), context: monthKey });
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

    // Calculate end indices for each marker (where the next context starts)
    for (let i = 0; i < markers.length; i++) {
      markers[i].endIndex = i < markers.length - 1 ? markers[i + 1].index - 1 : distribution.length - 1;
    }

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

  // Scroll to the right (most recent) when distribution first loads
  const hasScrolledRef = useRef(false);
  useEffect(() => {
    const container = containerRef.current;
    if (!container || distribution.length === 0 || hasScrolledRef.current) return;

    // Scroll to the end (most recent) without animation on initial load
    container.scrollLeft = container.scrollWidth;
    hasScrolledRef.current = true;
  }, [distribution.length]);

  // Track visible range, edge state, sticky context, and report to parent
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

      // Calculate which points are visible
      const firstVisibleIndex = Math.max(
        0,
        Math.floor((scrollLeft - padding) / pointSpacing)
      );
      const lastVisibleIndex = Math.min(
        distribution.length - 1,
        Math.floor((scrollLeft + viewportWidth - padding) / pointSpacing)
      );

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
  }, [distribution, pointSpacing, onVisibleRangeChange, getFullLabel]);

  // Convert vertical mousewheel to horizontal scroll (native listener for passive: false)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e) => {
      // Only intercept if there's vertical scroll (deltaY) and container can scroll horizontally
      if (e.deltaY !== 0 && container.scrollWidth > container.clientWidth) {
        e.preventDefault();
        e.stopPropagation();
        container.scrollBy({ left: e.deltaY, behavior: "auto" });
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [distribution.length]);

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

  // Calculate total width for the timeline line
  const totalWidth = distribution.length * pointSpacing;

  return (
    <div className={`relative ${className}`}>
      {/* Edge fade overlays to indicate scrollable content */}
      <TimelineEdgeNav side="left" visible={!scrollState.atStart} />
      <TimelineEdgeNav side="right" visible={!scrollState.atEnd} />


      {/* Scrollable timeline container */}
      <div
        ref={containerRef}
        className="relative overflow-x-auto pt-8 pb-4 px-4"
        role="listbox"
        aria-label="Timeline"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onMouseDown={() => {
          isMouseDownRef.current = true;
        }}
        onFocus={() => {
          // Only set focus for keyboard navigation (tab), not mouse clicks
          if (isMouseDownRef.current) {
            isMouseDownRef.current = false;
            return;
          }
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
        onBlur={() => {
          // Clear focus ring when container loses focus (mouse users don't need it)
          setFocusedIndex(-1);
        }}
      >
        {/* Inner container with fixed width for proper scrolling */}
        <div
          className="relative"
          style={{ width: `${totalWidth}px`, minHeight: "100px" }}
        >
          {/* Context markers row (above labels) */}
          <div className="absolute top-0 left-0 right-0 h-5">
            {contextMarkers.map((marker) => (
              <div
                key={`${marker.type}-${marker.index}`}
                className="absolute text-xs font-medium whitespace-nowrap"
                style={{
                  left: `${marker.index * pointSpacing + pointSpacing / 2}px`,
                  color: "var(--text-muted)",
                }}
                data-testid="context-marker"
              >
                {marker.label}
              </div>
            ))}
          </div>

          {/* Period labels row (above the line) */}
          <div className="absolute left-0 right-0 h-4" style={{ top: "22px" }}>
            {distribution.map((item, index) => {
              const isSelected = selectedPeriod?.period === item.period;
              const showLabel = shouldShowLabel(index);

              return (
                <div
                  key={`label-${item.period}`}
                  className="absolute text-xs whitespace-nowrap"
                  style={{
                    left: `${index * pointSpacing + pointSpacing / 2}px`,
                    transform: "translateX(-50%)",
                    color: "var(--text-primary)",
                    fontWeight: isSelected ? 600 : 400,
                    opacity: showLabel ? 1 : 0,
                    transition: "opacity 150ms ease-in-out",
                  }}
                >
                  {getShortLabel(item.period)}
                </div>
              );
            })}
          </div>

          {/* Timeline line (continuous, from first to last point) */}
          <div
            className="absolute"
            style={{
              top: "46px",
              left: `${pointSpacing / 2}px`,
              width: `${(distribution.length - 1) * pointSpacing}px`,
              height: "2px",
              backgroundColor: "var(--bg-tertiary)",
            }}
            data-testid="timeline-line"
          />

          {/* Timeline points and bars */}
          <div className="absolute top-10 left-0 right-0">
            {distribution.map((item, index) => {
              const isSelected = selectedPeriod?.period === item.period;

              return (
                <div
                  key={item.period}
                  className="absolute flex flex-col items-center"
                  style={{
                    left: `${index * pointSpacing + pointSpacing / 2}px`,
                    transform: "translateX(-50%)",
                  }}
                >
                  <TimelineBar
                    period={item.period}
                    count={item.count}
                    maxCount={maxCount}
                    isSelected={isSelected}
                    isFocused={focusedIndex === index}
                    onClick={(period) => {
                      setFocusedIndex(index);
                      onSelectPeriod(period);
                    }}
                    label={getFullLabel(item.period)}
                    tabIndex={-1}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(TimelineStrip);
