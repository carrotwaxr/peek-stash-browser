import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Custom hook for horizontal (1D) keyboard navigation
 * Used for navigation bars, button groups, etc.
 *
 * @param {Object} options Configuration options
 * @param {Array} options.items Array of items to navigate
 * @param {boolean} options.enabled Whether navigation is enabled
 * @param {Function} options.onSelect Callback when item is selected (Enter)
 * @param {Function} options.onEscapeUp Callback when Up arrow pressed (exit zone upward)
 * @param {Function} options.onEscapeDown Callback when Down arrow pressed (exit zone downward)
 * @param {number} options.initialFocusIndex Initial focus index (default: 0)
 * @returns {Object} Navigation state and helpers
 */
export const useHorizontalNavigation = ({
  items = [],
  enabled = true,
  onSelect,
  onEscapeUp,
  onEscapeDown,
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

  // Scroll focused item into view and update DOM focus
  useEffect(() => {
    if (enabled && itemRefs.current[focusedIndex]) {
      const element = itemRefs.current[focusedIndex];
      element?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
      // Update DOM focus to match visual navigation state
      element?.focus();
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
          setFocusedIndex((prev) => Math.max(0, prev - 1));
          handled = true;
          break;

        case "ArrowRight":
          e.preventDefault();
          setFocusedIndex((prev) => Math.min(totalItems - 1, prev + 1));
          handled = true;
          break;

        case "ArrowUp":
          e.preventDefault();
          if (onEscapeUp) {
            onEscapeUp();
          }
          handled = true;
          break;

        case "ArrowDown":
          e.preventDefault();
          if (onEscapeDown) {
            onEscapeDown();
          }
          handled = true;
          break;

        case "Enter":
        case " ":
          e.preventDefault();
          if (items[focusedIndex] && onSelect) {
            onSelect(items[focusedIndex], focusedIndex);
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
    [enabled, items, focusedIndex, onSelect, onEscapeUp, onEscapeDown]
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
