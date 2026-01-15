import { useEffect, useRef, useState } from "react";
import {
  Columns3 as LucideColumns3,
  ChevronUp as LucideChevronUp,
  ChevronDown as LucideChevronDown,
  ChevronsUp as LucideChevronsUp,
  ChevronsDown as LucideChevronsDown,
  X as LucideX,
} from "lucide-react";
import Button from "../ui/Button.jsx";

/**
 * ColumnConfigPopover - Popover component for configuring table column visibility and order
 *
 * @param {Object} props
 * @param {Array<{id: string, label: string, mandatory?: boolean}>} props.allColumns - All column definitions
 * @param {Array<string>} props.visibleColumnIds - Array of currently visible column IDs
 * @param {Array<string>} props.columnOrder - Array of column IDs in current order
 * @param {Function} props.onToggleColumn - Called when column visibility toggled (columnId)
 * @param {Function} props.onMoveColumn - Called when column moved (columnId, direction: "up"|"down"|"top"|"bottom")
 */
const ColumnConfigPopover = ({
  allColumns,
  visibleColumnIds,
  columnOrder,
  onToggleColumn,
  onMoveColumn,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef(null);
  const buttonRef = useRef(null);

  // Close popover when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isOpen]);

  // Get columns sorted by current order
  const getOrderedColumns = () => {
    const columnMap = new Map(allColumns.map((col) => [col.id, col]));
    return columnOrder
      .map((id) => columnMap.get(id))
      .filter(Boolean);
  };

  const orderedColumns = getOrderedColumns();

  // Check if column is visible
  const isColumnVisible = (columnId) => visibleColumnIds.includes(columnId);

  // Check if column can move in a direction
  const canMoveUp = (index) => index > 0;
  const canMoveDown = (index) => index < orderedColumns.length - 1;

  // Handle move button clicks
  const handleMoveTop = (columnId) => onMoveColumn?.(columnId, "top");
  const handleMoveUp = (columnId) => onMoveColumn?.(columnId, "up");
  const handleMoveDown = (columnId) => onMoveColumn?.(columnId, "down");
  const handleMoveBottom = (columnId) => onMoveColumn?.(columnId, "bottom");

  // Handle visibility toggle
  const handleToggle = (columnId) => onToggleColumn?.(columnId);

  return (
    <div className="relative">
      {/* Trigger Button */}
      <Button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        variant="secondary"
        size="sm"
        icon={<LucideColumns3 size={16} />}
        aria-label="Columns"
        style={{
          backgroundColor: isOpen ? "var(--bg-card)" : "var(--bg-secondary)",
          borderColor: isOpen ? "var(--accent-primary)" : "var(--border-color)",
        }}
      />

      {/* Popover */}
      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute left-0 mt-2 w-[320px] rounded-lg shadow-xl z-50"
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border-color)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: "var(--border-color)" }}
          >
            <span
              className="text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              Columns
            </span>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded hover:opacity-80 transition-opacity"
              style={{ color: "var(--text-muted)" }}
              aria-label="Close"
            >
              <LucideX size={16} />
            </button>
          </div>

          {/* Column List */}
          <div className="max-h-[400px] overflow-y-auto">
            {orderedColumns.map((column, index) => {
              const isVisible = isColumnVisible(column.id);
              const isMandatory = column.mandatory;

              return (
                <div
                  key={column.id}
                  className="flex items-center gap-2 px-4 py-2"
                  style={{
                    backgroundColor: isVisible
                      ? "transparent"
                      : "var(--bg-secondary)",
                  }}
                >
                  {/* Visibility Checkbox */}
                  <input
                    type="checkbox"
                    checked={isVisible}
                    disabled={isMandatory}
                    onChange={() => handleToggle(column.id)}
                    className="w-4 h-4 rounded cursor-pointer disabled:cursor-not-allowed"
                    style={{
                      accentColor: "var(--accent-primary)",
                    }}
                  />

                  {/* Column Label */}
                  <span
                    className="flex-1 text-sm"
                    style={{
                      color: isVisible
                        ? "var(--text-primary)"
                        : "var(--text-muted)",
                    }}
                  >
                    {column.label}
                    {isMandatory && (
                      <span
                        className="ml-1 text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        (required)
                      </span>
                    )}
                  </span>

                  {/* Move Buttons */}
                  <div className="flex items-center gap-0.5">
                    {/* Jump to Top */}
                    <button
                      onClick={() => handleMoveTop(column.id)}
                      disabled={!canMoveUp(index)}
                      className="p-1 rounded hover:opacity-80 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{ color: "var(--text-secondary)" }}
                      aria-label="Move to top"
                    >
                      <LucideChevronsUp size={14} />
                    </button>

                    {/* Move Up */}
                    <button
                      onClick={() => handleMoveUp(column.id)}
                      disabled={!canMoveUp(index)}
                      className="p-1 rounded hover:opacity-80 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{ color: "var(--text-secondary)" }}
                      aria-label="Move up"
                    >
                      <LucideChevronUp size={14} />
                    </button>

                    {/* Move Down */}
                    <button
                      onClick={() => handleMoveDown(column.id)}
                      disabled={!canMoveDown(index)}
                      className="p-1 rounded hover:opacity-80 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{ color: "var(--text-secondary)" }}
                      aria-label="Move down"
                    >
                      <LucideChevronDown size={14} />
                    </button>

                    {/* Jump to Bottom */}
                    <button
                      onClick={() => handleMoveBottom(column.id)}
                      disabled={!canMoveDown(index)}
                      className="p-1 rounded hover:opacity-80 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{ color: "var(--text-secondary)" }}
                      aria-label="Move to bottom"
                    >
                      <LucideChevronsDown size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ColumnConfigPopover;
