import { type RefObject, useEffect, useRef, useState } from "react";

type Listener = (entry: IntersectionObserverEntry) => void;

/** One IntersectionObserver and the elements it watches for its callers */
interface SharedObserver {
  /** The constructor it was built with: a test may swap the global */
  ctor: typeof IntersectionObserver;
  observer: IntersectionObserver;
  listeners: Map<Element, Set<Listener>>;
  /** Each element's latest entry, replayed to a caller that joins later */
  lastEntry: Map<Element, IntersectionObserverEntry>;
}

/**
 * One observer per distinct rootMargin and threshold, shared by every caller.
 * An observer is disconnected and dropped once it watches nothing, so none
 * outlives the elements that needed it.
 */
const registry = new Map<string, SharedObserver>();

const observe = (
  element: Element,
  rootMargin: string,
  threshold: number | number[],
  listener: Listener
): (() => void) => {
  const key = `${rootMargin}|${String(threshold)}`;
  let shared = registry.get(key);
  if (!shared || shared.ctor !== IntersectionObserver) {
    const listeners = new Map<Element, Set<Listener>>();
    const lastEntry = new Map<Element, IntersectionObserverEntry>();
    let observer: IntersectionObserver;
    try {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const callers = listeners.get(entry.target);
            if (!callers) continue;
            lastEntry.set(entry.target, entry);
            callers.forEach((call) => call(entry));
          }
        },
        { rootMargin, threshold }
      );
    } catch {
      // An observer that cannot be built: the element counts as visible
      listener({
        target: element,
        isIntersecting: true,
        intersectionRatio: 1,
      } as IntersectionObserverEntry);
      return () => {};
    }
    shared = { ctor: IntersectionObserver, observer, listeners, lastEntry };
    registry.set(key, shared);
  }

  const { observer, listeners, lastEntry } = shared;
  const callers = listeners.get(element);
  if (callers) {
    callers.add(listener);
    const known = lastEntry.get(element);
    if (known) listener(known);
  } else {
    listeners.set(element, new Set([listener]));
    observer.observe(element);
  }

  const owner = shared;
  return () => {
    const set = listeners.get(element);
    if (!set) return;
    set.delete(listener);
    if (set.size > 0) return;
    listeners.delete(element);
    lastEntry.delete(element);
    observer.unobserve(element);
    if (listeners.size > 0) return;
    observer.disconnect();
    if (registry.get(key) === owner) registry.delete(key);
  };
};

export interface InViewOptions {
  rootMargin?: string;
  threshold?: number | number[];
  /** The share of the element that must be visible to count (0: any part) */
  minRatio?: number;
  /** Stop watching once the element has been in view: it stays true */
  once?: boolean;
  /** Watch nothing (false), e.g. while the caller does not need to know */
  skip?: boolean;
}

/**
 * Whether the ref's element is in view, through one IntersectionObserver per
 * distinct `rootMargin`/`threshold` shared by every caller. Without an
 * IntersectionObserver (an old browser, a test that removes it) everything
 * counts as visible. The ref's element may mount after the first render, so
 * each render checks whether it changed.
 */
export const useInView = (
  ref: RefObject<Element | null>,
  {
    rootMargin = "0px",
    threshold = 0,
    minRatio = 0,
    once = false,
    skip = false,
  }: InViewOptions = {}
): boolean => {
  const [inView, setInView] = useState(false);
  const watching = useRef<{
    element: Element;
    config: string;
    stop: () => void;
  } | null>(null);
  const settings = useRef({ minRatio, once });
  const noObserver = typeof IntersectionObserver === "undefined";
  const done = once && inView;
  const config = `${rootMargin}|${String(threshold)}`;

  // No dependency list on purpose: the ref's element is not reactive
  useEffect(() => {
    settings.current = { minRatio, once };
    const element = skip || done || noObserver ? null : ref.current;
    const current = watching.current;
    if (current?.element === element && current.config === config) return;
    current?.stop();
    watching.current = null;
    if (!element) return;
    const stop = observe(element, rootMargin, threshold, (entry) => {
      const { minRatio: ratio, once: onlyOnce } = settings.current;
      const visible =
        entry.isIntersecting &&
        (ratio <= 0 || entry.intersectionRatio >= ratio);
      if (visible || !onlyOnce) setInView(visible);
    });
    watching.current = { element, config, stop };
  });

  useEffect(
    () => () => {
      watching.current?.stop();
      watching.current = null;
    },
    []
  );

  return !skip && (noObserver || inView);
};
