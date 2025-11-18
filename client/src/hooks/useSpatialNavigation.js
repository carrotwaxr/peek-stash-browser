import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Custom hook for spatial (2D grid) keyboard navigation
 * Provides TV-friendly navigation with arrow keys
 *
 * @param {Object} options Configuration options
 * @param {Array} options.items Array of items to navigate
 * @param {number} options.columns Number of columns in grid
 * @param {boolean} options.enabled Whether navigation is enabled
 * @param {Function} options.onSelect Callback when item is selected (Enter/Space)
 * @param {Function} options.onPageUp Callback for PageUp key
 * @param {Function} options.onPageDown Callback for PageDown key
 * @param {Function} options.onEscapeUp Callback when Up arrow pressed on top row
 * @param {Function} options.onEscapeDown Callback when Down arrow pressed on bottom row
 * @param {Function} options.onEscapeLeft Callback when Left arrow pressed on leftmost column
 * @param {number} options.initialFocusIndex Initial focus index (default: 0)
 * @returns {Object} Navigation state and helpers
 */
export const useSpatialNavigation = ({
  items = [],
  columns = 4,
  enabled = true,
  onSelect,
  onPageUp,
  onPageDown,
  onEscapeUp,
  onEscapeDown,
  onEscapeLeft,
  initialFocusIndex = 0,
}) => {
  const [focusedIndex, setFocusedIndex] = useState(initialFocusIndex);
  const itemRefs = useRef([]);

  // Update refs array when items change
  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, items.length);
  }, [items]);

  // Reset focus when items change significantly
  useEffect(() => {
    if (items.length > 0 && focusedIndex >= items.length) {
      setFocusedIndex(Math.max(0, items.length - 1));
    }
  }, [items.length, focusedIndex]);

  // Scroll focused item into view
  useEffect(() => {
    if (enabled && itemRefs.current[focusedIndex]) {
      itemRefs.current[focusedIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }
  }, [focusedIndex, enabled]);

  const handleKeyDown = useCallback(
    (e) => {
      if (!enabled || !items.length) return;

      const totalItems = items.length;
      let handled = false;

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          // Check if we're in the leftmost column (index % columns === 0)
          if (focusedIndex % columns === 0 && onEscapeLeft) {
            onEscapeLeft();
          } else {
            setFocusedIndex((prev) => Math.max(0, prev - 1));
          }
          handled = true;
          break;

        case "ArrowRight":
          e.preventDefault();
          setFocusedIndex((prev) => Math.min(totalItems - 1, prev + 1));
          handled = true;
          break;

        case "ArrowUp":
          e.preventDefault();
          // Check if we're on the top row (index < columns)
          if (focusedIndex < columns && onEscapeUp) {
            onEscapeUp();
          } else {
            setFocusedIndex((prev) => Math.max(0, prev - columns));
          }
          handled = true;
          break;

        case "ArrowDown": {
          e.preventDefault();
          // Check if we're on the bottom row (moving down would exceed total items)
          const wouldExceed = focusedIndex + columns >= totalItems;
          if (wouldExceed && onEscapeDown) {
            onEscapeDown();
          } else {
            setFocusedIndex((prev) => Math.min(totalItems - 1, prev + columns));
          }
          handled = true;
          break;
        }

        case "Enter":
        case " ":
          e.preventDefault();
          if (items[focusedIndex] && onSelect) {
            onSelect(items[focusedIndex], focusedIndex);
          }
          handled = true;
          break;

        case "PageUp":
          e.preventDefault();
          if (onPageUp) {
            onPageUp();
          }
          handled = true;
          break;

        case "PageDown":
          e.preventDefault();
          if (onPageDown) {
            onPageDown();
          }
          handled = true;
          break;

        case "Home":
          e.preventDefault();
          setFocusedIndex(0);
          handled = true;
          break;

        case "End":
          e.preventDefault();
          setFocusedIndex(totalItems - 1);
          handled = true;
          break;
      }

      return handled;
    },
    [
      enabled,
      items,
      focusedIndex,
      columns,
      onSelect,
      onPageUp,
      onPageDown,
      onEscapeUp,
      onEscapeDown,
      onEscapeLeft,
    ]
  );

  // Attach keyboard listener
  useEffect(() => {
    if (!enabled) return;

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [enabled, handleKeyDown]);

  // Helper to set ref for an item
  const setItemRef = useCallback((index, element) => {
    if (element) {
      itemRefs.current[index] = element;
    }
  }, []);

  // Helper to check if an index is focused
  const isFocused = useCallback(
    (index) => {
      return enabled && focusedIndex === index;
    },
    [enabled, focusedIndex]
  );

  return {
    focusedIndex,
    setFocusedIndex,
    setItemRef,
    isFocused,
    itemRefs: itemRefs.current,
  };
};
