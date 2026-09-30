import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useInView } from "./useInView";

/** Rows a tree list mounts at a time (owner decision 11: no virtualization library) */
export const LIST_CHUNK = 200;

/** Start loading the next chunk this far before the sentinel scrolls into view */
const SENTINEL_MARGIN = "600px";

interface IncrementalList<T> {
  /** The first N items: one chunk, plus one for each time the sentinel was reached */
  visible: readonly T[];
  /** Put on an element after the last visible row; render it while `hasMore` */
  sentinelRef: RefObject<HTMLDivElement | null>;
  /** Items are left to show */
  hasMore: boolean;
  /**
   * Shows at least the first `count` items, in whole chunks (keyboard moves
   * past the last visible row mount the rows they land on)
   */
  showAtLeast: (count: number) => void;
}

/**
 * Renders a list the client holds whole in chunks: the first `chunk` items,
 * and one more chunk each time the sentinel after the last row comes into
 * view (through the shared `useInView` observer). A new `items` array starts
 * over at the first chunk, so pass a memoised array. Without an
 * IntersectionObserver every item shows, as the list did before chunking.
 */
export const useIncrementalList = <T>(
  items: readonly T[],
  { chunk = LIST_CHUNK }: { chunk?: number } = {}
): IncrementalList<T> => {
  // The count belongs to the items array it was grown for
  const [shown, setShown] = useState({ items, count: chunk });
  const count = shown.items === items ? shown.count : chunk;
  if (shown.items !== items) setShown({ items, count: chunk });

  const total = items.length;
  const hasMore = count < total;
  const sentinelRef = useRef<HTMLDivElement>(null);
  const inView = useInView(sentinelRef, { rootMargin: SENTINEL_MARGIN });

  // One chunk each time the sentinel comes into view, not one per render
  // while it stays there
  const wasInView = useRef(false);
  useEffect(() => {
    const reached = inView && !wasInView.current;
    wasInView.current = inView;
    if (!reached) return;
    setShown((prev) => ({
      items: prev.items,
      count: Math.min(prev.count + chunk, prev.items.length),
    }));
  }, [inView, chunk]);

  const showAtLeast = useCallback(
    (wanted: number) =>
      setShown((prev) => {
        const whole = Math.min(
          Math.ceil(wanted / chunk) * chunk,
          prev.items.length
        );
        return whole > prev.count ? { items: prev.items, count: whole } : prev;
      }),
    [chunk]
  );

  if (typeof IntersectionObserver === "undefined") {
    return { visible: items, sentinelRef, hasMore: false, showAtLeast };
  }
  return {
    visible: hasMore ? items.slice(0, count) : items,
    sentinelRef,
    hasMore,
    showAtLeast,
  };
};
