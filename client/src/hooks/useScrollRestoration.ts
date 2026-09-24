import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

// sessionStorage, so a reload (POP, same location.key) restores too
const STORAGE_PREFIX = "peek:scroll:";
// The index keeps the newest MAX_SAVED keys; older positions are dropped.
const INDEX_KEY = `${STORAGE_PREFIX}index`;
const MAX_SAVED = 100;
export const RESTORE_TIMEOUT_MS = 5000;
const USER_SCROLL_EVENTS = [
  "wheel",
  "touchstart",
  "keydown",
  "mousedown",
] as const;

const savePosition = (key: string, y: number) => {
  try {
    sessionStorage.setItem(STORAGE_PREFIX + key, String(Math.round(y)));
    const raw = sessionStorage.getItem(INDEX_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const index = (Array.isArray(parsed) ? parsed : []).filter(
      (k): k is string => typeof k === "string" && k !== key
    );
    index.push(key);
    while (index.length > MAX_SAVED) {
      sessionStorage.removeItem(STORAGE_PREFIX + index.shift());
    }
    sessionStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch {
    // sessionStorage full or unavailable
  }
};

const readPosition = (key: string): number | null => {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + key);
    if (raw === null) return null;
    const y = Number(raw);
    return Number.isFinite(y) ? y : null;
  } catch {
    return null;
  }
};

/**
 * Scrolls to y once the page is tall enough to reach it. Checks now and on
 * each resize of the document; gives up waiting after RESTORE_TIMEOUT_MS and
 * scrolls anyway (the browser clamps). Any user scroll input cancels it.
 * Returns a cleanup that cancels a pending restore.
 */
const restoreWhenReachable = (y: number): (() => void) => {
  const root = document.documentElement;
  const reachable = () => root.scrollHeight - window.innerHeight >= y;

  if (reachable()) {
    window.scrollTo(0, y);
    return () => {};
  }

  let done = false;
  let observer: ResizeObserver | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

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
    window.scrollTo(0, y);
  };

  observer = new ResizeObserver(() => {
    if (reachable()) restore();
  });
  observer.observe(root);
  timer = setTimeout(restore, RESTORE_TIMEOUT_MS);
  for (const type of USER_SCROLL_EVENTS) {
    window.addEventListener(type, stop, { passive: true });
  }

  return stop;
};

/**
 * Scroll position across navigations, per history entry (location.key):
 * - PUSH/REPLACE to a new pathname scrolls to the top; a query-only change
 *   (page size, sort, filters, tabs) keeps the position.
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
    return () => savePosition(key, scrollYRef.current);
  }, [location.key]);

  // Runs once per history entry; pathname and navigationType are read for
  // that entry only, so they are deliberately not dependencies.
  useLayoutEffect(() => {
    const prevPathname = prevPathnameRef.current;
    prevPathnameRef.current = location.pathname;
    const pathnameChanged = prevPathname !== location.pathname;
    if (navigationType !== "POP") {
      // A new page; query-only changes keep their place
      if (pathnameChanged) window.scrollTo(0, 0);
      return;
    }
    const y = readPosition(location.key);
    if (y === null) {
      if (pathnameChanged) window.scrollTo(0, 0);
      return;
    }
    // Cancels itself on the next navigation
    return restoreWhenReachable(y);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);
};

export default useScrollRestoration;
