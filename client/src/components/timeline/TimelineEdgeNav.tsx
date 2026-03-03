// client/src/components/timeline/TimelineEdgeNav.tsx
import { memo } from "react";

interface Props {
  side: "left" | "right";
  visible: boolean;
}

/**
 * Edge fade overlays for the timeline strip.
 * Simple gradient fade to indicate scrollable content (no buttons or labels).
 */
function TimelineEdgeNav({
  side,
  visible,
}: Props) {
  if (!visible) return null;

  const isLeft = side === "left";

  return (
    <div
      className={`pointer-events-none absolute top-0 bottom-0 w-8 z-10 ${
        isLeft ? "left-0" : "right-0"
      }`}
      style={{
        background: isLeft
          ? "linear-gradient(to right, var(--bg-primary), transparent)"
          : "linear-gradient(to left, var(--bg-primary), transparent)",
        opacity: 0.8,
      }}
      aria-hidden="true"
    />
  );
}

export default memo(TimelineEdgeNav);
