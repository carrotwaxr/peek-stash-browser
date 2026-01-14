import { useState } from "react";
import {
  LucideChevronUp,
  LucideChevronDown,
  LucideChevronsUp,
  LucideChevronsDown,
} from "lucide-react";
import {
  getColumnsForEntity,
  getDefaultVisibleColumns,
  getDefaultColumnOrder,
} from "../../config/tableColumns.js";
import Button from "../ui/Button.jsx";

const ENTITY_TYPES = [
  { id: "scene", label: "Scenes" },
  { id: "performer", label: "Performers" },
  { id: "studio", label: "Studios" },
  { id: "tag", label: "Tags" },
  { id: "gallery", label: "Galleries" },
  { id: "image", label: "Images" },
  { id: "group", label: "Groups" },
];

/**
 * Settings component for configuring default table columns per entity type.
 */
const TableColumnSettings = ({ tableColumnDefaults, onSave }) => {
  const [activeEntity, setActiveEntity] = useState("scene");
  const [localDefaults, setLocalDefaults] = useState(tableColumnDefaults || {});
  const [hasChanges, setHasChanges] = useState(false);

  // Get current entity's columns config
  const allColumns = getColumnsForEntity(activeEntity);
  const currentConfig = localDefaults[activeEntity] || {
    visible: getDefaultVisibleColumns(activeEntity),
    order: getDefaultColumnOrder(activeEntity),
  };

  const handleToggleColumn = (columnId) => {
    const column = allColumns.find((c) => c.id === columnId);
    if (column?.mandatory) return;

    const newVisible = currentConfig.visible.includes(columnId)
      ? currentConfig.visible.filter((id) => id !== columnId)
      : [...currentConfig.visible, columnId];

    setLocalDefaults((prev) => ({
      ...prev,
      [activeEntity]: {
        ...currentConfig,
        visible: newVisible,
      },
    }));
    setHasChanges(true);
  };

  const handleMoveColumn = (columnId, direction) => {
    const currentIndex = currentConfig.order.indexOf(columnId);
    if (currentIndex === -1) return;

    let newIndex;
    switch (direction) {
      case "top":
        newIndex = 0;
        break;
      case "up":
        newIndex = Math.max(0, currentIndex - 1);
        break;
      case "down":
        newIndex = Math.min(currentConfig.order.length - 1, currentIndex + 1);
        break;
      case "bottom":
        newIndex = currentConfig.order.length - 1;
        break;
      default:
        return;
    }

    if (newIndex === currentIndex) return;

    const newOrder = [...currentConfig.order];
    newOrder.splice(currentIndex, 1);
    newOrder.splice(newIndex, 0, columnId);

    setLocalDefaults((prev) => ({
      ...prev,
      [activeEntity]: {
        ...currentConfig,
        order: newOrder,
      },
    }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    await onSave(localDefaults);
    setHasChanges(false);
  };

  const handleReset = () => {
    setLocalDefaults((prev) => ({
      ...prev,
      [activeEntity]: {
        visible: getDefaultVisibleColumns(activeEntity),
        order: getDefaultColumnOrder(activeEntity),
      },
    }));
    setHasChanges(true);
  };

  // Get columns in current order
  const orderedColumns = currentConfig.order
    .map((id) => allColumns.find((col) => col.id === id))
    .filter(Boolean);

  // Add any missing columns
  const missingColumns = allColumns.filter(
    (col) => !currentConfig.order.includes(col.id)
  );
  const allOrderedColumns = [...orderedColumns, ...missingColumns];

  return (
    <div>
      <h3
        className="text-lg font-semibold mb-4"
        style={{ color: "var(--text-primary)" }}
      >
        Table View Default Columns
      </h3>
      <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
        Configure which columns are shown by default when switching to table
        view.
      </p>

      {/* Entity type tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {ENTITY_TYPES.map((entity) => (
          <button
            key={entity.id}
            onClick={() => setActiveEntity(entity.id)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              activeEntity === entity.id ? "font-medium" : ""
            }`}
            style={{
              backgroundColor:
                activeEntity === entity.id
                  ? "var(--accent-primary)"
                  : "var(--bg-secondary)",
              color:
                activeEntity === entity.id ? "white" : "var(--text-secondary)",
            }}
          >
            {entity.label}
          </button>
        ))}
      </div>

      {/* Column list */}
      <div
        className="border rounded-lg overflow-hidden mb-4"
        style={{ borderColor: "var(--border-color)" }}
      >
        {allOrderedColumns.map((column, index) => {
          const isVisible =
            column.mandatory || currentConfig.visible.includes(column.id);
          const isFirst = index === 0;
          const isLast = index === allOrderedColumns.length - 1;

          return (
            <div
              key={column.id}
              className="flex items-center gap-2 px-4 py-2 border-b last:border-b-0"
              style={{
                borderColor: "var(--border-color)",
                backgroundColor: isVisible
                  ? "transparent"
                  : "var(--bg-secondary)",
              }}
            >
              <input
                type="checkbox"
                checked={isVisible}
                disabled={column.mandatory}
                onChange={() => handleToggleColumn(column.id)}
                className="w-4 h-4 rounded cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                style={{ accentColor: "var(--accent-primary)" }}
              />

              <span
                className={`flex-1 text-sm ${column.mandatory ? "font-medium" : ""}`}
                style={{
                  color: isVisible
                    ? "var(--text-primary)"
                    : "var(--text-muted)",
                }}
              >
                {column.label}
                {column.mandatory && (
                  <span
                    className="text-xs ml-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    (required)
                  </span>
                )}
              </span>

              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => handleMoveColumn(column.id, "top")}
                  disabled={isFirst}
                  className="p-1 rounded hover:bg-opacity-80 disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <LucideChevronsUp size={14} />
                </button>
                <button
                  onClick={() => handleMoveColumn(column.id, "up")}
                  disabled={isFirst}
                  className="p-1 rounded hover:bg-opacity-80 disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <LucideChevronUp size={14} />
                </button>
                <button
                  onClick={() => handleMoveColumn(column.id, "down")}
                  disabled={isLast}
                  className="p-1 rounded hover:bg-opacity-80 disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <LucideChevronDown size={14} />
                </button>
                <button
                  onClick={() => handleMoveColumn(column.id, "bottom")}
                  disabled={isLast}
                  className="p-1 rounded hover:bg-opacity-80 disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <LucideChevronsDown size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="secondary" size="sm" onClick={handleReset}>
          Reset to Defaults
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          disabled={!hasChanges}
        >
          Save Changes
        </Button>
      </div>
    </div>
  );
};

export default TableColumnSettings;
