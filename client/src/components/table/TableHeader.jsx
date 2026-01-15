import { ArrowUp, ArrowDown } from "lucide-react";
import { getColumnSortField } from "../../config/tableColumns.js";

/**
 * TableHeader - Renders a table header row with sortable columns
 *
 * @param {Object} props
 * @param {Array<{id: string, label: string, sortable: boolean, width: string, mandatory: boolean}>} props.columns - Column definitions
 * @param {Object} props.sort - Current sort state { field, direction }
 * @param {Function} props.onSort - Called when sortable header clicked (field, direction)
 * @param {Function} props.onColumnContextMenu - Called on right-click for non-mandatory columns (columnId, event)
 * @param {string} props.entityType - Entity type for sort field mapping
 * @param {React.ReactNode} props.columnsPopover - Optional columns config popover to render in first header cell
 */
const TableHeader = ({
  columns,
  sort,
  onSort,
  onColumnContextMenu,
  entityType,
  columnsPopover,
}) => {
  /**
   * Handle click on a sortable column header
   * - If clicking the same column that's sorted: toggle direction
   * - If clicking a different column: default to DESC
   */
  const handleHeaderClick = (column) => {
    if (!column.sortable || !onSort) return;

    const sortField = getColumnSortField(column.id, entityType);
    let newDirection;

    if (sort?.field === sortField) {
      // Toggle direction: DESC -> ASC, ASC -> DESC
      newDirection = sort.direction === "DESC" ? "ASC" : "DESC";
    } else {
      // New column, default to DESC
      newDirection = "DESC";
    }

    onSort(sortField, newDirection);
  };

  /**
   * Handle right-click on a column header
   * Only triggers for non-mandatory columns
   */
  const handleContextMenu = (column, event) => {
    if (column.mandatory || !onColumnContextMenu) return;

    event.preventDefault();
    onColumnContextMenu(column.id, event);
  };

  /**
   * Check if a column is the current sort column
   */
  const isCurrentSortColumn = (column) => {
    if (!sort?.field) return false;
    const sortField = getColumnSortField(column.id, entityType);
    return sort.field === sortField;
  };

  /**
   * Render sort indicator icon
   */
  const renderSortIcon = (column) => {
    if (!column.sortable || !isCurrentSortColumn(column)) return null;

    const Icon = sort.direction === "ASC" ? ArrowUp : ArrowDown;
    return <Icon size={14} className="ml-1.5 inline-block flex-shrink-0" />;
  };

  return (
    <thead>
      <tr
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderBottom: "1px solid var(--border-color)",
        }}
      >
        {/* Columns config button - always first cell */}
        {columnsPopover && (
          <th
            className="w-10 px-2 py-2"
            style={{ color: "var(--text-primary)" }}
          >
            {columnsPopover}
          </th>
        )}
        {columns.map((column) => {
          const isSortable = column.sortable;
          const isSorted = isCurrentSortColumn(column);

          return (
            <th
              key={column.id}
              className={`${column.width} px-4 py-2 text-left text-sm font-medium select-none ${
                isSortable ? "cursor-pointer hover:opacity-80" : ""
              }`}
              style={{
                color: isSorted
                  ? "var(--accent-secondary)"
                  : "var(--text-primary)",
                opacity: isSortable ? 1 : 0.7,
              }}
              onClick={() => handleHeaderClick(column)}
              onContextMenu={(e) => handleContextMenu(column, e)}
            >
              <span className="inline-flex items-center">
                {column.label}
                {renderSortIcon(column)}
              </span>
            </th>
          );
        })}
      </tr>
    </thead>
  );
};

export default TableHeader;
