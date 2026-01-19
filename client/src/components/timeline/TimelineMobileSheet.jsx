// client/src/components/timeline/TimelineMobileSheet.jsx
import { memo, useState, useRef, useCallback } from "react";
import { ChevronUp } from "lucide-react";

const MINIMIZED_HEIGHT = 48; // Just handle + selection info
const SWIPE_THRESHOLD = 50; // Minimum swipe distance to trigger state change

/**
 * Mobile-friendly bottom sheet for the timeline.
 * Tap or swipe the drag handle to toggle between minimized and expanded states.
 * When expanded, shows full timeline controls matching desktop layout.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the sheet is visible
 * @param {Object} props.selectedPeriod - Currently selected period { period, label }
 * @param {number} props.itemCount - Number of items in selected period
 * @param {React.ReactNode} props.children - Timeline controls and strip content
 */
function TimelineMobileSheet({
  isOpen,
  selectedPeriod,
  itemCount = 0,
  children,
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const touchStartY = useRef(null);
  const touchStartTime = useRef(null);

  const toggleExpanded = useCallback(() => setIsExpanded((prev) => !prev), []);
  const itemText = itemCount === 1 ? "item" : "items";

  // Touch handlers for swipe gestures
  const handleTouchStart = useCallback((e) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartTime.current = Date.now();
  }, []);

  const handleTouchEnd = useCallback((e) => {
    if (touchStartY.current === null) return;

    const touchEndY = e.changedTouches[0].clientY;
    const deltaY = touchEndY - touchStartY.current;
    const deltaTime = Date.now() - touchStartTime.current;

    // Check if swipe was fast enough or long enough
    const isValidSwipe = Math.abs(deltaY) > SWIPE_THRESHOLD ||
      (Math.abs(deltaY) > 20 && deltaTime < 300);

    if (isValidSwipe) {
      if (deltaY > 0 && isExpanded) {
        // Swipe down while expanded -> minimize
        setIsExpanded(false);
        e.preventDefault();
      } else if (deltaY < 0 && !isExpanded) {
        // Swipe up while minimized -> expand
        setIsExpanded(true);
        e.preventDefault();
      }
    }

    touchStartY.current = null;
    touchStartTime.current = null;
  }, [isExpanded]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      data-testid="timeline-mobile-sheet"
      className="fixed bottom-0 left-0 right-0 shadow-lg z-50 transition-all duration-300 ease-out"
      style={{
        backgroundColor: "var(--bg-primary)",
        borderTop: "1px solid var(--border-color)",
        // Only set fixed height when minimized; expanded uses auto height
        ...(isExpanded ? {} : { height: `${MINIMIZED_HEIGHT}px`, overflow: "hidden" }),
      }}
    >
      {/* Tappable/swipeable header with drag handle */}
      <button
        type="button"
        data-testid="sheet-header"
        className="w-full flex items-center justify-between px-4 py-2 cursor-pointer touch-none"
        onClick={toggleExpanded}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        aria-expanded={isExpanded}
        aria-label={isExpanded ? "Minimize timeline" : "Expand timeline"}
      >
        {/* Left: Selection info when minimized */}
        <div className="flex items-center gap-2 text-sm">
          {!isExpanded && selectedPeriod && (
            <span className="font-medium" style={{ color: "var(--text-primary)" }}>
              {selectedPeriod.label}
            </span>
          )}
          {!isExpanded && (
            <span style={{ color: "var(--text-secondary)" }}>
              {itemCount} {itemText}
            </span>
          )}
        </div>

        {/* Center: Drag handle */}
        <div className="flex-1 flex justify-center">
          <div
            data-testid="drag-handle"
            className="w-10 h-1 rounded-full"
            style={{ backgroundColor: "var(--border-color)" }}
          />
        </div>

        {/* Right: Chevron indicator */}
        <div className="flex items-center">
          <ChevronUp
            data-testid="chevron-icon"
            className={`w-5 h-5 transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}
            style={{ color: "var(--text-secondary)" }}
          />
        </div>
      </button>

      {/* Timeline content - visible when expanded */}
      {isExpanded && (
        <div className="overflow-hidden pb-4">
          {children}
        </div>
      )}
    </div>
  );
}

export default memo(TimelineMobileSheet);
