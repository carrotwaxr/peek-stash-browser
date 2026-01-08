import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Reusable tooltip component with portal rendering to avoid overflow clipping
 * Supports both hover and click modes for mobile compatibility
 */
const Tooltip = ({
  children,
  content,
  position = "top",
  className = "",
  disabled = false,
  clickable = false, // Enable click-to-open mode for mobile
  hoverDisabled = false, // Disable hover trigger (useful when parent handles interaction)
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({
    top: 0,
    left: 0,
    finalPosition: position,
    arrowOffset: 24,
  });
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  const hideTimeoutRef = useRef(null);

  // Calculate and update tooltip position
  const calculatePosition = useCallback(() => {
    if (!isVisible || !triggerRef.current || !tooltipRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
    };

    const GAP = 8; // Gap between trigger and tooltip
    const EDGE_PADDING = 16; // Minimum distance from viewport edge

    // Calculate available space on each side
    const spaceAbove = triggerRect.top;
    const spaceBelow = viewport.height - triggerRect.bottom;

    // Determine best vertical position
    let finalPosition = position;
    let top = 0;
    let left = 0;

    // Auto-flip vertical position if not enough space
    if (
      position === "top" &&
      spaceAbove < tooltipRect.height + GAP + EDGE_PADDING
    ) {
      if (spaceBelow > spaceAbove) {
        finalPosition = "bottom";
      }
    } else if (
      position === "bottom" &&
      spaceBelow < tooltipRect.height + GAP + EDGE_PADDING
    ) {
      if (spaceAbove > spaceBelow) {
        finalPosition = "top";
      }
    }

    // Calculate vertical position
    switch (finalPosition) {
      case "top":
        top = triggerRect.top - GAP;
        break;
      case "bottom":
        top = triggerRect.bottom + GAP;
        break;
      case "left":
      case "right":
        // Center vertically, but adjust if would go off-screen
        top = triggerRect.top + triggerRect.height / 2;
        // Check if centering would push tooltip off-screen
        if (top + tooltipRect.height / 2 > viewport.height - EDGE_PADDING) {
          top = viewport.height - EDGE_PADDING - tooltipRect.height;
        } else if (top - tooltipRect.height / 2 < EDGE_PADDING) {
          top = EDGE_PADDING;
        } else {
          top = top - tooltipRect.height / 2;
        }
        break;
    }

    // Calculate horizontal position
    switch (finalPosition) {
      case "top":
      case "bottom":
        // Try to align left edge with trigger
        left = triggerRect.left;

        // Check if tooltip would go off right edge
        if (left + tooltipRect.width > viewport.width - EDGE_PADDING) {
          // Shift left to fit
          left = viewport.width - EDGE_PADDING - tooltipRect.width;
        }

        // Check if tooltip would go off left edge
        if (left < EDGE_PADDING) {
          left = EDGE_PADDING;
        }
        break;
      case "left":
        left = triggerRect.left - GAP;
        break;
      case "right":
        left = triggerRect.right + GAP;
        break;
    }

    // Calculate arrow offset (distance from left edge of tooltip to trigger center)
    const arrowOffset = Math.max(
      16, // Minimum offset to keep arrow visible
      Math.min(
        triggerRect.left + triggerRect.width / 2 - left,
        tooltipRect.width - 16 // Maximum offset to keep arrow visible
      )
    );

    setTooltipPosition({
      top,
      left,
      finalPosition,
      arrowOffset,
    });
  }, [isVisible, position]);

  // Update tooltip position when visibility changes with smart viewport-aware positioning
  useEffect(() => {
    calculatePosition();
  }, [calculatePosition]);

  // Recalculate position after tooltip is rendered (to get accurate dimensions)
  useEffect(() => {
    if (isVisible) {
      // Small delay to ensure tooltip is rendered with content
      const timer = setTimeout(calculatePosition, 0);
      return () => clearTimeout(timer);
    }
  }, [isVisible, calculatePosition]);

  // Reposition tooltip on window resize or scroll
  useEffect(() => {
    if (!isVisible) return;

    const handleReposition = () => calculatePosition();

    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true); // Use capture to catch all scroll events

    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [isVisible, calculatePosition]);

  // Handle click outside to close when in clickable mode
  useEffect(() => {
    if (!clickable || !isVisible) return;

    const handleClickOutside = (e) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target) &&
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target)
      ) {
        setIsVisible(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [clickable, isVisible]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  if (disabled || !content) {
    return children;
  }

  const handleMouseEnter = () => {
    if (hoverDisabled) return;
    // Clear any pending hide timeout
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setIsVisible(true);
  };

  const handleMouseLeave = () => {
    if (hoverDisabled) return;
    // Delay hiding to allow mouse to enter tooltip
    hideTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 150); // 150ms delay
  };

  const handleTooltipMouseEnter = () => {
    // Cancel hide when mouse enters tooltip
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  };

  const handleTooltipMouseLeave = () => {
    if (hoverDisabled) return;
    // Hide when mouse leaves tooltip
    setIsVisible(false);
  };

  const handleClick = (e) => {
    if (clickable) {
      e.stopPropagation();
      setIsVisible(!isVisible);
    }
  };

  const tooltipContent = isVisible && (
    <div
      ref={tooltipRef}
      onMouseEnter={handleTooltipMouseEnter}
      onMouseLeave={handleTooltipMouseLeave}
      className="fixed z-[9999] px-4 py-3 text-sm rounded-lg shadow-xl max-w-[80%] lg:max-w-[60%] 2xl:max-w-[40%]"
      style={{
        backgroundColor: "var(--bg-tertiary)",
        color: "var(--text-primary)",
        border: "1px solid var(--border-color)",
        wordWrap: "break-word",
        top: `${tooltipPosition.top || 0}px`,
        left: `${tooltipPosition.left || 0}px`,
        transform:
          tooltipPosition.finalPosition === "top"
            ? "translateY(-100%)"
            : tooltipPosition.finalPosition === "left"
              ? "translateX(-100%)"
              : "none",
      }}
    >
      {typeof content === "string" ? (
        <span className="whitespace-pre-wrap">{content}</span>
      ) : (
        content
      )}
      {/* Arrow - positioned dynamically based on trigger location */}
      <div
        className={`absolute w-2 h-2 transform rotate-45`}
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
          borderWidth:
            tooltipPosition.finalPosition === "top"
              ? "0 1px 1px 0"
              : tooltipPosition.finalPosition === "bottom"
                ? "1px 0 0 1px"
                : tooltipPosition.finalPosition === "left"
                  ? "1px 1px 0 0"
                  : "0 0 1px 1px",
          // Position arrow based on actual position
          ...(tooltipPosition.finalPosition === "top" && {
            bottom: "-4px",
            left: `${tooltipPosition.arrowOffset || 24}px`,
          }),
          ...(tooltipPosition.finalPosition === "bottom" && {
            top: "-4px",
            left: `${tooltipPosition.arrowOffset || 24}px`,
          }),
          ...(tooltipPosition.finalPosition === "left" && {
            right: "-4px",
            top: "16px",
          }),
          ...(tooltipPosition.finalPosition === "right" && {
            left: "-4px",
            top: "16px",
          }),
        }}
      />
    </div>
  );

  return (
    <>
      <div
        ref={triggerRef}
        className={`inline-block align-middle ${className}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        style={clickable ? { cursor: "pointer" } : undefined}
      >
        {children}
      </div>
      {isVisible && createPortal(tooltipContent, document.body)}
    </>
  );
};

export default Tooltip;
