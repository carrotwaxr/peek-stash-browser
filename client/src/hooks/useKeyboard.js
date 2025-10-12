import { useEffect, useCallback, useRef } from "react";

/**
 * Hook for keyboard navigation in grid layouts
 * Handles arrow keys, enter, escape, and provides visual focus management
 */
export function useKeyboardNavigation({
  items = [],
  columns = 4,
  onSelect = null,
  onEscape = null,
  enabled = true,
  initialFocus = 0,
  containerRef = null,
}) {
  const focusIndexRef = useRef(initialFocus);
  const itemRefsRef = useRef(new Map());

  // Register item refs
  const registerItemRef = useCallback((index, ref) => {
    if (ref) {
      itemRefsRef.current.set(index, ref);
    } else {
      itemRefsRef.current.delete(index);
    }
  }, []);

  // Update focus visual indicator
  const updateFocus = useCallback((newIndex) => {
    const oldIndex = focusIndexRef.current;

    // Remove focus from old item
    const oldRef = itemRefsRef.current.get(oldIndex);
    if (oldRef) {
      oldRef.classList.remove("keyboard-focused");
      oldRef.setAttribute("tabIndex", "-1");
    }

    // Add focus to new item
    const newRef = itemRefsRef.current.get(newIndex);
    if (newRef) {
      newRef.classList.add("keyboard-focused");
      newRef.setAttribute("tabIndex", "0");
      newRef.focus();

      // Scroll into view if needed
      newRef.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }

    focusIndexRef.current = newIndex;
  }, []);

  // Handle keyboard events
  const handleKeyDown = useCallback(
    (event) => {
      if (!enabled || items.length === 0) return;

      const currentIndex = focusIndexRef.current;
      const totalItems = items.length;
      let newIndex = currentIndex;

      switch (event.key) {
        case "ArrowRight":
          event.preventDefault();
          newIndex = Math.min(currentIndex + 1, totalItems - 1);
          break;

        case "ArrowLeft":
          event.preventDefault();
          newIndex = Math.max(currentIndex - 1, 0);
          break;

        case "ArrowDown":
          event.preventDefault();
          newIndex = Math.min(currentIndex + columns, totalItems - 1);
          break;

        case "ArrowUp":
          event.preventDefault();
          newIndex = Math.max(currentIndex - columns, 0);
          break;

        case "Home":
          event.preventDefault();
          newIndex = 0;
          break;

        case "End":
          event.preventDefault();
          newIndex = totalItems - 1;
          break;

        case "Enter":
        case " ":
          event.preventDefault();
          if (onSelect && items[currentIndex]) {
            onSelect(items[currentIndex], currentIndex);
          }
          break;

        case "Escape":
          event.preventDefault();
          if (onEscape) {
            onEscape();
          }
          break;

        default:
          return; // Don't prevent default for other keys
      }

      if (newIndex !== currentIndex) {
        updateFocus(newIndex);
      }
    },
    [enabled, items, columns, onSelect, onEscape, updateFocus]
  );

  // Set up keyboard event listeners
  useEffect(() => {
    if (!enabled) return;

    const container = containerRef?.current || document;
    container.addEventListener("keydown", handleKeyDown);

    return () => {
      container.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown, enabled, containerRef]);

  // Initialize focus when items change
  useEffect(() => {
    if (enabled && items.length > 0) {
      const validIndex = Math.min(focusIndexRef.current, items.length - 1);
      updateFocus(validIndex);
    }
  }, [items.length, enabled, updateFocus]);

  // Reset focus when component unmounts or becomes disabled
  useEffect(() => {
    const itemRefs = itemRefsRef.current;
    return () => {
      itemRefs.clear();
    };
  }, []);

  return {
    registerItemRef,
    focusIndex: focusIndexRef.current,
    setFocusIndex: updateFocus,
  };
}

/**
 * Hook for simple keyboard shortcuts
 */
export function useKeyboardShortcuts(shortcuts = {}, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event) => {
      const key = event.key.toLowerCase();
      const modifiers = {
        ctrl: event.ctrlKey,
        alt: event.altKey,
        shift: event.shiftKey,
        meta: event.metaKey,
      };

      // Find matching shortcut
      for (const [shortcutKey, callback] of Object.entries(shortcuts)) {
        const parts = shortcutKey.toLowerCase().split("+");
        const targetKey = parts.pop();

        // Check if key matches
        if (key !== targetKey) continue;

        // Check if modifiers match
        const hasCtrl = parts.includes("ctrl");
        const hasAlt = parts.includes("alt");
        const hasShift = parts.includes("shift");
        const hasMeta = parts.includes("meta") || parts.includes("cmd");

        if (
          modifiers.ctrl === hasCtrl &&
          modifiers.alt === hasAlt &&
          modifiers.shift === hasShift &&
          modifiers.meta === hasMeta
        ) {
          event.preventDefault();
          callback(event);
          break;
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [shortcuts, enabled]);
}

/**
 * Hook for focus trap (useful for modals and overlays)
 */
export function useFocusTrap(containerRef, enabled = true) {
  useEffect(() => {
    if (!enabled || !containerRef.current) return;

    const container = containerRef.current;
    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTabKey = (event) => {
      if (event.key !== "Tab") return;

      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    };

    container.addEventListener("keydown", handleTabKey);
    firstElement.focus();

    return () => {
      container.removeEventListener("keydown", handleTabKey);
    };
  }, [containerRef, enabled]);
}

// Default export for grid navigation (most common use case)
export default useKeyboardNavigation;
