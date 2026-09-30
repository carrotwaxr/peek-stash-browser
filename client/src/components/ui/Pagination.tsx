import { useEffect, useState } from "react";
import { PER_PAGE_MAX } from "@peek/shared-types";
import {
  LucideArrowLeft,
  LucideArrowLeftToLine,
  LucideArrowRight,
  LucideArrowRightToLine,
} from "lucide-react";
import Button from "./Button";

interface Props {
  currentPage?: number;
  totalPages: number;
  onPageChange?: (page: number) => void;
  perPage?: number;
  onPerPageChange?: (perPage: number) => void;
  totalCount?: number;
  showInfo?: boolean;
  showPerPageSelector?: boolean;
  className?: string;
}

/**
 * Reusable pagination component
 */
// Common per-page presets
const PER_PAGE_PRESETS = [12, 24, 48, 96, 120];

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
}: Props) => {
  const [customInput, setCustomInput] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customError, setCustomError] = useState(false);

  // Determine if current perPage is a preset or custom
  const isPreset = PER_PAGE_PRESETS.includes(perPage);

  // Sync custom input visibility when perPage changes externally
  useEffect(() => {
    if (isPreset) {
      setShowCustomInput(false);
      setCustomInput("");
      setCustomError(false);
    } else {
      setShowCustomInput(true);
      setCustomInput(String(perPage));
      setCustomError(false);
    }
  }, [perPage, isPreset]);

  const handlePresetChange = (value: string) => {
    if (value === "custom") {
      setShowCustomInput(true);
      setCustomInput(String(perPage));
      // Focus the input after render
      setTimeout(() => {
        document.getElementById("perPageCustom")?.focus();
      }, 0);
    } else {
      const num = parseInt(value, 10);
      if (!isNaN(num) && num !== perPage) {
        onPerPageChange?.(num);
      }
      setShowCustomInput(false);
      setCustomInput("");
      setCustomError(false);
    }
  };

  const isValidPerPage = (num: number) =>
    !isNaN(num) && num >= 1 && num <= PER_PAGE_MAX;

  const handleCustomInputChange = (value: string) => {
    setCustomInput(value);
    setCustomError(!isValidPerPage(parseInt(value, 10)));
  };

  const handleCustomSubmit = () => {
    const num = parseInt(customInput, 10);
    if (isValidPerPage(num) && num !== perPage) {
      onPerPageChange?.(num);
    } else if (!isValidPerPage(num)) {
      // Reset to current value if invalid
      setCustomInput(String(perPage));
      setCustomError(false);
    }
  };

  const handleCustomKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    } else if (e.key === "Escape") {
      // Cancel custom input, revert to preset if possible
      if (isPreset) {
        setShowCustomInput(false);
        setCustomInput("");
        setCustomError(false);
      }
    }
  };

  // Don't render if no pages at all
  if (!totalPages || totalPages < 1) return null;

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
          <div>
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
          <div>
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
          <div>
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
          <div>
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
          <div>
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
            <div className="flex items-center gap-1">
              {/* Preset dropdown */}
              <select
                id="perPage"
                value={showCustomInput ? "custom" : perPage}
                onChange={(e) => handlePresetChange(e.target.value)}
                className="px-2 py-1 rounded text-sm font-medium transition-colors"
                style={{
                  backgroundColor: "var(--bg-card)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-color)",
                  height: "1.8rem",
                }}
              >
                {PER_PAGE_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>
                    {preset}
                  </option>
                ))}
                <option value="custom">Custom...</option>
              </select>

              {/* Custom input (shown when custom value selected) */}
              {showCustomInput && (
                <input
                  id="perPageCustom"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={customInput}
                  onChange={(e) => handleCustomInputChange(e.target.value)}
                  onBlur={handleCustomSubmit}
                  onKeyDown={handleCustomKeyDown}
                  placeholder={`1-${PER_PAGE_MAX}`}
                  className="w-14 px-2 py-1 rounded text-sm font-medium transition-colors text-center"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    color: customError
                      ? "var(--status-error)"
                      : "var(--text-primary)",
                    border: `1px solid ${customError ? "var(--status-error)" : "var(--border-color)"}`,
                    height: "1.8rem",
                  }}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Pagination;
