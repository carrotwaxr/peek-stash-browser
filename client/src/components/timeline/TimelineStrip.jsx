// client/src/components/timeline/TimelineStrip.jsx
import { memo, useRef, useState, useCallback, useEffect } from "react";
import TimelineBar from "./TimelineBar.jsx";
import { format, parse } from "date-fns";

const PERIOD_LABELS = {
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
    const [, week] = period.split("-W");
    return `W${week}`;
  },
  days: (period) => {
    try {
      const date = parse(period, "yyyy-MM-dd", new Date());
      if (isNaN(date.getTime())) return period;
      return format(date, "MMM d");
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
  className = "",
}) {
  const containerRef = useRef(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const getLabel = useCallback(
    (period) => {
      const labelFn = PERIOD_LABELS[zoomLevel] || PERIOD_LABELS.months;
      return labelFn(period);
    },
    [zoomLevel]
  );

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

  if (distribution.length === 0) {
    return (
      <div
        className={`flex items-center justify-center h-20 text-text-secondary ${className}`}
      >
        No dated content available
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`
        relative flex items-end gap-1 overflow-x-auto pb-6 pt-2 px-4
        scrollbar-thin scrollbar-thumb-border-primary scrollbar-track-transparent
        ${className}
      `}
      role="listbox"
      aria-label="Timeline"
      tabIndex={0}
      onKeyDown={handleKeyDown}
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
      <div className="absolute bottom-6 left-4 right-4 h-px bg-border-primary" />

      {distribution.map((item, index) => (
        <div
          key={item.period}
          className="flex flex-col items-center min-w-[40px]"
        >
          <TimelineBar
            period={item.period}
            count={item.count}
            maxCount={maxCount}
            isSelected={selectedPeriod?.period === item.period}
            isFocused={focusedIndex === index}
            onClick={onSelectPeriod}
            label={getLabel(item.period)}
            tabIndex={-1}
          />
          {/* Period label */}
          <span
            className={`
              mt-1 text-xs whitespace-nowrap
              ${selectedPeriod?.period === item.period ? "text-accent-primary font-medium" : "text-text-secondary"}
            `}
          >
            {getLabel(item.period)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default memo(TimelineStrip);
