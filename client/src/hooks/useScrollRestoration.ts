import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

// sessionStorage, so a reload (POP, same location.key) restores too
const STORAGE_PREFIX = "peek:scroll:";
// A scrolling box inside the page keeps its positions under its own prefix.
const ELEMENT_PREFIX = "peek:scroll-box:";
// Each prefix's index keeps the newest MAX_SAVED keys; older positions are dropped.
const MAX_SAVED = 100;
export const RESTORE_TIMEOUT_MS = 5000;
const USER_SCROLL_EVENTS = [
  "wheel",
  "touchstart",
  "keydown",
  "mousedown",
] as const;

const savePosition = (prefix: string, key: string, y: number) => {
  const indexKey = `${prefix}index`;
  try {
    sessionStorage.setItem(prefix + key, String(Math.round(y)));
    const raw = sessionStorage.getItem(indexKey);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const index = (Array.isArray(parsed) ? parsed : []).filter(
      (k): k is string => typeof k === "string" && k !== key
    );
    index.push(key);
    while (index.length > MAX_SAVED) {
      const oldest = index.shift();
      if (oldest !== undefined) sessionStorage.removeItem(prefix + oldest);
    }
    sessionStorage.setItem(indexKey, JSON.stringify(index));
  } catch {
    // sessionStorage full or unavailable
  }
};

const readPosition = (prefix: string, key: string): number | null => {
  try {
    const raw = sessionStorage.getItem(prefix + key);
    if (raw === null) return null;
    const y = Number(raw);
    return Number.isFinite(y) ? y : null;
  } catch {
    return null;
  }
};

/** What a restore scrolls: the window, or one scrolling box */
interface ScrollTarget {
  /** True once the target is tall enough to reach y */
  reachable: (y: number) => boolean;
  scrollTo: (y: number) => void;
  /** What to watch for growth: the target's content, so rows arriving count */
  observed: () => Element[];
}

const windowTarget: ScrollTarget = {
  reachable: (y) =>
    document.documentElement.scrollHeight - window.innerHeight >= y,
  scrollTo: (y) => window.scrollTo(0, y),
  observed: () => [document.documentElement],
};

const elementTarget = (el: HTMLElement): ScrollTarget => ({
  reachable: (y) => el.scrollHeight - el.clientHeight >= y,
  scrollTo: (y) => {
    el.scrollTop = y;
  },
  observed: () => [el, ...Array.from(el.children)],
});

/**
 * Scrolls the target to y once it is tall enough to reach it. Checks now and
 * on each resize of what it shows; gives up waiting after RESTORE_TIMEOUT_MS
 * and scrolls anyway (the browser clamps). Any user scroll input cancels it.
 * Returns a cleanup that cancels a pending restore.
 */
const restoreWhenReachable = (
  y: number,
  target: ScrollTarget,
  onRestored?: () => void
): (() => void) => {
  if (target.reachable(y)) {
    target.scrollTo(y);
    onRestored?.();
    return () => {};
  }

  let done = false;
  let observer: ResizeObserver | null = null;

  const stop = () => {
    if (done) return;
    done = true;
    observer?.disconnect();
    clearTimeout(timer);
    for (const type of USER_SCROLL_EVENTS) {
      window.removeEventListener(type, stop);
    }
  };
  const restore = () => {
    stop();
    target.scrollTo(y);
    onRestored?.();
  };

  observer = new ResizeObserver(() => {
    if (target.reachable(y)) restore();
  });
  for (const el of target.observed()) observer.observe(el);
  // stop() reads timer only once a callback or scroll event runs, after this
  const timer = setTimeout(restore, RESTORE_TIMEOUT_MS);
  for (const type of USER_SCROLL_EVENTS) {
    window.addEventListener(type, stop, { passive: true });
  }

  return stop;
};

/** A REPLACE that asks to keep the scroll position (the player's queue step) */
const keepsScroll = (state: unknown): boolean =>
  typeof state === "object" &&
  state !== null &&
  (state as { keepScroll?: unknown }).keepScroll === true;

/**
 * Scroll position across navigations, per history entry (location.key):
 * - PUSH/REPLACE to a new pathname scrolls to the top; a query-only change
 *   (page size, sort, filters, tabs) keeps the position, as does a REPLACE
 *   whose state has `keepScroll: true` (the player's queue step, which
 *   replaces the scene's URL under a reader of its details).
 * - POP (Back, Forward, reload) restores the entry's saved position once the
 *   page is tall enough to reach it.
 */
const useScrollRestoration = () => {
  const location = useLocation();
  const navigationType = useNavigationType();
  const scrollYRef = useRef(window.scrollY);
  const prevPathnameRef = useRef<string | null>(null);

  // Once: manual restoration and a passive scroll tracker
  useEffect(() => {
    window.history.scrollRestoration = "manual";
    const onScroll = () => {
      scrollYRef.current = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Save the entry being left. Layout-effect cleanup runs in the commit, before
  // the browser clamps scrollY to the new page's height.
  useLayoutEffect(() => {
    const key = location.key;
    return () => savePosition(STORAGE_PREFIX, key, scrollYRef.current);
  }, [location.key]);

  // Runs once per history entry; pathname and navigationType are read for
  // that entry only, so they are deliberately not dependencies.
  useLayoutEffect(() => {
    const prevPathname = prevPathnameRef.current;
    prevPathnameRef.current = location.pathname;
    const pathnameChanged = prevPathname !== location.pathname;
    if (navigationType !== "POP") {
      // A new page; query-only changes keep their place
      const kept = navigationType === "REPLACE" && keepsScroll(location.state);
      if (pathnameChanged && !kept) window.scrollTo(0, 0);
      return;
    }
    const y = readPosition(STORAGE_PREFIX, location.key);
    if (y === null) {
      if (pathnameChanged) window.scrollTo(0, 0);
      return;
    }
    // Cancels itself on the next navigation
    return restoreWhenReachable(y, windowTarget);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);
};

/**
 * The same, for a box that scrolls inside the page (the table view's body at
 * tablet widths and up; the window keeps only its own scrollY). Saved per
 * history entry under its own prefix. The box restores on POP once its rows
 * make it tall enough; a PUSH or REPLACE keeps whatever the box shows, and a
 * box mounted by a new entry starts at the top. An entry left before its
 * position was restored keeps the position it had.
 */
export const useElementScrollRestoration = (
  ref: RefObject<HTMLElement | null>
) => {
  const location = useLocation();
  const navigationType = useNavigationType();
  // null until the box scrolled or was restored: nothing to save before that
  const scrollTopRef = useRef<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      scrollTopRef.current = el.scrollTop;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [ref]);

  // Save the entry being left (or the box unmounting with it)
  useLayoutEffect(() => {
    const key = location.key;
    return () => {
      if (scrollTopRef.current !== null) {
        savePosition(ELEMENT_PREFIX, key, scrollTopRef.current);
      }
    };
  }, [location.key]);

  // Once per entry the box is mounted in; only Back, Forward and reload restore
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || navigationType !== "POP") return;
    const y = readPosition(ELEMENT_PREFIX, location.key);
    if (y === null) return;
    return restoreWhenReachable(y, elementTarget(el), () => {
      scrollTopRef.current = y;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);
};

export default useScrollRestoration;
