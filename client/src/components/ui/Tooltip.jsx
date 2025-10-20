import { useState, useRef, useEffect } from "react";
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
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  const hideTimeoutRef = useRef(null);

  // Update tooltip position when visibility changes
  useEffect(() => {
    if (isVisible && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      // For fixed positioning, use viewport coordinates directly (no scroll offset)

      let top = 0;
      let left = 0;

      switch (position) {
        case "top":
          top = rect.top - 8; // 8px gap above
          left = rect.left;
          break;
        case "bottom":
          top = rect.bottom + 8; // 8px gap below
          left = rect.left;
          break;
        case "left":
          top = rect.top;
          left = rect.left - 8; // 8px gap to the left
          break;
        case "right":
          top = rect.top;
          left = rect.right + 8; // 8px gap to the right
          break;
      }

      setTooltipPosition({ top, left, width: rect.width });
    }
  }, [isVisible, position]);

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

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [clickable, isVisible]);

  if (disabled || !content) {
    return children;
  }

  const handleMouseEnter = () => {
    // Clear any pending hide timeout
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setIsVisible(true);
  };

  const handleMouseLeave = () => {
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
    // Hide when mouse leaves tooltip
    setIsVisible(false);
  };

  const handleClick = (e) => {
    if (clickable) {
      e.stopPropagation();
      setIsVisible(!isVisible);
    }
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  const tooltipContent = isVisible && (
    <div
      ref={tooltipRef}
      onMouseEnter={handleTooltipMouseEnter}
      onMouseLeave={handleTooltipMouseLeave}
      className="fixed z-[9999] px-4 py-3 text-sm rounded-lg shadow-xl"
      style={{
        backgroundColor: "var(--bg-tooltip, #1f2937)",
        color: "var(--text-tooltip, white)",
        border: "1px solid var(--border-color)",
        minWidth: "200px",
        maxWidth: "400px",
        lineHeight: "1.4",
        wordWrap: "break-word",
        top: position === "top"
          ? `${tooltipPosition.top}px`
          : position === "bottom"
          ? `${tooltipPosition.top}px`
          : `${tooltipPosition.top}px`,
        left: position === "top" || position === "bottom"
          ? `${tooltipPosition.left}px`
          : position === "left"
          ? `${tooltipPosition.left}px`
          : `${tooltipPosition.left}px`,
        transform: position === "top"
          ? "translateY(-100%)"
          : position === "left"
          ? "translateX(-100%)"
          : "none",
      }}
    >
      {typeof content === "string" ? (
        <span className="whitespace-pre-wrap">{content}</span>
      ) : (
        content
      )}
      {/* Arrow */}
      <div
        className={`absolute w-2 h-2 transform rotate-45 ${
          position === "top"
            ? "bottom-0 left-6 translate-y-1/2"
            : position === "bottom"
            ? "top-0 left-6 -translate-y-1/2"
            : position === "left"
            ? "right-0 top-4 translate-x-1/2"
            : "left-0 top-4 -translate-x-1/2"
        }`}
        style={{
          backgroundColor: "var(--bg-tooltip, #1f2937)",
          borderColor: "var(--border-color)",
          borderWidth:
            position === "top"
              ? "0 1px 1px 0"
              : position === "bottom"
              ? "1px 0 0 1px"
              : position === "left"
              ? "1px 1px 0 0"
              : "0 0 1px 1px",
        }}
      />
    </div>
  );

  return (
    <>
      <div
        ref={triggerRef}
        className={`inline-block ${className}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        style={clickable ? { cursor: 'pointer' } : undefined}
      >
        {children}
      </div>
      {isVisible && createPortal(tooltipContent, document.body)}
    </>
  );
};

export default Tooltip;
