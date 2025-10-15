/**
 * Reusable pagination component
 */
const Pagination = ({
  currentPage = 1,
  totalPages,
  onPageChange,
  showInfo = true,
  className = "",
  maxVisiblePages = 5,
}) => {
  if (!totalPages || totalPages <= 1) return null;

  const getVisiblePages = () => {
    const pages = [];
    const half = Math.floor(maxVisiblePages / 2);

    let start = Math.max(1, currentPage - half);
    let end = Math.min(totalPages, start + maxVisiblePages - 1);

    if (end - start + 1 < maxVisiblePages) {
      start = Math.max(1, end - maxVisiblePages + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    return pages;
  };

  const visiblePages = getVisiblePages();

  return (
    <div className={`flex items-center justify-center gap-4 ${className}`}>
      {showInfo && (
        <div style={{ color: "var(--text-muted)" }} className="text-sm">
          Page {currentPage} of {totalPages}
        </div>
      )}

      <nav className="flex items-center space-x-1">
        <button
          onClick={() => onPageChange?.(currentPage - 1)}
          disabled={currentPage <= 1}
          className={`
            px-3 py-1 rounded text-sm font-medium transition-colors
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
        >
          Previous
        </button>

        {visiblePages[0] > 1 && (
          <>
            <button
              onClick={() => onPageChange?.(1)}
              className="px-3 py-1 rounded text-sm font-medium hover:opacity-70 transition-colors"
              style={{
                backgroundColor: "var(--bg-card)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-color)",
              }}
            >
              1
            </button>
            {visiblePages[0] > 2 && (
              <span className="px-2" style={{ color: "var(--text-muted)" }}>
                ...
              </span>
            )}
          </>
        )}

        {visiblePages.map((page) => (
          <button
            key={page}
            onClick={() => onPageChange?.(page)}
            className={`
              px-3 py-1 rounded text-sm font-medium transition-colors
              ${
                currentPage === page
                  ? "bg-blue-600 text-white"
                  : "hover:opacity-70"
              }
            `}
            style={
              currentPage === page
                ? {}
                : {
                    backgroundColor: "var(--bg-card)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-color)",
                  }
            }
          >
            {page}
          </button>
        ))}

        {visiblePages[visiblePages.length - 1] < totalPages && (
          <>
            {visiblePages[visiblePages.length - 1] < totalPages - 1 && (
              <span className="px-2" style={{ color: "var(--text-muted)" }}>
                ...
              </span>
            )}
            <button
              onClick={() => onPageChange?.(totalPages)}
              className="px-3 py-1 rounded text-sm font-medium hover:opacity-70 transition-colors"
              style={{
                backgroundColor: "var(--bg-card)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-color)",
              }}
            >
              {totalPages}
            </button>
          </>
        )}

        <button
          onClick={() => onPageChange?.(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className={`
            px-3 py-1 rounded text-sm font-medium transition-colors
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
        >
          Next
        </button>
      </nav>
    </div>
  );
};

export default Pagination;
