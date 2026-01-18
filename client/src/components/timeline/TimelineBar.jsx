// client/src/components/timeline/TimelineBar.jsx
import { memo, useState } from "react";

const MIN_BAR_HEIGHT = 4; // Minimum visible height in pixels
const MAX_BAR_HEIGHT = 60; // Maximum bar height in pixels

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
      {/* Tooltip */}
      {showTooltip && (
        <div
          className="absolute bottom-full mb-2 px-2 py-1 text-xs font-medium
            bg-bg-primary text-text-primary rounded shadow-lg border border-border-primary
            whitespace-nowrap z-10 pointer-events-none"
        >
          {count} {count === 1 ? "item" : "items"}
        </div>
      )}

      {/* Bar */}
      <div
        className={`
          w-3 rounded-t transition-all duration-150
          ${isFocused ? "ring-2 ring-offset-1" : ""}
        `}
        style={{
          height: `${barHeight}px`,
          backgroundColor: isSelected
            ? "var(--accent-primary)"
            : "var(--accent-secondary)",
          "--tw-ring-color": "var(--accent-primary)",
          "--tw-ring-offset-color": "var(--bg-primary)",
        }}
        data-testid="timeline-bar"
      />

      {/* Selection indicator */}
      {isSelected && (
        <div
          className="absolute -bottom-1 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent"
          style={{ borderTopColor: "var(--accent-primary)" }}
          data-testid="selection-indicator"
        />
      )}
    </div>
  );
}

export default memo(TimelineBar);
