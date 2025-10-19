import { useEffect, useRef } from "react";

/**
 * Custom hook for trapping focus within a container (modal, dropdown, etc.)
 * Prevents Tab navigation from escaping the container
 *
 * @param {boolean} enabled Whether focus trap is enabled
 * @param {Function} onEscape Optional callback when Escape is pressed
 * @returns {Object} Ref to attach to container element
 */
export const useFocusTrap = (enabled = true, onEscape = null) => {
  const containerRef = useRef(null);
  const previousActiveElement = useRef(null);

  useEffect(() => {
    if (!enabled || !containerRef.current) return;

    const container = containerRef.current;

    // Store the previously focused element
    previousActiveElement.current = document.activeElement;

    // Get all focusable elements within the container
    const getFocusableElements = () => {
      const focusableSelectors = [
        'a[href]',
        'button:not([disabled])',
        'textarea:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
      ].join(', ');

      return Array.from(container.querySelectorAll(focusableSelectors));
    };

    // Focus the first focusable element
    const focusableElements = getFocusableElements();
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }

    const handleKeyDown = (e) => {
      const focusableElements = getFocusableElements();

      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      // Handle Escape key
      if (e.key === "Escape") {
        if (onEscape) {
          e.preventDefault();
          e.stopPropagation();
          onEscape();
        }
        return;
      }

      // Handle Tab key
      if (e.key === "Tab") {
        if (e.shiftKey) {
          // Shift + Tab
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          // Tab
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    // Attach event listener
    container.addEventListener("keydown", handleKeyDown);

    // Cleanup: restore focus to previously focused element
    return () => {
      container.removeEventListener("keydown", handleKeyDown);
      if (previousActiveElement.current && previousActiveElement.current.focus) {
        previousActiveElement.current.focus();
      }
    };
  }, [enabled, onEscape]);

  return containerRef;
};

/**
 * Hook for managing initial focus on page load
 * Focuses the first meaningful interactive element
 *
 * @param {Object} containerRef Ref to the container element
 * @param {string} selector Optional CSS selector for the element to focus
 * @param {boolean} enabled Whether to auto-focus on mount
 */
export const useInitialFocus = (containerRef, selector = null, enabled = true) => {
  useEffect(() => {
    if (!enabled || !containerRef?.current) return;

    const container = containerRef.current;

    // Small delay to ensure DOM is fully rendered
    const timeoutId = setTimeout(() => {
      let elementToFocus;

      if (selector) {
        // Use custom selector if provided
        elementToFocus = container.querySelector(selector);
      } else {
        // Default: find first focusable element
        const focusableSelectors = [
          'input:not([disabled]):not([type="hidden"])',
          'button:not([disabled])',
          'a[href]',
          '[tabindex="0"]',
        ].join(', ');

        elementToFocus = container.querySelector(focusableSelectors);
      }

      if (elementToFocus && elementToFocus.focus) {
        elementToFocus.focus();
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [containerRef, selector, enabled]);
};
