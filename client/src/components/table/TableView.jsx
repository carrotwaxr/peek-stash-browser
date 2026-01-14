import { useState } from "react";
import TableHeader from "./TableHeader.jsx";
import { getCellRenderer } from "./cellRenderers.jsx";

/**
 * TableView - Main table view component for displaying entity lists
 *
 * @param {Object} props
 * @param {Array} props.items - Array of entities to display
 * @param {Array<{id: string, label: string, sortable: boolean, width: string, mandatory: boolean}>} props.columns - Array of visible column objects with metadata
 * @param {Object} props.sort - Current sort state { field, direction }
 * @param {Function} props.onSort - Called when sortable header clicked (field, direction)
 * @param {Function} props.onHideColumn - Called from context menu to hide a column (columnId)
 * @param {string} props.entityType - Entity type for cell rendering
 * @param {boolean} props.isLoading - Whether data is loading (default: false)
 */
const TableView = ({
  items,
  columns,
  sort,
  onSort,
  onHideColumn,
  entityType,
  isLoading = false,
}) => {
  // Context menu state: { columnId, x, y } or null
  const [contextMenu, setContextMenu] = useState(null);

  /**
   * Handle right-click on column header
   * Opens context menu for non-mandatory columns
   */
  const handleColumnContextMenu = (columnId, event) => {
    event.preventDefault();
    setContextMenu({
      columnId,
      x: event.clientX,
      y: event.clientY,
    });
  };

  /**
   * Close the context menu
   */
  const closeContextMenu = () => {
    setContextMenu(null);
  };

  /**
   * Handle hide column action from context menu
   */
  const handleHideColumn = () => {
    if (contextMenu && onHideColumn) {
      onHideColumn(contextMenu.columnId);
    }
    closeContextMenu();
  };

  /**
   * Render skeleton loading rows
   */
  const renderSkeletonRows = () => {
    const skeletonRows = [];
    for (let i = 0; i < 10; i++) {
      skeletonRows.push(
        <tr
          key={`skeleton-${i}`}
          style={{
            backgroundColor: i % 2 === 1 ? "var(--bg-secondary)" : "transparent",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          {columns.map((column) => (
            <td key={column.id} className={`${column.width} px-3 py-3`}>
              <div
                className="h-4 rounded animate-pulse"
                style={{ backgroundColor: "var(--bg-secondary)" }}
              />
            </td>
          ))}
        </tr>
      );
    }
    return skeletonRows;
  };

  /**
   * Render table rows for items
   */
  const renderRows = () => {
    if (!items || items.length === 0) {
      return (
        <tr>
          <td
            colSpan={columns.length}
            className="px-3 py-8 text-center"
            style={{ color: "var(--text-muted)" }}
          >
            No items found
          </td>
        </tr>
      );
    }

    return items.map((item, index) => (
      <tr
        key={item.id || index}
        className="transition-colors hover:bg-[var(--bg-card)]"
        style={{
          backgroundColor: index % 2 === 1 ? "var(--bg-secondary)" : "transparent",
          borderBottom: "1px solid var(--border-color)",
        }}
      >
        {columns.map((column) => {
          const renderer = getCellRenderer(column.id, entityType);
          const hasMaxWidth = column.width?.startsWith("max-w");
          return (
            <td
              key={column.id}
              className={`${column.width} px-3 py-2 ${hasMaxWidth ? "overflow-hidden" : ""}`}
              style={{ color: "var(--text-primary)" }}
            >
              <div className={hasMaxWidth ? "truncate" : ""}>
                {renderer(item)}
              </div>
            </td>
          );
        })}
      </tr>
    ));
  };

  return (
    <div className="w-full">
      <table className="w-full table-fixed">
        <TableHeader
          columns={columns}
          sort={sort}
          onSort={onSort}
          onColumnContextMenu={handleColumnContextMenu}
          entityType={entityType}
        />
        <tbody>
          {isLoading ? renderSkeletonRows() : renderRows()}
        </tbody>
      </table>

      {/* Context Menu */}
      {contextMenu && (
        <>
          {/* Backdrop to close menu on click */}
          <div
            className="fixed inset-0 z-40"
            onClick={closeContextMenu}
          />
          {/* Menu */}
          <div
            className="fixed z-50 rounded-lg shadow-lg min-w-[120px]"
            style={{
              top: `${contextMenu.y}px`,
              left: `${contextMenu.x}px`,
              backgroundColor: "var(--bg-card)",
              border: "1px solid var(--border-color)",
            }}
          >
            <button
              onClick={handleHideColumn}
              className="w-full px-4 py-2 text-left text-sm hover:opacity-80 transition-opacity"
              style={{ color: "var(--text-primary)" }}
            >
              Hide column
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default TableView;
