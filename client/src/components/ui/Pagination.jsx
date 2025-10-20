/**
 * Reusable pagination component
 */
const Pagination = ({
  currentPage = 1,
  totalPages,
  onPageChange,
  perPage = 24,
  onPerPageChange,
  showInfo = true,
  showPerPageSelector = true,
  className = "",
}) => {
  if (!totalPages || totalPages <= 1) return null;

  const perPageOptions = [12, 24, 36, 48, 60, 72, 84, 96, 108, 120];

  // Generate array of all page numbers for dropdown
  const allPages = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-center gap-4 mt-4 w-full ${className}`}
    >
      {showInfo && (
        <div style={{ color: "var(--text-muted)" }} className="text-sm">
          Page {currentPage} of {totalPages}
        </div>
      )}

      <nav className="flex items-center gap-2 w-full sm:w-auto justify-center">
        {/* First Page Button */}
        <button
          onClick={() => onPageChange?.(1)}
          disabled={currentPage <= 1}
          className={`
            px-4 py-3 sm:px-2 sm:py-1 rounded text-sm font-medium transition-colors
            ${
              currentPage <= 1
                ? "opacity-50 cursor-not-allowed"
                : "hover:opacity-70"
            }
          `}
          style={{
            backgroundColor: "var(--bg-card)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-color)",
          }}
          title="First Page"
        >
          «
        </button>

        {/* Previous Page Button */}
        <button
          onClick={() => onPageChange?.(currentPage - 1)}
          disabled={currentPage <= 1}
          className={`
            px-4 py-3 sm:px-2 sm:py-1 rounded text-sm font-medium transition-colors
            ${
              currentPage <= 1
                ? "opacity-50 cursor-not-allowed"
                : "hover:opacity-70"
            }
          `}
          style={{
            backgroundColor: "var(--bg-card)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-color)",
          }}
          title="Previous Page"
        >
          ‹
        </button>

        {/* Page Dropdown */}
        <select
          value={currentPage}
          onChange={(e) => onPageChange?.(parseInt(e.target.value))}
          className="px-4 py-3 sm:px-3 sm:py-1 rounded text-sm font-medium transition-colors flex-grow sm:flex-grow-0"
          style={{
            backgroundColor: "var(--bg-card)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-color)",
          }}
        >
          {allPages.map((page) => (
            <option key={page} value={page}>
              {page} of {totalPages}
            </option>
          ))}
        </select>

        {/* Next Page Button */}
        <button
          onClick={() => onPageChange?.(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className={`
            px-4 py-3 sm:px-2 sm:py-1 rounded text-sm font-medium transition-colors
            ${
              currentPage >= totalPages
                ? "opacity-50 cursor-not-allowed"
                : "hover:opacity-70"
            }
          `}
          style={{
            backgroundColor: "var(--bg-card)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-color)",
          }}
          title="Next Page"
        >
          ›
        </button>

        {/* Last Page Button */}
        <button
          onClick={() => onPageChange?.(totalPages)}
          disabled={currentPage >= totalPages}
          className={`
            px-4 py-3 sm:px-2 sm:py-1 rounded text-sm font-medium transition-colors
            ${
              currentPage >= totalPages
                ? "opacity-50 cursor-not-allowed"
                : "hover:opacity-70"
            }
          `}
          style={{
            backgroundColor: "var(--bg-card)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-color)",
          }}
          title="Last Page"
        >
          »
        </button>
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
            className="px-4 py-3 sm:px-3 sm:py-1 rounded text-sm font-medium transition-colors"
            style={{
              backgroundColor: "var(--bg-card)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-color)",
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
