import {
  LucideArrowLeft,
  LucideArrowLeftToLine,
  LucideArrowRight,
  LucideArrowRightToLine,
} from "lucide-react";
import Button from "./Button.jsx";

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
}) => {
  if (!totalPages || totalPages <= 1) return null;

  const perPageOptions = [12, 24, 36, 48, 60, 72, 84, 96, 108, 120];

  // Generate array of all page numbers for dropdown
  const allPages = Array.from({ length: totalPages }, (_, i) => i + 1);

  // Calculate record range for current page
  const startRecord = (currentPage - 1) * perPage + 1;
  const endRecord = Math.min(currentPage * perPage, totalCount || 0);

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-center gap-4 mt-4 w-full ${className}`}
    >
      {showInfo && totalCount && (
        <div style={{ color: "var(--text-muted)" }} className="text-sm">
          Showing {startRecord}-{endRecord} of {totalCount} records
        </div>
      )}

      <nav className="flex items-center gap-2 w-full sm:w-auto justify-center">
        {/* First Page Button */}
        <Button
          onClick={() => onPageChange?.(1)}
          disabled={currentPage <= 1}
          variant="secondary"
          size="sm"
          title="First Page"
          aria-label="First Page"
          icon={<LucideArrowLeftToLine size={16} />}
        />

        {/* Previous Page Button */}
        <Button
          onClick={() => onPageChange?.(currentPage - 1)}
          disabled={currentPage <= 1}
          variant="secondary"
          size="sm"
          title="Previous Page"
          aria-label="Previous Page"
          icon={<LucideArrowLeft size={16} />}
        />

        {/* Page Dropdown */}
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

        {/* Next Page Button */}
        <Button
          onClick={() => onPageChange?.(currentPage + 1)}
          disabled={currentPage >= totalPages}
          variant="secondary"
          size="sm"
          title="Next Page"
          aria-label="Next Page"
          icon={<LucideArrowRight size={16} />}
        />

        {/* Last Page Button */}
        <Button
          onClick={() => onPageChange?.(totalPages)}
          disabled={currentPage >= totalPages}
          variant="secondary"
          size="sm"
          title="Last Page"
          aria-label="Last Page"
          icon={<LucideArrowRightToLine size={16} />}
        />
      </nav>

      {showPerPageSelector && onPerPageChange && (
        <div className="flex items-center gap-2 w-full sm:w-auto justify-center">
          <label
            htmlFor="perPage"
            className="text-sm whitespace-nowrap"
            style={{ color: "var(--text-muted)" }}
          >
            Per Page:
          </label>
          <select
            id="perPage"
            value={perPage}
            onChange={(e) => onPerPageChange(parseInt(e.target.value))}
            className="px-3 py-1 rounded text-sm font-medium transition-colors"
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
      )}
    </div>
  );
};

export default Pagination;
