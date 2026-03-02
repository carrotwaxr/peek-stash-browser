import { useRef, useCallback } from "react";

/**
 * Hook to scroll the current item into view within a scrollable container.
 * Works for both horizontal (thumbnail strips) and vertical (lists) scrolling.
 *
 * @param {number} currentIndex - The index of the current item
 * @param {object} options - Configuration options
 * @param {string} options.direction - 'horizontal' or 'vertical' (default: 'horizontal')
 * @param {number} options.delay - Delay in ms before scrolling (default: 100)
 * @returns {object} - { containerRef, containerElRef, setCurrentItemRef }
 *   - containerRef: Callback ref to pass to container's ref prop
 *   - containerElRef: Regular ref object to read container element (for event handling)
 *   - setCurrentItemRef: Callback ref to pass to current item's ref prop
 */
export const useScrollToCurrentItem = (currentIndex, options = {}) => {
  const { direction = "horizontal", delay = 100 } = options;

  const containerElRef = useRef(null);
  const currentItemRef = useRef(null);
  const lastScrolledIndex = useRef(null);
  const pendingScrollIndexRef = useRef(null);

  const scrollToCenter = useCallback(() => {
    const container = containerElRef.current;
    const item = currentItemRef.current;

    if (!container || !item) return false;

    // Skip if container is hidden
    const containerRect = container.getBoundingClientRect();
    if (containerRect.width === 0 && containerRect.height === 0) {
      return false;
    }

    const itemRect = item.getBoundingClientRect();

    if (direction === "horizontal") {
      // Calculate item's position relative to container's scroll area
      let itemLeftInContainer = 0;
      let sibling = item.previousElementSibling;
      while (sibling) {
        // Get gap from container's computed style
        const gap = parseInt(getComputedStyle(container).gap) || 8;
        itemLeftInContainer += sibling.offsetWidth + gap;
        sibling = sibling.previousElementSibling;
      }

      const itemCenter = itemLeftInContainer + itemRect.width / 2;
      const containerCenter = containerRect.width / 2;
      const scrollTarget = itemCenter - containerCenter;

      container.scrollTo({
        left: Math.max(0, scrollTarget),
        behavior: "smooth",
      });
    } else {
      // Vertical scrolling
      // Use getBoundingClientRect to get position relative to viewport,
      // then calculate position relative to the scroll container
      const itemTopRelativeToContainer =
        itemRect.top - containerRect.top + container.scrollTop;
      const itemHeight = itemRect.height;
      const containerHeight = containerRect.height;
      const scrollTarget =
        itemTopRelativeToContainer - containerHeight / 2 + itemHeight / 2;

      container.scrollTo({
        top: Math.max(0, scrollTarget),
        behavior: "smooth",
      });
    }

    return true;
  }, [direction]);

  // Helper to attempt scrolling with retries
  const attemptScroll = useCallback(
    (indexToScrollTo) => {
      const tryScroll = (attempt = 0) => {
        const success = scrollToCenter();
        if (success) {
          lastScrolledIndex.current = indexToScrollTo;
          pendingScrollIndexRef.current = null;
        } else if (attempt < 3) {
          // Retry with exponential backoff: delay, delay*2, delay*4
          setTimeout(() => tryScroll(attempt + 1), delay * Math.pow(2, attempt));
        }
      };

      setTimeout(() => tryScroll(), delay);
    },
    [scrollToCenter, delay]
  );

  // Callback ref for the container - checks for pending scroll when attached
  const containerRef = useCallback(
    (el) => {
      containerElRef.current = el;

      // If we have a pending scroll and now have the container, trigger it
      if (el && pendingScrollIndexRef.current !== null && currentItemRef.current) {
        attemptScroll(pendingScrollIndexRef.current);
      }
    },
    [attemptScroll]
  );

  // Callback ref for the current item - triggers scroll when attached
  const setCurrentItemRef = useCallback(
    (el) => {
      currentItemRef.current = el;

      // Only scroll if this is a new index we haven't scrolled to yet
      if (el && lastScrolledIndex.current !== currentIndex) {
        if (containerElRef.current) {
          // Container ready - scroll immediately
          attemptScroll(currentIndex);
        } else {
          // Container not ready yet - mark as pending
          pendingScrollIndexRef.current = currentIndex;
        }
      }
    },
    [attemptScroll, currentIndex]
  );

  return {
    containerRef,
    containerElRef, // Expose the underlying ref for reading .current
    setCurrentItemRef,
  };
};
