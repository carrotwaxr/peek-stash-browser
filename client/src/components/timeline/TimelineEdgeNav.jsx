// client/src/components/timeline/TimelineEdgeNav.jsx
import { memo } from "react";

/**
 * Edge navigation overlays for the timeline strip.
 * Shows narrow overlays with large arrow buttons and 2-line date labels.
 */
function TimelineEdgeNav({
  side, // "left" or "right"
  label, // e.g., "Jan 2024" - will be split into month and year
  visible,
  onClick,
}) {
  if (!visible) return null;

  const isLeft = side === "left";

  // Parse label into month and year if possible (e.g., "Jan 2024" -> ["Jan", "2024"])
  const parts = label?.split(" ") || [];
  const hasYear = parts.length === 2;
  const month = hasYear ? parts[0] : label;
  const year = hasYear ? parts[1] : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        absolute top-0 bottom-0 z-10 flex items-center
        ${isLeft ? "left-0 pl-1 pr-3" : "right-0 pr-1 pl-3"}
        transition-opacity hover:opacity-100
      `}
      style={{
        background: isLeft
          ? "linear-gradient(to right, var(--bg-primary) 0%, var(--bg-primary) 50%, transparent 100%)"
          : "linear-gradient(to left, var(--bg-primary) 0%, var(--bg-primary) 50%, transparent 100%)",
        opacity: 0.95,
      }}
      aria-label={`Scroll ${isLeft ? "left" : "right"} to ${label}`}
    >
      <div className="flex flex-col items-center gap-0.5">
        {/* Large arrow button */}
        <div
          className="flex items-center justify-center w-8 h-8 rounded-full transition-colors hover:bg-opacity-80"
          style={{
            backgroundColor: "var(--bg-secondary)",
            border: "1px solid var(--border-primary)",
          }}
        >
          <span
            className="text-lg font-bold"
            style={{ color: "var(--accent-primary)" }}
          >
            {isLeft ? "←" : "→"}
          </span>
        </div>

        {/* 2-line label: month on top, year below */}
        <div className="flex flex-col items-center leading-tight">
          <span
            className="text-xs font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            {month}
          </span>
          {year && (
            <span
              className="text-[10px]"
              style={{ color: "var(--text-tertiary)" }}
            >
              {year}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export default memo(TimelineEdgeNav);
