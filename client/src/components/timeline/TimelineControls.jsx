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
      className={`inline-flex rounded-md ${className}`}
      style={{ backgroundColor: "var(--bg-secondary)" }}
      role="group"
      aria-label="Timeline zoom level"
    >
      {zoomLevels.map((level) => (
        <button
          key={level}
          type="button"
          onClick={() => onZoomLevelChange(level)}
          className="px-3 py-1.5 text-sm font-medium transition-colors first:rounded-l-md last:rounded-r-md focus:outline-none focus:ring-2 focus:ring-inset"
          style={{
            backgroundColor:
              zoomLevel === level ? "var(--accent-primary)" : "transparent",
            color:
              zoomLevel === level ? "white" : "var(--text-secondary)",
            "--tw-ring-color": "var(--accent-primary)",
          }}
          aria-pressed={zoomLevel === level}
        >
          {ZOOM_LABELS[level] || level}
        </button>
      ))}
    </div>
  );
}

export default memo(TimelineControls);
