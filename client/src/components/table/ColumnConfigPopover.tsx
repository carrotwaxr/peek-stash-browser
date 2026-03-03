import { useEffect, useRef, useState } from "react";
import {
  Columns3 as LucideColumns3,
  ChevronUp as LucideChevronUp,
  ChevronDown as LucideChevronDown,
  ChevronsUp as LucideChevronsUp,
  ChevronsDown as LucideChevronsDown,
  X as LucideX,
} from "lucide-react";
import Button from "../ui/Button";

interface ColumnDefinition {
  id: string;
  label: string;
  mandatory?: boolean;
}

interface Props {
  allColumns: ColumnDefinition[];
  visibleColumnIds: string[];
  columnOrder: string[];
  onToggleColumn?: (columnId: string) => void;
  onMoveColumn?: (columnId: string, direction: "up" | "down" | "top" | "bottom") => void;
}

/**
 * ColumnConfigPopover - Popover component for configuring table column visibility and order
 */
const ColumnConfigPopover = ({
  allColumns,
  visibleColumnIds,
  columnOrder,
  onToggleColumn,
  onMoveColumn,
}: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
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
      .filter((col): col is ColumnDefinition => Boolean(col));
  };

  const orderedColumns = getOrderedColumns();

  // Check if column is visible
  const isColumnVisible = (columnId: string) => visibleColumnIds.includes(columnId);

  // Check if column can move in a direction
  const canMoveUp = (index: number) => index > 0;
  const canMoveDown = (index: number) => index < orderedColumns.length - 1;

  // Handle move button clicks
  const handleMoveTop = (columnId: string) => onMoveColumn?.(columnId, "top");
  const handleMoveUp = (columnId: string) => onMoveColumn?.(columnId, "up");
  const handleMoveDown = (columnId: string) => onMoveColumn?.(columnId, "down");
  const handleMoveBottom = (columnId: string) => onMoveColumn?.(columnId, "bottom");

  // Handle visibility toggle
  const handleToggle = (columnId: string) => onToggleColumn?.(columnId);

  return (
    <div className="relative">
      {/* Trigger Button */}
      <div ref={buttonRef}>
        <Button
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
      </div>

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
