// client/src/components/timeline/TimelineBar.jsx
// Flagpole style: circle on top, bar extends downward
import { memo, useState } from "react";

const CIRCLE_SIZE = 12; // Circle diameter in pixels
const BAR_WIDTH = 6; // Bar width (slightly smaller than circle)
const MIN_BAR_HEIGHT = 4; // Minimum visible height in pixels
const MAX_BAR_HEIGHT = 48; // Maximum bar height in pixels

function TimelineBar({
  period,
  count,
  maxCount,
  isSelected,
  isFocused,
  onClick,
  label,
  onKeyDown,
  tabIndex = -1,
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  // Calculate bar height as percentage of max, with minimum visibility
  const heightPercent = maxCount > 0 ? (count / maxCount) * 100 : 0;
  const barHeight = Math.max(
    MIN_BAR_HEIGHT,
    (heightPercent / 100) * MAX_BAR_HEIGHT
  );

  return (
    <div
      className="relative flex flex-col items-center cursor-pointer group"
      onClick={() => onClick(period)}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      role="option"
      aria-selected={isSelected}
      aria-label={`${label}: ${count} items`}
      tabIndex={tabIndex}
    >
      {/* Tooltip - positioned above the circle */}
      {showTooltip && (
        <div
          className="absolute bottom-full mb-1 px-2 py-1 text-xs font-medium
            rounded shadow-lg whitespace-nowrap z-20 pointer-events-none"
          style={{
            backgroundColor: "var(--bg-primary)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-color)",
          }}
        >
          {count} {count === 1 ? "item" : "items"}
        </div>
      )}

      {/* Circle (on the timeline line) */}
      <div
        className={`
          rounded-full transition-all duration-150 z-10
          ${isFocused ? "ring-2 ring-offset-1" : ""}
        `}
        style={{
          width: `${CIRCLE_SIZE}px`,
          height: `${CIRCLE_SIZE}px`,
          backgroundColor: isSelected ? "var(--status-success)" : "var(--bg-primary)",
          border: `1.5px solid ${isSelected ? "var(--status-success)" : "var(--accent-primary)"}`,
          "--tw-ring-color": "var(--accent-primary)",
          "--tw-ring-offset-color": "var(--bg-primary)",
        }}
        data-testid="timeline-circle"
      />

      {/* Bar extending downward (flagpole style) */}
      <div
        className="rounded-b transition-all duration-150"
        style={{
          width: `${BAR_WIDTH}px`,
          height: `${barHeight}px`,
          marginTop: `-1px`, // Overlap with circle slightly
          backgroundColor: isSelected ? "var(--status-success)" : "var(--accent-primary)",
        }}
        data-testid="timeline-bar"
      />
    </div>
  );
}

export default memo(TimelineBar);
