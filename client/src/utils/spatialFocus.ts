/**
 * TV-mode focus by position (item 50): an arrow moves DOM focus to the item
 * nearest in that direction, measured from the rendered layout, so it follows
 * whatever columns the CSS grid has at this width, on every page, with no
 * per-page wiring. Focus is the browser's own, so no card re-renders when it
 * moves.
 */

export type Direction = "up" | "down" | "left" | "right";

export interface Candidate<T> {
  el: T;
  rect: { left: number; top: number; right: number; bottom: number };
}

type Rect = Candidate<unknown>["rect"];

/** How far an edge may overlap the start and still count as beyond it */
const EDGE_SLOP = 1;

/** Whether `to` lies wholly past `from` in `direction` */
function isBeyond(from: Rect, to: Rect, direction: Direction): boolean {
  switch (direction) {
    case "up":
      return to.bottom <= from.top + EDGE_SLOP;
    case "down":
      return to.top >= from.bottom - EDGE_SLOP;
    case "left":
      return to.right <= from.left + EDGE_SLOP;
    case "right":
      return to.left >= from.right - EDGE_SLOP;
  }
}

/** The gap between the edges along the direction */
function gap(from: Rect, to: Rect, direction: Direction) {
  const primary =
    direction === "up"
      ? from.top - to.bottom
      : direction === "down"
        ? to.top - from.bottom
        : direction === "left"
          ? from.left - to.right
          : to.left - from.right;
  return Math.max(0, primary);
}

/**
 * How far the narrower box sticks out of the wider one across the direction:
 * the centres' offset for boxes of one size (cards), 0 for a box wholly
 * within the other's span. From a full-width header every field of the row
 * below is level with it, so the first of them wins, not the one under the
 * header's centre.
 */
function crossOffset(from: Rect, to: Rect, direction: Direction) {
  const vertical = direction === "up" || direction === "down";
  const [fromStart, fromEnd, toStart, toEnd] = vertical
    ? [from.left, from.right, to.left, to.right]
    : [from.top, from.bottom, to.top, to.bottom];
  const centres = Math.abs((toStart + toEnd) / 2 - (fromStart + fromEnd) / 2);
  const slack = Math.abs(toEnd - toStart - (fromEnd - fromStart)) / 2;
  return Math.max(0, centres - slack);
}

/** The gap along the direction plus twice the offset across it */
function distance(from: Rect, to: Rect, direction: Direction) {
  return gap(from, to, direction) + 2 * crossOffset(from, to, direction);
}

/**
 * Up and Down go row by row: only the candidates in the nearest row count,
 * the one whose edge is nearest and every one that overlaps it vertically.
 * Otherwise a wide screen's controls and pager, hundreds of pixels across
 * from the first card, lose to a link several rows up that is level with it.
 */
function nearestRow<T>(
  from: Rect,
  beyond: ReadonlyArray<Candidate<T>>,
  direction: "up" | "down"
): ReadonlyArray<Candidate<T>> {
  let nearest: Rect | null = null;
  let nearestGap = Infinity;
  for (const { rect } of beyond) {
    const g = gap(from, rect, direction);
    if (g < nearestGap) {
      nearest = rect;
      nearestGap = g;
    }
  }
  if (!nearest) return beyond;
  const row = nearest;
  return beyond.filter(
    ({ rect }) => rect.bottom > row.top && rect.top < row.bottom
  );
}

/**
 * The candidate beyond `from` in `direction` with the least primary gap plus
 * twice the cross-axis offset (`crossOffset`), among the nearest row for Up
 * and Down; on a tie the first in document order. Null when none is beyond
 * it.
 */
export function pickNext<T>(
  from: Rect,
  candidates: ReadonlyArray<Candidate<T>>,
  direction: Direction
): T | null {
  const beyond = candidates.filter(({ rect }) =>
    isBeyond(from, rect, direction)
  );
  const pool =
    direction === "up" || direction === "down"
      ? nearestRow(from, beyond, direction)
      : beyond;
  let best: T | null = null;
  let bestScore = Infinity;
  for (const { el, rect } of pool) {
    const score = distance(from, rect, direction);
    if (score < bestScore) {
      best = el;
      bestScore = score;
    }
  }
  return best;
}

const TV_ITEM = "[data-tv-item]";

// Elements the browser puts in the Tab order
const NATURAL_FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable]:not([contenteditable="false"])',
].join(", ");

// An open menu or listbox: its items take the arrows
const OPEN_LIST = '[role="menu"], [role="menubar"], [role="listbox"]';

const hasSize = (r: Rect) => r.right - r.left > 0 && r.bottom - r.top > 0;

/**
 * What TV focus can land on inside `root`: every `[data-tv-item]` (a card)
 * and every naturally focusable element not inside one, in document order.
 * Skipped: elements with no box (not rendered), under `inert` or
 * `aria-hidden`, and the items of an open menu or listbox (they move among
 * themselves). Selects and sliders are candidates: in TV mode they leave the
 * arrows that move focus to TV focus (`targetOwnsKey`).
 */
export function tvCandidates(root: Element): HTMLElement[] {
  const found: HTMLElement[] = [];
  for (const el of root.querySelectorAll<HTMLElement>(
    `${TV_ITEM}, ${NATURAL_FOCUSABLE}`
  )) {
    if (el.parentElement?.closest(TV_ITEM)) continue;
    if (el.closest('[inert], [aria-hidden="true"]')) continue;
    if (el.closest(OPEN_LIST)) continue;
    if (!hasSize(el.getBoundingClientRect())) continue;
    found.push(el);
  }
  return found;
}

// A grid of form fields: each child is a cell holding one field's controls
const CELLS = "[data-tv-cells]";

/** The child of `grid` that holds `el` */
function cellOf(grid: Element, el: Element): Element | null {
  let node: Element | null = el;
  while (node && node.parentElement !== grid) node = node.parentElement;
  return node;
}

/**
 * Picks inside a grid of cells (`data-tv-cells`): the controls of `from`'s own
 * cell first, then the nearest cell beyond, measured by the cells' boxes, and
 * in it the control nearest `from`. A cell stretches to its row's height, so
 * a picker stacked under its condition select stays in its row, and Down from
 * a text field goes to the field under it, not the picker lower in the next
 * column. Null when no cell lies that way.
 */
function pickInCells(
  grid: Element,
  from: HTMLElement,
  fromRect: Rect,
  measured: ReadonlyArray<Candidate<HTMLElement>>,
  direction: Direction
): HTMLElement | null {
  const fromCell = cellOf(grid, from);
  if (!fromCell) return null;
  const byCell = new Map<Element, Candidate<HTMLElement>[]>();
  for (const candidate of measured) {
    const cell = grid.contains(candidate.el) && cellOf(grid, candidate.el);
    if (!cell) continue;
    byCell.set(cell, [...(byCell.get(cell) ?? []), candidate]);
  }

  const inCell = pickNext(fromRect, byCell.get(fromCell) ?? [], direction);
  if (inCell) return inCell;

  const cells = [...byCell.keys()]
    .filter((cell) => cell !== fromCell)
    .map((cell) => ({ el: cell, rect: cell.getBoundingClientRect() }));
  const cell = pickNext(fromCell.getBoundingClientRect(), cells, direction);
  if (!cell) return null;
  const controls = byCell.get(cell) ?? [];
  return pickNext(fromRect, controls, direction) ?? controls[0]?.el ?? null;
}

/** The layout region an element belongs to: the sidebar or the page */
const regionOf = (el: Element) => el.closest("main, aside");

/** The first item in view, else the first candidate at all */
function firstInView(candidates: HTMLElement[]): HTMLElement | null {
  const inView = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight;
  };
  return (
    candidates.find((el) => el.matches(TV_ITEM) && inView(el)) ??
    candidates.find(inView) ??
    candidates[0] ??
    null
  );
}

/**
 * Picks where an arrow goes from `from`: its own group first (the cards of
 * one grid or carousel, so Down reaches a short last row before whatever is
 * under the grid), then its grid of cells (`pickInCells`, the filter panel's
 * fields), then its region (the page or the sidebar). Left and Right then
 * cross between regions; Up and Down do not, so the fixed sidebar beside the
 * page never takes a vertical move.
 */
function pickFrom(
  from: HTMLElement,
  candidates: HTMLElement[],
  direction: Direction
): HTMLElement | null {
  const measured = candidates
    .filter((el) => el !== from)
    .map((el) => ({ el, rect: el.getBoundingClientRect() }));
  const fromRect = from.getBoundingClientRect();

  const group = from.parentElement;
  const siblings = measured.filter((c) => c.el.parentElement === group);
  const inGroup = pickNext(fromRect, siblings, direction);
  if (inGroup) return inGroup;

  const grid = from.closest(CELLS);
  const inCells =
    grid && pickInCells(grid, from, fromRect, measured, direction);
  if (inCells) return inCells;

  // Leaving a grid sideways is measured from the cell: from a narrow control
  // (a checkbox) in the last column, the wider fields lower in that column
  // would otherwise count as beside it
  const fromCell =
    grid && (direction === "left" || direction === "right")
      ? cellOf(grid, from)
      : null;
  const outRect = fromCell ? fromCell.getBoundingClientRect() : fromRect;

  const region = regionOf(from);
  if (!region) return pickNext(outRect, measured, direction);
  const inRegion = pickNext(
    outRect,
    measured.filter((c) => region.contains(c.el)),
    direction
  );
  if (inRegion || direction === "up" || direction === "down") return inRegion;
  return pickNext(outRect, measured, direction);
}

/**
 * Moves focus from the focused element to the nearest candidate in
 * `direction` inside `root` (with nothing focused there, to the first item in
 * view). Focuses without the browser's scroll, then scrolls the element just
 * into view. Returns whether focus moved.
 */
export function moveFocus(direction: Direction, root: Element): boolean {
  const candidates = tvCandidates(root);
  const active = document.activeElement;
  const from =
    active instanceof HTMLElement &&
    active !== document.body &&
    active !== root &&
    root.contains(active)
      ? active
      : null;

  const next = from
    ? pickFrom(from, candidates, direction)
    : firstInView(candidates);
  if (!next) return false;

  next.focus({ preventScroll: true });
  next.scrollIntoView({ block: "nearest", inline: "nearest" });
  return true;
}
