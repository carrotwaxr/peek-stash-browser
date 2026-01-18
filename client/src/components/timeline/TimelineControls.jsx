// client/src/components/timeline/TimelineControls.jsx
import { memo } from "react";

const ZOOM_LABELS = {
  years: "Years",
  months: "Months",
  weeks: "Weeks",
  days: "Days",
};

function TimelineControls({
  zoomLevel,
  onZoomLevelChange,
  zoomLevels = ["years", "months", "weeks", "days"],
  className = "",
}) {
  return (
    <div
      className={`inline-flex rounded-md bg-bg-secondary ${className}`}
      role="group"
      aria-label="Timeline zoom level"
    >
      {zoomLevels.map((level) => (
        <button
          key={level}
          type="button"
          onClick={() => onZoomLevelChange(level)}
          className={`
            px-3 py-1.5 text-sm font-medium transition-colors
            first:rounded-l-md last:rounded-r-md
            focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-inset
            ${
              zoomLevel === level
                ? "bg-accent-primary text-white"
                : "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
            }
          `}
          aria-pressed={zoomLevel === level}
        >
          {ZOOM_LABELS[level] || level}
        </button>
      ))}
    </div>
  );
}

export default memo(TimelineControls);
