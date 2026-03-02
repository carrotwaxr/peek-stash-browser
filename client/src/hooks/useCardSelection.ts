import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Hook for card selection behavior: long-press to select, selection mode click handling
 * @param {Object} options
 * @param {Object} options.entity - The entity object (for onToggleSelect callback)
 * @param {boolean} options.selectionMode - Whether selection mode is active
 * @param {Function} options.onToggleSelect - Callback when entity should be toggled
 * @returns {Object} - { isLongPressing, selectionHandlers, handleNavigationClick }
 */
export const useCardSelection = ({
  entity,
  selectionMode = false,
  onToggleSelect,
}) => {
  const longPressTimerRef = useRef(null);
  const [isLongPressing, setIsLongPressing] = useState(false);
  const startPosRef = useRef({ x: 0, y: 0 });
  const hasMovedRef = useRef(false);

  // Clear timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  const isInteractiveElement = useCallback((target, currentTarget) => {
    const closestButton = target.closest("button");
    const isButton = closestButton && closestButton !== currentTarget;
    const closestLink = target.closest("a");
    // Only count as interactive if it's a NESTED link (different from currentTarget)
    const isNestedLink = closestLink && closestLink !== currentTarget;
    const isInput = target.closest("input");
    return isButton || isNestedLink || isInput;
  }, []);

  const handleMouseDown = useCallback(
    (e) => {
      if (isInteractiveElement(e.target, e.currentTarget)) return;

      longPressTimerRef.current = setTimeout(() => {
        setIsLongPressing(true);
        onToggleSelect?.(entity);
      }, 500);
    },
    [entity, onToggleSelect, isInteractiveElement]
  );

  const handleMouseUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleTouchStart = useCallback(
    (e) => {
      if (isInteractiveElement(e.target, e.currentTarget)) return;

      const touch = e.touches[0];
      startPosRef.current = { x: touch.clientX, y: touch.clientY };
      hasMovedRef.current = false;

      longPressTimerRef.current = setTimeout(() => {
        if (!hasMovedRef.current) {
          setIsLongPressing(true);
          onToggleSelect?.(entity);
        }
      }, 500);
    },
    [entity, onToggleSelect, isInteractiveElement]
  );

  const handleTouchMove = useCallback((e) => {
    if (longPressTimerRef.current && e.touches.length > 0) {
      const touch = e.touches[0];
      const deltaX = Math.abs(touch.clientX - startPosRef.current.x);
      const deltaY = Math.abs(touch.clientY - startPosRef.current.y);
      const moveThreshold = 10;

      if (deltaX > moveThreshold || deltaY > moveThreshold) {
        hasMovedRef.current = true;
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    hasMovedRef.current = false;
  }, []);

  // Click handler for navigation elements (CardImage, CardTitle)
  // Always attached to intercept clicks from interactive elements (like checkboxes)
  const handleNavigationClick = useCallback(
    (e) => {
      // If long-press just fired, block the click
      if (isLongPressing) {
        e.preventDefault();
        setIsLongPressing(false);
        return;
      }

      // In selection mode, toggle instead of navigate
      if (selectionMode) {
        e.preventDefault();
        onToggleSelect?.(entity);
        return;
      }

      // If click originated from an interactive element (button, nested link, input),
      // prevent navigation - the interactive element handles its own action
      if (isInteractiveElement(e.target, e.currentTarget)) {
        e.preventDefault();
        return;
      }
      // Otherwise, let the Link navigate normally
    },
    [isLongPressing, selectionMode, entity, onToggleSelect, isInteractiveElement]
  );

  return {
    isLongPressing,
    selectionHandlers: {
      onMouseDown: handleMouseDown,
      onMouseUp: handleMouseUp,
      onMouseLeave: handleMouseUp,
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      onTouchCancel: handleTouchEnd,
    },
    // Always return handler to intercept clicks from interactive elements
    handleNavigationClick,
  };
};
