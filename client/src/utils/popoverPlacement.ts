/**
 * Where a popover's left edge goes, in screen coordinates. It lines up with
 * the anchor's start edge (`bottom-start`) or end edge (`bottom-end`); when
 * that edge would run past the screen it flips to the anchor's other edge,
 * and it is then held `gutter` px inside the screen's sides (its left edge
 * wins when it is wider than the screen).
 */
export interface PopoverLeftInput {
  /** The anchor's left edge on screen */
  anchorLeft: number;
  anchorWidth: number;
  /** The popover's width */
  width: number;
  viewportWidth: number;
  /** How far in from the screen's sides it stays */
  gutter: number;
  placement: "bottom-start" | "bottom-end";
}

export function popoverLeft({
  anchorLeft,
  anchorWidth,
  width,
  viewportWidth,
  gutter,
  placement,
}: PopoverLeftInput): number {
  const atStart = anchorLeft;
  const atEnd = anchorLeft + anchorWidth - width;
  const fits = (left: number) =>
    left >= gutter && left + width <= viewportWidth - gutter;
  const wanted = placement === "bottom-end" ? atEnd : atStart;
  const other = placement === "bottom-end" ? atStart : atEnd;
  const left = !fits(wanted) && fits(other) ? other : wanted;
  return Math.max(gutter, Math.min(left, viewportWidth - gutter - width));
}
