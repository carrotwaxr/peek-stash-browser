import { useMemo } from "react";
import {
  LucideArrowLeft,
  LucideArrowLeftToLine,
  LucideArrowRight,
  LucideArrowRightToLine,
} from "lucide-react";
import Button from "./Button.jsx";
import { useTVMode } from "../../hooks/useTVMode.js";
import { useHorizontalNavigation } from "../../hooks/useHorizontalNavigation.js";

/**
 * Reusable pagination component
 */
const Pagination = ({
  currentPage = 1,
  totalPages,
  onPageChange,
  perPage = 24,
  onPerPageChange,
  totalCount,
  showInfo = true,
  showPerPageSelector = true,
  className = "",
  // TV Mode props
  tvActive = false,
  onEscapeUp,
  onEscapeDown,
}) => {
  const { isTVMode } = useTVMode();

  // Pagination zone items: First, Prev, PageSelect, Next, Last, PerPageSelect
  const paginationItems = useMemo(() => {
    const items = [
      { id: "first", name: "First" },
      { id: "prev", name: "Previous" },
      { id: "page-select", name: "Page" },
      { id: "next", name: "Next" },
      { id: "last", name: "Last" },
    ];
    if (showPerPageSelector && onPerPageChange) {
      items.push({ id: "per-page", name: "Per Page" });
    }
    return items;
  }, [showPerPageSelector, onPerPageChange]);

  // Horizontal navigation for pagination
  const paginationNav = useHorizontalNavigation({
    items: paginationItems,
    enabled: isTVMode && tvActive,
    onSelect: (item) => {
      const element = document.querySelector(`[data-tv-pagination-item="${item.id}"]`);
      if (element) {
        element.click();
        // For dropdowns, focus them so user can interact
        if (item.id === "page-select" || item.id === "per-page") {
          const select = element.querySelector("select");
          if (select) select.focus();
        }
      }
    },
    onEscapeUp,
    onEscapeDown,
  });
  // Don't render if no pages at all
  if (!totalPages || totalPages < 1) return null;

  const perPageOptions = [12, 24, 36, 48, 60, 72, 84, 96, 108, 120];

  // Generate array of all page numbers for dropdown
  const allPages = Array.from({ length: totalPages }, (_, i) => i + 1);

  // Calculate record range for current page
  const startRecord = (currentPage - 1) * perPage + 1;
  const endRecord = Math.min(currentPage * perPage, totalCount || 0);

  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 sm:gap-4 mt-4 w-full ${className}`}
    >
      {showInfo && totalCount && (
        <div style={{ color: "var(--text-muted)" }} className="text-sm">
          Showing {startRecord}-{endRecord} of {totalCount} records
        </div>
      )}

      {/* Navigation row - includes per-page on mobile */}
      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 w-full sm:w-auto">
        <nav className="flex items-center gap-1 sm:gap-2">
        {/* First Page Button */}
        <div
          data-tv-pagination-item="first"
          ref={(el) => paginationNav.setItemRef(0, el)}
          className={paginationNav.isFocused(0) ? "keyboard-focus" : ""}
        >
          <Button
            onClick={() => onPageChange?.(1)}
            disabled={currentPage <= 1}
            variant="secondary"
            size="sm"
            title="First Page"
            aria-label="First Page"
            icon={<LucideArrowLeftToLine size={16} />}
          />
        </div>

        {/* Previous Page Button */}
        <div
          data-tv-pagination-item="prev"
          ref={(el) => paginationNav.setItemRef(1, el)}
          className={paginationNav.isFocused(1) ? "keyboard-focus" : ""}
        >
          <Button
            onClick={() => onPageChange?.(currentPage - 1)}
            disabled={currentPage <= 1}
            variant="secondary"
            size="sm"
            title="Previous Page"
            aria-label="Previous Page"
            icon={<LucideArrowLeft size={16} />}
          />
        </div>

        {/* Page Dropdown */}
        <div
          data-tv-pagination-item="page-select"
          ref={(el) => paginationNav.setItemRef(2, el)}
          className={paginationNav.isFocused(2) ? "keyboard-focus" : ""}
        >
          <select
            value={currentPage}
            onChange={(e) => onPageChange?.(parseInt(e.target.value))}
            className="px-3 py-1 rounded text-sm font-medium transition-colors flex-grow sm:flex-grow-0"
            style={{
              backgroundColor: "var(--bg-card)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-color)",
              height: "1.8rem",
            }}
          >
            {allPages.map((page) => (
              <option key={page} value={page}>
                {page} of {totalPages}
              </option>
            ))}
          </select>
        </div>

        {/* Next Page Button */}
        <div
          data-tv-pagination-item="next"
          ref={(el) => paginationNav.setItemRef(3, el)}
          className={paginationNav.isFocused(3) ? "keyboard-focus" : ""}
        >
          <Button
            onClick={() => onPageChange?.(currentPage + 1)}
            disabled={currentPage >= totalPages}
            variant="secondary"
            size="sm"
            title="Next Page"
            aria-label="Next Page"
            icon={<LucideArrowRight size={16} />}
          />
        </div>

        {/* Last Page Button */}
        <div
          data-tv-pagination-item="last"
          ref={(el) => paginationNav.setItemRef(4, el)}
          className={paginationNav.isFocused(4) ? "keyboard-focus" : ""}
        >
          <Button
            onClick={() => onPageChange?.(totalPages)}
            disabled={currentPage >= totalPages}
            variant="secondary"
            size="sm"
            title="Last Page"
            aria-label="Last Page"
            icon={<LucideArrowRightToLine size={16} />}
          />
        </div>
        </nav>

        {showPerPageSelector && onPerPageChange && (
          <div className="flex items-center gap-2">
            <label
              htmlFor="perPage"
              className="hidden sm:block text-sm whitespace-nowrap"
              style={{ color: "var(--text-muted)" }}
            >
              Per Page:
            </label>
            <div
              data-tv-pagination-item="per-page"
              ref={(el) => paginationNav.setItemRef(5, el)}
              className={paginationNav.isFocused(5) ? "keyboard-focus" : ""}
            >
              <select
                id="perPage"
                value={perPage}
                onChange={(e) => onPerPageChange(parseInt(e.target.value))}
                className="px-2 sm:px-3 py-1 rounded text-sm font-medium transition-colors"
                style={{
                  backgroundColor: "var(--bg-card)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-color)",
                  height: "1.8rem",
                }}
              >
                {perPageOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Pagination;
