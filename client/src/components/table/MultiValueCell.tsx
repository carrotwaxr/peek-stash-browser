import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";

/**
 * Component for displaying multiple values in a table cell with truncation
 * Shows first N items comma-separated, with a "+X more" button that opens a popover
 *
 * @param {Object} props
 * @param {Array<{id: string|number, name: string, linkTo?: string}>} props.items - Array of items to display
 * @param {number} props.maxVisible - Maximum number of items to show before truncating (default: 2)
 * @param {string} props.emptyText - Text to show when items is empty (default: "-")
 */
const MultiValueCell = ({ items, maxVisible = 2, emptyText = "-" }) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef(null);
  const popoverRef = useRef(null);

  // Determine if we have items
  const hasItems = items && items.length > 0;

  // Split items into visible and hidden (only if we have items)
  const visibleItems = hasItems ? items.slice(0, maxVisible) : [];
  const hiddenItems = hasItems ? items.slice(maxVisible) : [];
  const hasMore = hiddenItems.length > 0;

  // Calculate popover position
  const calculatePosition = useCallback(() => {
    if (!buttonRef.current) return;

    const buttonRect = buttonRef.current.getBoundingClientRect();
    const GAP = 4;
    const EDGE_PADDING = 16;

    let top = buttonRect.bottom + GAP;
    let left = buttonRect.left;

    // Check if popover would go off the right edge
    const popoverWidth = 200; // Approximate width
    if (left + popoverWidth > window.innerWidth - EDGE_PADDING) {
      left = window.innerWidth - EDGE_PADDING - popoverWidth;
    }

    // Ensure left doesn't go negative
    if (left < EDGE_PADDING) {
      left = EDGE_PADDING;
    }

    setPopoverPosition({ top, left });
  }, []);

  // Handle click outside to close popover
  useEffect(() => {
    if (!isPopoverOpen) return;

    const handleClickOutside = (e) => {
      if (
        buttonRef.current &&
        !buttonRef.current.contains(e.target) &&
        popoverRef.current &&
        !popoverRef.current.contains(e.target)
      ) {
        setIsPopoverOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isPopoverOpen]);

  // Recalculate position on scroll/resize when popover is open
  useEffect(() => {
    if (!isPopoverOpen) return;

    const handleReposition = () => calculatePosition();

    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);

    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [isPopoverOpen, calculatePosition]);

  // Handle empty/null items
  if (!hasItems) {
    return (
      <span style={{ color: "var(--text-muted)" }}>
        {emptyText}
      </span>
    );
  }

  // Render a single item (as link or text)
  const renderItem = (item, isInPopover = false) => {
    if (item.linkTo) {
      return (
        <Link
          key={item.id}
          to={item.linkTo}
          onClick={() => setIsPopoverOpen(false)}
          className="hover:underline"
          style={{ color: "var(--accent-primary)" }}
        >
          {item.name}
        </Link>
      );
    }
    return (
      <span key={item.id} style={{ color: isInPopover ? "var(--text-primary)" : undefined }}>
        {item.name}
      </span>
    );
  };

  // Handle "+X more" button click
  const handleMoreClick = (e) => {
    e.stopPropagation();
    calculatePosition();
    setIsPopoverOpen(!isPopoverOpen);
  };

  // Render popover with all items
  const popoverContent = isPopoverOpen && (
    <div
      ref={popoverRef}
      className="fixed z-50 rounded-lg shadow-lg overflow-auto"
      style={{
        top: `${popoverPosition.top}px`,
        left: `${popoverPosition.left}px`,
        backgroundColor: "var(--bg-card)",
        border: "1px solid var(--border-color)",
        maxHeight: "200px",
        minWidth: "150px",
        maxWidth: "250px",
      }}
    >
      <div className="p-2 flex flex-col gap-1">
        {items.map((item) => (
          <div key={item.id} className="py-1 px-2 rounded hover:bg-[var(--bg-secondary)]">
            {renderItem(item, true)}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      {/* Visible items, comma-separated */}
      {visibleItems.map((item, index) => (
        <span key={item.id}>
          {renderItem(item)}
          {index < visibleItems.length - 1 && ", "}
        </span>
      ))}

      {/* "+X more" button */}
      {hasMore && (
        <>
          <span>, </span>
          <button
            ref={buttonRef}
            onClick={handleMoreClick}
            className="text-xs px-1.5 py-0.5 rounded-full cursor-pointer hover:opacity-80 transition-opacity"
            style={{
              backgroundColor: "var(--bg-secondary)",
              color: "var(--text-secondary)",
            }}
          >
            +{hiddenItems.length} more
          </button>
        </>
      )}

      {/* Popover rendered via portal */}
      {isPopoverOpen && createPortal(popoverContent, document.body)}
    </span>
  );
};

export default MultiValueCell;
