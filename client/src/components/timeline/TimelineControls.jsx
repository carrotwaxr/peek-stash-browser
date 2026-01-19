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
  variant = "buttons", // "buttons" (desktop) or "dropdown" (mobile)
  className = "",
}) {
  // Dropdown variant for mobile - saves horizontal space
  if (variant === "dropdown") {
    return (
      <select
        value={zoomLevel}
        onChange={(e) => onZoomLevelChange(e.target.value)}
        className={`px-2 py-1.5 text-sm font-medium rounded-md focus:outline-none focus:ring-2 ${className}`}
        style={{
          backgroundColor: "var(--bg-secondary)",
          color: "var(--text-primary)",
          border: "1px solid var(--border-color)",
          "--tw-ring-color": "var(--accent-primary)",
        }}
        aria-label="Timeline zoom level"
      >
        {zoomLevels.map((level) => (
          <option key={level} value={level}>
            {ZOOM_LABELS[level] || level}
          </option>
        ))}
      </select>
    );
  }

  // Button group variant for desktop
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
