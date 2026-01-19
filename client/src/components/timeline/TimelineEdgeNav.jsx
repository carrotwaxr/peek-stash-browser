// client/src/components/timeline/TimelineEdgeNav.jsx
import { memo } from "react";

/**
 * Edge navigation overlays for the timeline strip.
 * Shows faded overlays with arrow buttons when content exists beyond the viewport.
 */
function TimelineEdgeNav({
  side, // "left" or "right"
  label, // e.g., "← 1965-1969" or "2002+ →"
  visible,
  onClick,
}) {
  if (!visible) return null;

  const isLeft = side === "left";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        absolute top-0 bottom-0 z-10 flex items-center
        ${isLeft ? "left-0 pl-2 pr-6" : "right-0 pr-2 pl-6"}
        transition-opacity hover:opacity-100
      `}
      style={{
        background: isLeft
          ? "linear-gradient(to right, var(--bg-primary) 0%, var(--bg-primary) 30%, transparent 100%)"
          : "linear-gradient(to left, var(--bg-primary) 0%, var(--bg-primary) 30%, transparent 100%)",
        opacity: 0.9,
      }}
      aria-label={`Scroll ${isLeft ? "left" : "right"} to ${label}`}
    >
      <div
        className={`
          flex items-center gap-1 px-2 py-1 rounded
          text-sm font-medium whitespace-nowrap
        `}
        style={{
          backgroundColor: "var(--bg-secondary)",
          color: "var(--text-primary)",
          border: "1px solid var(--border-primary)",
        }}
      >
        {isLeft && (
          <span style={{ color: "var(--accent-primary)" }}>←</span>
        )}
        <span>{label}</span>
        {!isLeft && (
          <span style={{ color: "var(--accent-primary)" }}>→</span>
        )}
      </div>
    </button>
  );
}

export default memo(TimelineEdgeNav);
