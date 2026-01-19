// client/src/components/timeline/TimelineMobileSheet.jsx
import { memo, useState } from "react";
import { ChevronUp } from "lucide-react";

const MINIMIZED_HEIGHT = 48; // Minimized state height in pixels
const EXPANDED_HEIGHT = 200; // Expanded state height in pixels

/**
 * Mobile-friendly bottom sheet wrapper for the timeline.
 * Can be minimized or expanded to show full timeline controls.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the sheet is visible
 * @param {Function} props.onDismiss - Callback when sheet is dismissed
 * @param {Object} props.selectedPeriod - Selected period { period, label }
 * @param {number} props.itemCount - Number of items in the selected period
 * @param {React.ReactNode} props.children - Timeline controls and strip content
 */
function TimelineMobileSheet({
  isOpen,
  onDismiss: _onDismiss, // eslint-disable-line no-unused-vars -- Reserved for future swipe-down dismiss
  selectedPeriod,
  itemCount,
  children,
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!isOpen) {
    return null;
  }

  const toggleExpanded = () => {
    setIsExpanded((prev) => !prev);
  };

  const height = isExpanded ? EXPANDED_HEIGHT : MINIMIZED_HEIGHT;
  const itemText = itemCount === 1 ? "item" : "items";

  return (
    <div
      data-testid="timeline-mobile-sheet"
      className="fixed bottom-0 left-0 right-0 bg-bg-primary border-t border-border-primary
        shadow-lg transition-all duration-300 ease-out z-50"
      style={{ height: `${height}px` }}
    >
      {/* Clickable header area */}
      <button
        type="button"
        data-testid="sheet-header"
        className="w-full flex items-center justify-between px-4 py-2 cursor-pointer
          hover:bg-bg-secondary/50 transition-colors"
        onClick={toggleExpanded}
        aria-expanded={isExpanded}
        aria-label="Toggle timeline panel"
      >
        {/* Drag handle */}
        <div className="flex-1 flex justify-center">
          <div
            data-testid="drag-handle"
            className="w-10 h-1 rounded-full bg-border-secondary"
          />
        </div>

        {/* Selected period and count info */}
        <div className="flex items-center gap-2 text-sm">
          {selectedPeriod && (
            <span className="text-text-primary font-medium">
              {selectedPeriod.label}
            </span>
          )}
          <span className="text-text-secondary">
            {itemCount} {itemText}
          </span>
        </div>

        {/* Chevron indicator */}
        <div className="flex-1 flex justify-end">
          <ChevronUp
            data-testid="chevron-icon"
            className={`w-5 h-5 text-text-secondary transition-transform duration-300
              ${isExpanded ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {/* Content area - visible when expanded */}
      <div
        className={`px-4 overflow-hidden transition-opacity duration-300
          ${isExpanded ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      >
        {children}
      </div>
    </div>
  );
}

export default memo(TimelineMobileSheet);
