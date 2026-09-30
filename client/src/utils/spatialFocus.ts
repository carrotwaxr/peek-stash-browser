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

/** The gap between the edges along the direction, and the centres' offset across it */
function distance(from: Rect, to: Rect, direction: Direction) {
  const vertical = direction === "up" || direction === "down";
  const primary =
    direction === "up"
      ? from.top - to.bottom
      : direction === "down"
        ? to.top - from.bottom
        : direction === "left"
          ? from.left - to.right
          : to.left - from.right;
  const cross = vertical
    ? Math.abs((to.left + to.right) / 2 - (from.left + from.right) / 2)
    : Math.abs((to.top + to.bottom) / 2 - (from.top + from.bottom) / 2);
  return Math.max(0, primary) + 2 * cross;
}

/**
 * The candidate beyond `from` in `direction` with the least primary gap plus
 * twice the cross-axis offset of centres; null when none is beyond it.
 */
export function pickNext<T>(
  from: Rect,
  candidates: ReadonlyArray<Candidate<T>>,
  direction: Direction
): T | null {
  let best: T | null = null;
  let bestScore = Infinity;
  for (const { el, rect } of candidates) {
    if (!isBeyond(from, rect, direction)) continue;
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
 * under the grid), then its region (the page or the sidebar). Left and Right
 * then cross between regions; Up and Down do not, so the fixed sidebar
 * beside the page never takes a vertical move.
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

  const region = regionOf(from);
  if (!region) return pickNext(fromRect, measured, direction);
  const inRegion = pickNext(
    fromRect,
    measured.filter((c) => region.contains(c.el)),
    direction
  );
  if (inRegion || direction === "up" || direction === "down") return inRegion;
  return pickNext(fromRect, measured, direction);
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
