import { useRef, useEffect, useState, forwardRef } from "react";
import { useSpatialNavigation } from "../../hooks/useSpatialNavigation.js";

/**
 * Generic navigable grid component with keyboard navigation
 * Supports any type of items (performers, studios, tags, etc.)
 */
const NavigableGrid = ({
  items = [],
  renderItem,
  onItemClick,
  gridClassName = "grid gap-6",
  currentPage = 1,
  totalPages = 1,
  onPageChange,
  enableKeyboard = true,
  emptyMessage = "No items found",
  emptyDescription = "Try adjusting your search filters",
}) => {
  const gridRef = useRef();
  const [columns, setColumns] = useState(4);

  // Calculate grid columns based on screen width and grid classes
  // Matches the actual rendered layout
  const getColumns = () => {
    if (typeof window === "undefined") return 4;
    const width = window.innerWidth;

    // Check if this is a performer grid (6 columns at 2xl)
    if (gridClassName.includes("2xl:grid-cols-6")) {
      if (width >= 1536) return 6; // 2xl
      if (width >= 1280) return 5; // xl
      if (width >= 1024) return 4; // lg
      if (width >= 768) return 3;  // md
      if (width >= 640) return 2;  // sm
      return 1; // xs
    }

    // Studios/Tags use 3 columns max
    if (gridClassName.includes("lg:grid-cols-3")) {
      if (width >= 1024) return 3; // lg
      if (width >= 768) return 2;  // md
      return 1; // base
    }

    // Default fallback
    if (width >= 1280) return 6;
    if (width >= 1024) return 5;
    if (width >= 768) return 4;
    if (width >= 640) return 3;
    return 2;
  };

  // Spatial navigation hook
  const { focusedIndex: _focusedIndex, setItemRef, isFocused } = useSpatialNavigation({
    items,
    columns,
    enabled: enableKeyboard,
    onSelect: onItemClick,
    onPageUp: () => onPageChange && currentPage > 1 && onPageChange(currentPage - 1),
    onPageDown: () => onPageChange && currentPage < totalPages && onPageChange(currentPage + 1),
  });

  // Update columns on resize
  useEffect(() => {
    const updateColumns = () => {
      setColumns(getColumns());
    };

    updateColumns(); // Initial calculation
    window.addEventListener("resize", updateColumns);
    return () => window.removeEventListener("resize", updateColumns);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridClassName]);

  // Set initial focus when grid loads
  useEffect(() => {
    if (enableKeyboard && items?.length > 0 && gridRef.current) {
      const firstFocusable = gridRef.current.querySelector('[tabindex="0"]');
      if (firstFocusable) {
        firstFocusable.focus();
      }
    }
  }, [enableKeyboard, items]);

  if (!items || items.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="text-6xl mb-4" style={{ color: "var(--text-muted)" }}>
            📂
          </div>
          <h3
            className="text-xl font-medium mb-2"
            style={{ color: "var(--text-primary)" }}
          >
            {emptyMessage}
          </h3>
          <p style={{ color: "var(--text-secondary)" }}>{emptyDescription}</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={gridRef} className={gridClassName}>
      {items.map((item, index) =>
        renderItem(item, {
          ref: (el) => setItemRef(index, el),
          tabIndex: enableKeyboard ? (isFocused(index) ? 0 : -1) : -1,
          className: isFocused(index) ? "keyboard-focus" : "",
          onFocus: () => {}, // Placeholder for future use
        })
      )}
    </div>
  );
};

/**
 * Higher-order component to make any card component keyboard-focusable
 */
// eslint-disable-next-line react-refresh/only-export-components, no-unused-vars
export const makeNavigable = (CardComponent) => {
  return forwardRef((props, ref) => {
    const { tabIndex, className = "", onFocus, onClick, item, ...rest } = props;

    const handleClick = (e) => {
      e.preventDefault();
      onClick?.(item);
    };

    const handleKeyDown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick?.(item);
      }
    };

    return (
      <div
        ref={ref}
        tabIndex={tabIndex}
        className={className}
        onFocus={onFocus}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role="button"
      >
        <CardComponent {...rest} item={item} />
      </div>
    );
  });
};

export default NavigableGrid;
