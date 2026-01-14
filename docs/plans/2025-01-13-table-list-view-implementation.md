# Table/List View Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a table/list view mode to all entity list pages with configurable columns, sortable headers, and three-tier column preferences (system defaults → user defaults → preset-specific).

**Architecture:** Create a generic `TableView` component that renders entity-specific columns. Column configuration is managed by a `useTableColumns` hook that handles persistence. The existing `ViewModeToggle` and `useFilterState` hooks are extended to support the new view mode. Column preferences are stored in user settings and optionally saved with filter presets.

**Tech Stack:** React, Tailwind CSS, existing API patterns (axios), lucide-react icons

---

## Task 1: Define Column Configuration Constants

**Files:**
- Create: `client/src/config/tableColumns.js`

**Step 1: Create the column configuration file**

```javascript
// client/src/config/tableColumns.js

/**
 * Table column definitions for all entity types
 *
 * Each column definition includes:
 * - id: unique identifier (matches sort field where applicable)
 * - label: display name for header
 * - mandatory: if true, cannot be hidden
 * - defaultVisible: shown by default when no user preference
 * - sortable: if true, clicking header sorts by this field
 * - width: Tailwind width class (w-XX or min-w-XX)
 * - render: function to render cell content (entity) => ReactNode
 */

// Scene columns
export const SCENE_COLUMNS = [
  {
    id: "title",
    label: "Title",
    mandatory: true,
    defaultVisible: true,
    sortable: true,
    width: "min-w-[200px]",
  },
  {
    id: "thumbnail",
    label: "Thumbnail",
    mandatory: false,
    defaultVisible: true,
    sortable: false,
    width: "w-[60px]",
  },
  {
    id: "date",
    label: "Date",
    mandatory: false,
    defaultVisible: true,
    sortable: true,
    width: "w-[100px]",
  },
  {
    id: "duration",
    label: "Duration",
    mandatory: false,
    defaultVisible: true,
    sortable: true,
    width: "w-[80px]",
  },
  {
    id: "rating",
    label: "Rating",
    mandatory: false,
    defaultVisible: true,
    sortable: true,
    width: "w-[100px]",
  },
  {
    id: "studio",
    label: "Studio",
    mandatory: false,
    defaultVisible: true,
    sortable: true, // sorts by studio name
    width: "min-w-[120px]",
  },
  {
    id: "performers",
    label: "Performers",
    mandatory: false,
    defaultVisible: false,
    sortable: false,
    width: "min-w-[150px]",
  },
  {
    id: "tags",
    label: "Tags",
    mandatory: false,
    defaultVisible: false,
    sortable: false,
    width: "min-w-[150px]",
  },
  {
    id: "resolution",
    label: "Resolution",
    mandatory: false,
    defaultVisible: false,
    sortable: true,
    width: "w-[90px]",
  },
  {
    id: "filesize",
    label: "File Size",
    mandatory: false,
    defaultVisible: false,
    sortable: true,
    width: "w-[90px]",
  },
  {
    id: "play_count",
    label: "Play Count",
    mandatory: false,
    defaultVisible: false,
    sortable: true,
    width: "w-[90px]",
  },
  {
    id: "o_counter",
    label: "O Count",
    mandatory: false,
    defaultVisible: false,
    sortable: true,
    width: "w-[80px]",
  },
  {
    id: "path",
    label: "Path",
    mandatory: false,
    defaultVisible: false,
    sortable: true,
    width: "min-w-[200px]",
  },
];

// Performer columns
export const PERFORMER_COLUMNS = [
  {
    id: "name",
    label: "Name",
    mandatory: true,
    defaultVisible: true,
    sortable: true,
  },
  {
    id: "image",
    label: "Image",
    mandatory: false,
    defaultVisible: true,
    sortable: false,
    width: "w-[60px]",
  },
  {
    id: "aliases",
    label: "Aliases",
    mandatory: false,
    defaultVisible: false,
    sortable: false,
    width: "min-w-[120px]",
  },
  {
    id: "gender",
    label: "Gender",
    mandatory: false,
    defaultVisible: false,
    sortable: true,
    width: "w-[90px]",
  },
  {
    id: "rating",
    label: "Rating",
    mandatory: false,
    defaultVisible: true,
    sortable: true,
    width: "w-[100px]",
  },
  {
    id: "favorite",
    label: "Favorite",
    mandatory: false,
    defaultVisible: true,
    sortable: true,
    width: "w-[80px]",
  },
  {
    id: "age",
    label: "Age",
    mandatory: false,
    defaultVisible: false,
    sortable: true, // sorts by birthdate
    width: "w-[60px]",
  },
  {
    id: "country",
    label: "Country",
    mandatory: false,
    defaultVisible: false,
    sortable: true,
    width: "w-[100px]",
  },
  {
    id: "ethnicity",
    label: "Ethnicity",
    mandatory: false,
    defaultVisible: false,
    sortable: true,
    width: "w-[100px]",
  },
  {
    id: "scenes_count",
    label: "Scenes",
    mandatory: false,
    defaultVisible: true,
    sortable: true,
    width: "w-[70px]",
  },
  {
    id: "o_counter",
    label: "O Count",
    mandatory: false,
    defaultVisible: false,
    sortable: true,
    width: "w-[80px]",
  },
];

// Studio columns
export const STUDIO_COLUMNS = [
  {
    id: "name",
    label: "Name",
    mandatory: true,
    defaultVisible: true,
    sortable: true,
  },
  {
    id: "image",
    label: "Image",
    mandatory: false,
    defaultVisible: true,
    sortable: false,
    width: "w-[60px]",
  },
  {
    id: "rating",
    label: "Rating",
    mandatory: false,
    defaultVisible: true,
    sortable: true,
    width: "w-[100px]",
  },
  {
    id: "parent_studio",
    label: "Parent Studio",
    mandatory: false,
    defaultVisible: false,
    sortable: true,
    width: "min-w-[120px]",
  },
  {
    id: "scenes_count",
    label: "Scenes",
    mandatory: false,
    defaultVisible: true,
    sortable: true,
    width: "w-[70px]",
  },
  {
    id: "child_count",
    label: "Sub-Studios",
    mandatory: false,
    defaultVisible: false,
    sortable: true,
    width: "w-[90px]",
  },
];

// Tag columns
export const TAG_COLUMNS = [
  {
    id: "name",
    label: "Name",
    mandatory: true,
    defaultVisible: true,
    sortable: true,
  },
  {
    id: "image",
    label: "Image",
    mandatory: false,
    defaultVisible: true,
    sortable: false,
    width: "w-[60px]",
  },
  {
    id: "scenes_count",
    label: "Scenes",
    mandatory: false,
    defaultVisible: true,
    sortable: true,
    width: "w-[70px]",
  },
  {
    id: "performer_count",
    label: "Performers",
    mandatory: false,
    defaultVisible: false,
    sortable: true,
    width: "w-[90px]",
  },
  {
    id: "description",
    label: "Description",
    mandatory: false,
    defaultVisible: false,
    sortable: false,
    width: "min-w-[200px]",
  },
];

// Gallery columns
export const GALLERY_COLUMNS = [
  {
    id: "title",
    label: "Title",
    mandatory: true,
    defaultVisible: true,
    sortable: true,
  },
  {
    id: "thumbnail",
    label: "Thumbnail",
    mandatory: false,
    defaultVisible: true,
    sortable: false,
    width: "w-[60px]",
  },
  {
    id: "date",
    label: "Date",
    mandatory: false,
    defaultVisible: true,
    sortable: true,
    width: "w-[100px]",
  },
  {
    id: "rating",
    label: "Rating",
    mandatory: false,
    defaultVisible: true,
    sortable: true,
    width: "w-[100px]",
  },
  {
    id: "studio",
    label: "Studio",
    mandatory: false,
    defaultVisible: false,
    sortable: true,
    width: "min-w-[120px]",
  },
  {
    id: "performers",
    label: "Performers",
    mandatory: false,
    defaultVisible: false,
    sortable: false,
    width: "min-w-[150px]",
  },
  {
    id: "tags",
    label: "Tags",
    mandatory: false,
    defaultVisible: false,
    sortable: false,
    width: "min-w-[150px]",
  },
  {
    id: "image_count",
    label: "Images",
    mandatory: false,
    defaultVisible: true,
    sortable: true,
    width: "w-[70px]",
  },
  {
    id: "path",
    label: "Path",
    mandatory: false,
    defaultVisible: false,
    sortable: true,
    width: "min-w-[200px]",
  },
];

// Image columns
export const IMAGE_COLUMNS = [
  {
    id: "title",
    label: "Title",
    mandatory: true,
    defaultVisible: true,
    sortable: true,
  },
  {
    id: "thumbnail",
    label: "Thumbnail",
    mandatory: false,
    defaultVisible: true,
    sortable: false,
    width: "w-[60px]",
  },
  {
    id: "rating",
    label: "Rating",
    mandatory: false,
    defaultVisible: true,
    sortable: true,
    width: "w-[100px]",
  },
  {
    id: "studio",
    label: "Studio",
    mandatory: false,
    defaultVisible: false,
    sortable: true,
    width: "min-w-[120px]",
  },
  {
    id: "performers",
    label: "Performers",
    mandatory: false,
    defaultVisible: false,
    sortable: false,
    width: "min-w-[150px]",
  },
  {
    id: "tags",
    label: "Tags",
    mandatory: false,
    defaultVisible: false,
    sortable: false,
    width: "min-w-[150px]",
  },
  {
    id: "filesize",
    label: "File Size",
    mandatory: false,
    defaultVisible: false,
    sortable: true,
    width: "w-[90px]",
  },
  {
    id: "resolution",
    label: "Resolution",
    mandatory: false,
    defaultVisible: false,
    sortable: true,
    width: "w-[90px]",
  },
  {
    id: "path",
    label: "Path",
    mandatory: false,
    defaultVisible: false,
    sortable: true,
    width: "min-w-[200px]",
  },
];

// Group columns
export const GROUP_COLUMNS = [
  {
    id: "name",
    label: "Name",
    mandatory: true,
    defaultVisible: true,
    sortable: true,
  },
  {
    id: "image",
    label: "Image",
    mandatory: false,
    defaultVisible: true,
    sortable: false,
    width: "w-[60px]",
  },
  {
    id: "rating",
    label: "Rating",
    mandatory: false,
    defaultVisible: true,
    sortable: true,
    width: "w-[100px]",
  },
  {
    id: "studio",
    label: "Studio",
    mandatory: false,
    defaultVisible: false,
    sortable: true,
    width: "min-w-[120px]",
  },
  {
    id: "date",
    label: "Date",
    mandatory: false,
    defaultVisible: false,
    sortable: true,
    width: "w-[100px]",
  },
  {
    id: "duration",
    label: "Duration",
    mandatory: false,
    defaultVisible: false,
    sortable: true,
    width: "w-[80px]",
  },
  {
    id: "scene_count",
    label: "Scenes",
    mandatory: false,
    defaultVisible: true,
    sortable: true,
    width: "w-[70px]",
  },
];

// Helper to get columns by entity type
export const getColumnsForEntity = (entityType) => {
  const columnMap = {
    scene: SCENE_COLUMNS,
    performer: PERFORMER_COLUMNS,
    studio: STUDIO_COLUMNS,
    tag: TAG_COLUMNS,
    gallery: GALLERY_COLUMNS,
    image: IMAGE_COLUMNS,
    group: GROUP_COLUMNS,
  };
  return columnMap[entityType] || [];
};

// Helper to get default visible column IDs for an entity type
export const getDefaultVisibleColumns = (entityType) => {
  const columns = getColumnsForEntity(entityType);
  return columns
    .filter((col) => col.defaultVisible)
    .map((col) => col.id);
};

// Helper to get default column order for an entity type
export const getDefaultColumnOrder = (entityType) => {
  const columns = getColumnsForEntity(entityType);
  return columns.map((col) => col.id);
};

// Map column ID to actual sort field (some differ)
export const getColumnSortField = (columnId, entityType) => {
  // Special mappings where column ID differs from sort field
  const sortFieldMap = {
    age: "birthdate", // age column sorts by birthdate
    scenes_count: "scenes_count", // same
    scene_count: "scene_count", // groups use singular
  };
  return sortFieldMap[columnId] || columnId;
};
```

**Step 2: Verify the file was created correctly**

Run: Check file exists at `client/src/config/tableColumns.js`

**Step 3: Commit**

```bash
git add client/src/config/tableColumns.js
git commit -m "feat: add table column configuration constants"
```

---

## Task 2: Create useTableColumns Hook

**Files:**
- Create: `client/src/hooks/useTableColumns.js`

**Step 1: Create the hook file**

```javascript
// client/src/hooks/useTableColumns.js

import { useState, useCallback, useMemo } from "react";
import {
  getColumnsForEntity,
  getDefaultVisibleColumns,
  getDefaultColumnOrder,
} from "../config/tableColumns.js";

/**
 * Hook to manage table column visibility and order.
 *
 * Three-tier preference system:
 * 1. Preset-specific columns (if preset has tableColumns)
 * 2. User default columns (from settings)
 * 3. System default columns (from tableColumns.js)
 *
 * @param {string} entityType - The entity type (scene, performer, etc.)
 * @param {Object} options
 * @param {Object} options.presetColumns - Column config from active preset
 * @param {Object} options.userDefaultColumns - Column config from user settings
 * @returns {Object} Column state and actions
 */
export const useTableColumns = (entityType, options = {}) => {
  const { presetColumns, userDefaultColumns } = options;

  const allColumns = useMemo(
    () => getColumnsForEntity(entityType),
    [entityType]
  );

  // Determine initial visible columns based on priority
  const getInitialVisible = useCallback(() => {
    if (presetColumns?.visible?.length > 0) {
      return presetColumns.visible;
    }
    if (userDefaultColumns?.visible?.length > 0) {
      return userDefaultColumns.visible;
    }
    return getDefaultVisibleColumns(entityType);
  }, [entityType, presetColumns, userDefaultColumns]);

  // Determine initial column order based on priority
  const getInitialOrder = useCallback(() => {
    if (presetColumns?.order?.length > 0) {
      return presetColumns.order;
    }
    if (userDefaultColumns?.order?.length > 0) {
      return userDefaultColumns.order;
    }
    return getDefaultColumnOrder(entityType);
  }, [entityType, presetColumns, userDefaultColumns]);

  const [visibleColumnIds, setVisibleColumnIds] = useState(getInitialVisible);
  const [columnOrder, setColumnOrder] = useState(getInitialOrder);

  // Get ordered, visible columns with full metadata
  const visibleColumns = useMemo(() => {
    // Filter to only columns that exist in our definitions
    const validOrder = columnOrder.filter((id) =>
      allColumns.some((col) => col.id === id)
    );

    // Add any missing columns at the end (in case new columns were added)
    const missingColumns = allColumns
      .filter((col) => !validOrder.includes(col.id))
      .map((col) => col.id);

    const fullOrder = [...validOrder, ...missingColumns];

    return fullOrder
      .filter((id) => {
        const col = allColumns.find((c) => c.id === id);
        // Always include mandatory columns, or if it's in visible list
        return col?.mandatory || visibleColumnIds.includes(id);
      })
      .map((id) => allColumns.find((col) => col.id === id))
      .filter(Boolean);
  }, [allColumns, columnOrder, visibleColumnIds]);

  // Toggle column visibility
  const toggleColumn = useCallback((columnId) => {
    const column = allColumns.find((col) => col.id === columnId);
    if (column?.mandatory) return; // Can't hide mandatory columns

    setVisibleColumnIds((prev) => {
      if (prev.includes(columnId)) {
        return prev.filter((id) => id !== columnId);
      }
      return [...prev, columnId];
    });
  }, [allColumns]);

  // Hide a specific column
  const hideColumn = useCallback((columnId) => {
    const column = allColumns.find((col) => col.id === columnId);
    if (column?.mandatory) return;

    setVisibleColumnIds((prev) => prev.filter((id) => id !== columnId));
  }, [allColumns]);

  // Move column to a specific position
  const moveColumn = useCallback((columnId, direction) => {
    setColumnOrder((prev) => {
      const currentIndex = prev.indexOf(columnId);
      if (currentIndex === -1) return prev;

      let newIndex;
      switch (direction) {
        case "top":
          newIndex = 0;
          break;
        case "up":
          newIndex = Math.max(0, currentIndex - 1);
          break;
        case "down":
          newIndex = Math.min(prev.length - 1, currentIndex + 1);
          break;
        case "bottom":
          newIndex = prev.length - 1;
          break;
        default:
          return prev;
      }

      if (newIndex === currentIndex) return prev;

      const newOrder = [...prev];
      newOrder.splice(currentIndex, 1);
      newOrder.splice(newIndex, 0, columnId);
      return newOrder;
    });
  }, []);

  // Get current config for saving to preset or settings
  const getColumnConfig = useCallback(() => ({
    visible: visibleColumnIds,
    order: columnOrder,
  }), [visibleColumnIds, columnOrder]);

  // Reset to user defaults or system defaults
  const resetToDefaults = useCallback((useUserDefaults = true) => {
    if (useUserDefaults && userDefaultColumns?.visible?.length > 0) {
      setVisibleColumnIds(userDefaultColumns.visible);
      setColumnOrder(userDefaultColumns.order || getDefaultColumnOrder(entityType));
    } else {
      setVisibleColumnIds(getDefaultVisibleColumns(entityType));
      setColumnOrder(getDefaultColumnOrder(entityType));
    }
  }, [entityType, userDefaultColumns]);

  // Apply preset columns (when loading a preset)
  const applyPresetColumns = useCallback((presetCols) => {
    if (presetCols?.visible?.length > 0) {
      setVisibleColumnIds(presetCols.visible);
    }
    if (presetCols?.order?.length > 0) {
      setColumnOrder(presetCols.order);
    }
  }, []);

  return {
    // State
    allColumns,
    visibleColumns,
    visibleColumnIds,
    columnOrder,

    // Actions
    toggleColumn,
    hideColumn,
    moveColumn,
    getColumnConfig,
    resetToDefaults,
    applyPresetColumns,
  };
};

export default useTableColumns;
```

**Step 2: Commit**

```bash
git add client/src/hooks/useTableColumns.js
git commit -m "feat: add useTableColumns hook for column state management"
```

---

## Task 3: Create MultiValueCell Component

**Files:**
- Create: `client/src/components/table/MultiValueCell.jsx`

**Step 1: Create the component**

```javascript
// client/src/components/table/MultiValueCell.jsx

import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";

/**
 * Renders a cell with multiple values (performers, tags, etc.)
 * Shows first N items and "+X more" that opens a popover.
 *
 * @param {Object} props
 * @param {Array} props.items - Array of { id, name, linkTo? }
 * @param {number} props.maxVisible - Max items to show before truncating (default 2)
 * @param {string} props.emptyText - Text to show when no items (default "-")
 */
const MultiValueCell = ({ items = [], maxVisible = 2, emptyText = "-" }) => {
  const [showPopover, setShowPopover] = useState(false);
  const popoverRef = useRef(null);
  const buttonRef = useRef(null);

  // Close popover when clicking outside
  useEffect(() => {
    if (!showPopover) return;

    const handleClickOutside = (event) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setShowPopover(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showPopover]);

  if (!items || items.length === 0) {
    return <span style={{ color: "var(--text-muted)" }}>{emptyText}</span>;
  }

  const visibleItems = items.slice(0, maxVisible);
  const hiddenCount = items.length - maxVisible;

  const renderItem = (item, index, isLast) => {
    const separator = isLast ? "" : ", ";

    if (item.linkTo) {
      return (
        <span key={item.id}>
          <Link
            to={item.linkTo}
            className="hover:underline"
            style={{ color: "var(--accent-primary)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {item.name}
          </Link>
          {separator}
        </span>
      );
    }

    return (
      <span key={item.id}>
        {item.name}
        {separator}
      </span>
    );
  };

  return (
    <div className="relative flex items-center gap-1 min-w-0">
      <span className="truncate">
        {visibleItems.map((item, index) =>
          renderItem(item, index, index === visibleItems.length - 1 && hiddenCount <= 0)
        )}
      </span>

      {hiddenCount > 0 && (
        <>
          <button
            ref={buttonRef}
            onClick={(e) => {
              e.stopPropagation();
              setShowPopover(!showPopover);
            }}
            className="text-xs px-1.5 py-0.5 rounded flex-shrink-0 hover:opacity-80"
            style={{
              backgroundColor: "var(--bg-secondary)",
              color: "var(--text-secondary)",
            }}
          >
            +{hiddenCount} more
          </button>

          {showPopover && (
            <div
              ref={popoverRef}
              className="absolute left-0 top-full mt-1 z-50 p-2 rounded-md shadow-lg border min-w-[150px] max-w-[300px] max-h-[200px] overflow-y-auto"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <div className="flex flex-col gap-1">
                {items.map((item) => (
                  <div key={item.id} className="py-0.5">
                    {item.linkTo ? (
                      <Link
                        to={item.linkTo}
                        className="hover:underline text-sm"
                        style={{ color: "var(--accent-primary)" }}
                        onClick={() => setShowPopover(false)}
                      >
                        {item.name}
                      </Link>
                    ) : (
                      <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                        {item.name}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default MultiValueCell;
```

**Step 2: Commit**

```bash
git add client/src/components/table/MultiValueCell.jsx
git commit -m "feat: add MultiValueCell component for truncated lists"
```

---

## Task 4: Create TableHeader Component

**Files:**
- Create: `client/src/components/table/TableHeader.jsx`

**Step 1: Create the component**

```javascript
// client/src/components/table/TableHeader.jsx

import { LucideArrowUp, LucideArrowDown } from "lucide-react";
import { getColumnSortField } from "../../config/tableColumns.js";

/**
 * Table header row with sortable columns.
 *
 * @param {Object} props
 * @param {Array} props.columns - Visible columns with metadata
 * @param {Object} props.sort - Current sort { field, direction }
 * @param {Function} props.onSort - Called with (field, direction) when header clicked
 * @param {Function} props.onColumnContextMenu - Called with (columnId, event) on right-click
 * @param {string} props.entityType - Entity type for sort field mapping
 */
const TableHeader = ({
  columns,
  sort,
  onSort,
  onColumnContextMenu,
  entityType,
}) => {
  const handleHeaderClick = (column) => {
    if (!column.sortable) return;

    const sortField = getColumnSortField(column.id, entityType);
    const isSameField = sort.field === sortField;
    const newDirection = isSameField && sort.direction === "DESC" ? "ASC" : "DESC";

    onSort(sortField, newDirection);
  };

  const handleContextMenu = (e, column) => {
    if (column.mandatory) return; // Can't hide mandatory columns
    e.preventDefault();
    onColumnContextMenu?.(column.id, e);
  };

  return (
    <thead>
      <tr
        className="border-b"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderColor: "var(--border-color)",
        }}
      >
        {columns.map((column) => {
          const sortField = getColumnSortField(column.id, entityType);
          const isCurrentSort = sort.field === sortField;
          const isSortable = column.sortable;

          return (
            <th
              key={column.id}
              className={`px-3 py-2 text-left text-sm font-medium ${column.width || ""} ${
                isSortable ? "cursor-pointer select-none hover:bg-opacity-80" : ""
              }`}
              style={{
                color: isCurrentSort ? "var(--accent-primary)" : "var(--text-secondary)",
                backgroundColor: isSortable ? undefined : "transparent",
              }}
              onClick={() => handleHeaderClick(column)}
              onContextMenu={(e) => handleContextMenu(e, column)}
              title={
                isSortable
                  ? `Sort by ${column.label}`
                  : column.mandatory
                  ? "Required column"
                  : "Right-click to hide"
              }
            >
              <div className="flex items-center gap-1">
                <span className={!isSortable ? "opacity-70" : ""}>
                  {column.label}
                </span>
                {isCurrentSort && (
                  sort.direction === "ASC" ? (
                    <LucideArrowUp size={14} />
                  ) : (
                    <LucideArrowDown size={14} />
                  )
                )}
              </div>
            </th>
          );
        })}
      </tr>
    </thead>
  );
};

export default TableHeader;
```

**Step 2: Commit**

```bash
git add client/src/components/table/TableHeader.jsx
git commit -m "feat: add TableHeader component with sortable columns"
```

---

## Task 5: Create Entity-Specific Cell Renderers

**Files:**
- Create: `client/src/components/table/cellRenderers.jsx`

**Step 1: Create the cell renderers file**

```javascript
// client/src/components/table/cellRenderers.jsx

import { Link } from "react-router-dom";
import { LucideHeart, LucideStar } from "lucide-react";
import MultiValueCell from "./MultiValueCell.jsx";

// Format duration from seconds to MM:SS or HH:MM:SS
const formatDuration = (seconds) => {
  if (!seconds) return "-";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
};

// Format file size
const formatFileSize = (bytes) => {
  if (!bytes) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
};

// Format date
const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleDateString();
  } catch {
    return dateStr;
  }
};

// Calculate age from birthdate
const calculateAge = (birthdate) => {
  if (!birthdate) return "-";
  const birth = new Date(birthdate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
};

// Render rating as stars or number
const RatingCell = ({ rating }) => {
  if (rating == null) return <span style={{ color: "var(--text-muted)" }}>-</span>;

  // Convert 0-100 to 0-5 stars
  const stars = Math.round(rating / 20);

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <LucideStar
          key={star}
          size={14}
          className={star <= stars ? "fill-yellow-400 text-yellow-400" : "text-gray-400"}
        />
      ))}
    </div>
  );
};

// Render favorite indicator
const FavoriteCell = ({ favorite }) => {
  if (!favorite) return <span style={{ color: "var(--text-muted)" }}>-</span>;
  return <LucideHeart size={16} className="fill-red-500 text-red-500" />;
};

// Render thumbnail
const ThumbnailCell = ({ src, alt, linkTo }) => {
  const img = (
    <img
      src={src}
      alt={alt || ""}
      className="w-10 h-10 object-cover rounded"
      loading="lazy"
    />
  );

  if (linkTo) {
    return (
      <Link to={linkTo} onClick={(e) => e.stopPropagation()}>
        {img}
      </Link>
    );
  }

  return img;
};

// Render a navigable link cell
const LinkCell = ({ to, children }) => {
  if (!children) return <span style={{ color: "var(--text-muted)" }}>-</span>;

  return (
    <Link
      to={to}
      className="hover:underline"
      style={{ color: "var(--accent-primary)" }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </Link>
  );
};

/**
 * Get cell renderer for a specific column and entity type.
 * Returns a function (entity) => ReactNode
 */
export const getCellRenderer = (columnId, entityType) => {
  // Scene cell renderers
  if (entityType === "scene") {
    const sceneRenderers = {
      title: (scene) => (
        <LinkCell to={`/scene/${scene.id}`}>{scene.title || "Untitled"}</LinkCell>
      ),
      thumbnail: (scene) => (
        <ThumbnailCell
          src={scene.paths?.screenshot || scene.image_path}
          alt={scene.title}
          linkTo={`/scene/${scene.id}`}
        />
      ),
      date: (scene) => formatDate(scene.date),
      duration: (scene) => formatDuration(scene.file?.duration || scene.duration),
      rating: (scene) => <RatingCell rating={scene.rating} />,
      studio: (scene) => scene.studio ? (
        <LinkCell to={`/studio/${scene.studio.id}`}>{scene.studio.name}</LinkCell>
      ) : "-",
      performers: (scene) => (
        <MultiValueCell
          items={(scene.performers || []).map((p) => ({
            id: p.id,
            name: p.name,
            linkTo: `/performer/${p.id}`,
          }))}
        />
      ),
      tags: (scene) => (
        <MultiValueCell
          items={(scene.tags || []).map((t) => ({
            id: t.id,
            name: t.name,
            linkTo: `/tag/${t.id}`,
          }))}
        />
      ),
      resolution: (scene) => {
        const height = scene.file?.height || scene.files?.[0]?.height;
        return height ? `${height}p` : "-";
      },
      filesize: (scene) => formatFileSize(scene.file?.size || scene.files?.[0]?.size),
      play_count: (scene) => scene.play_count ?? "-",
      o_counter: (scene) => scene.o_counter ?? "-",
      path: (scene) => (
        <span className="truncate text-xs" title={scene.path || scene.file?.path}>
          {scene.path || scene.file?.path || "-"}
        </span>
      ),
    };
    return sceneRenderers[columnId] || (() => "-");
  }

  // Performer cell renderers
  if (entityType === "performer") {
    const performerRenderers = {
      name: (performer) => (
        <LinkCell to={`/performer/${performer.id}`}>{performer.name}</LinkCell>
      ),
      image: (performer) => (
        <ThumbnailCell
          src={performer.image_path}
          alt={performer.name}
          linkTo={`/performer/${performer.id}`}
        />
      ),
      aliases: (performer) => performer.aliases || "-",
      gender: (performer) => performer.gender || "-",
      rating: (performer) => <RatingCell rating={performer.rating} />,
      favorite: (performer) => <FavoriteCell favorite={performer.favorite} />,
      age: (performer) => calculateAge(performer.birthdate),
      country: (performer) => performer.country || "-",
      ethnicity: (performer) => performer.ethnicity || "-",
      scenes_count: (performer) => performer.scene_count ?? performer.scenes_count ?? "-",
      o_counter: (performer) => performer.o_counter ?? "-",
    };
    return performerRenderers[columnId] || (() => "-");
  }

  // Studio cell renderers
  if (entityType === "studio") {
    const studioRenderers = {
      name: (studio) => (
        <LinkCell to={`/studio/${studio.id}`}>{studio.name}</LinkCell>
      ),
      image: (studio) => (
        <ThumbnailCell
          src={studio.image_path}
          alt={studio.name}
          linkTo={`/studio/${studio.id}`}
        />
      ),
      rating: (studio) => <RatingCell rating={studio.rating} />,
      parent_studio: (studio) => studio.parent_studio ? (
        <LinkCell to={`/studio/${studio.parent_studio.id}`}>
          {studio.parent_studio.name}
        </LinkCell>
      ) : "-",
      scenes_count: (studio) => studio.scene_count ?? studio.scenes_count ?? "-",
      child_count: (studio) => studio.child_studios?.length ?? "-",
    };
    return studioRenderers[columnId] || (() => "-");
  }

  // Tag cell renderers
  if (entityType === "tag") {
    const tagRenderers = {
      name: (tag) => (
        <LinkCell to={`/tag/${tag.id}`}>{tag.name}</LinkCell>
      ),
      image: (tag) => (
        <ThumbnailCell
          src={tag.image_path}
          alt={tag.name}
          linkTo={`/tag/${tag.id}`}
        />
      ),
      scenes_count: (tag) => tag.scene_count ?? tag.scenes_count ?? "-",
      performer_count: (tag) => tag.performer_count ?? "-",
      description: (tag) => (
        <span className="truncate text-xs" title={tag.description}>
          {tag.description || "-"}
        </span>
      ),
    };
    return tagRenderers[columnId] || (() => "-");
  }

  // Gallery cell renderers
  if (entityType === "gallery") {
    const galleryRenderers = {
      title: (gallery) => (
        <LinkCell to={`/gallery/${gallery.id}`}>
          {gallery.title || gallery.path?.split("/").pop() || "Untitled"}
        </LinkCell>
      ),
      thumbnail: (gallery) => (
        <ThumbnailCell
          src={gallery.cover?.paths?.thumbnail || gallery.image_path}
          alt={gallery.title}
          linkTo={`/gallery/${gallery.id}`}
        />
      ),
      date: (gallery) => formatDate(gallery.date),
      rating: (gallery) => <RatingCell rating={gallery.rating} />,
      studio: (gallery) => gallery.studio ? (
        <LinkCell to={`/studio/${gallery.studio.id}`}>{gallery.studio.name}</LinkCell>
      ) : "-",
      performers: (gallery) => (
        <MultiValueCell
          items={(gallery.performers || []).map((p) => ({
            id: p.id,
            name: p.name,
            linkTo: `/performer/${p.id}`,
          }))}
        />
      ),
      tags: (gallery) => (
        <MultiValueCell
          items={(gallery.tags || []).map((t) => ({
            id: t.id,
            name: t.name,
            linkTo: `/tag/${t.id}`,
          }))}
        />
      ),
      image_count: (gallery) => gallery.image_count ?? gallery.images?.length ?? "-",
      path: (gallery) => (
        <span className="truncate text-xs" title={gallery.path}>
          {gallery.path || "-"}
        </span>
      ),
    };
    return galleryRenderers[columnId] || (() => "-");
  }

  // Image cell renderers
  if (entityType === "image") {
    const imageRenderers = {
      title: (image) => (
        <LinkCell to={`/image/${image.id}`}>
          {image.title || image.path?.split("/").pop() || "Untitled"}
        </LinkCell>
      ),
      thumbnail: (image) => (
        <ThumbnailCell
          src={image.paths?.thumbnail || image.image_path}
          alt={image.title}
        />
      ),
      rating: (image) => <RatingCell rating={image.rating} />,
      studio: (image) => image.studio ? (
        <LinkCell to={`/studio/${image.studio.id}`}>{image.studio.name}</LinkCell>
      ) : "-",
      performers: (image) => (
        <MultiValueCell
          items={(image.performers || []).map((p) => ({
            id: p.id,
            name: p.name,
            linkTo: `/performer/${p.id}`,
          }))}
        />
      ),
      tags: (image) => (
        <MultiValueCell
          items={(image.tags || []).map((t) => ({
            id: t.id,
            name: t.name,
            linkTo: `/tag/${t.id}`,
          }))}
        />
      ),
      filesize: (image) => formatFileSize(image.file?.size),
      resolution: (image) => {
        const w = image.file?.width;
        const h = image.file?.height;
        return w && h ? `${w}x${h}` : "-";
      },
      path: (image) => (
        <span className="truncate text-xs" title={image.path}>
          {image.path || "-"}
        </span>
      ),
    };
    return imageRenderers[columnId] || (() => "-");
  }

  // Group cell renderers
  if (entityType === "group") {
    const groupRenderers = {
      name: (group) => (
        <LinkCell to={`/collection/${group.id}`}>{group.name}</LinkCell>
      ),
      image: (group) => (
        <ThumbnailCell
          src={group.front_image_path || group.image_path}
          alt={group.name}
          linkTo={`/collection/${group.id}`}
        />
      ),
      rating: (group) => <RatingCell rating={group.rating} />,
      studio: (group) => group.studio ? (
        <LinkCell to={`/studio/${group.studio.id}`}>{group.studio.name}</LinkCell>
      ) : "-",
      date: (group) => formatDate(group.date),
      duration: (group) => formatDuration(group.duration),
      scene_count: (group) => group.scene_count ?? group.scenes?.length ?? "-",
    };
    return groupRenderers[columnId] || (() => "-");
  }

  // Fallback
  return () => "-";
};

export { RatingCell, FavoriteCell, ThumbnailCell, LinkCell, MultiValueCell };
export { formatDuration, formatFileSize, formatDate, calculateAge };
```

**Step 2: Commit**

```bash
git add client/src/components/table/cellRenderers.jsx
git commit -m "feat: add entity-specific cell renderers for table view"
```

---

## Task 6: Create ColumnConfigPopover Component

**Files:**
- Create: `client/src/components/table/ColumnConfigPopover.jsx`

**Step 1: Create the component**

```javascript
// client/src/components/table/ColumnConfigPopover.jsx

import { useState, useRef, useEffect } from "react";
import {
  LucideColumns3,
  LucideChevronUp,
  LucideChevronDown,
  LucideChevronsUp,
  LucideChevronsDown,
  LucideX,
} from "lucide-react";
import Button from "../ui/Button.jsx";

/**
 * Popover for configuring table column visibility and order.
 *
 * @param {Object} props
 * @param {Array} props.allColumns - All available columns
 * @param {Array} props.visibleColumnIds - Currently visible column IDs
 * @param {Array} props.columnOrder - Current column order
 * @param {Function} props.onToggleColumn - Called with columnId to toggle visibility
 * @param {Function} props.onMoveColumn - Called with (columnId, direction)
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

  // Close on click outside
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
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Get columns in order
  const orderedColumns = columnOrder
    .map((id) => allColumns.find((col) => col.id === id))
    .filter(Boolean);

  // Add any columns not in order (new columns)
  const missingColumns = allColumns.filter(
    (col) => !columnOrder.includes(col.id)
  );
  const allOrderedColumns = [...orderedColumns, ...missingColumns];

  return (
    <div className="relative">
      <Button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        variant="secondary"
        size="sm"
        icon={<LucideColumns3 size={16} />}
        title="Configure columns"
      >
        Columns
      </Button>

      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute right-0 top-full mt-2 z-50 rounded-lg shadow-xl border w-[320px]"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: "var(--border-color)" }}
          >
            <h3 className="font-medium" style={{ color: "var(--text-primary)" }}>
              Columns
            </h3>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded hover:bg-opacity-80"
              style={{ color: "var(--text-secondary)" }}
            >
              <LucideX size={16} />
            </button>
          </div>

          {/* Column list */}
          <div className="max-h-[400px] overflow-y-auto py-2">
            {allOrderedColumns.map((column, index) => {
              const isVisible = column.mandatory || visibleColumnIds.includes(column.id);
              const isFirst = index === 0;
              const isLast = index === allOrderedColumns.length - 1;

              return (
                <div
                  key={column.id}
                  className="flex items-center gap-2 px-4 py-2 hover:bg-opacity-50"
                  style={{
                    backgroundColor: isVisible ? "transparent" : "var(--bg-secondary)",
                  }}
                >
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={isVisible}
                    disabled={column.mandatory}
                    onChange={() => onToggleColumn(column.id)}
                    className="w-4 h-4 rounded cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ accentColor: "var(--accent-primary)" }}
                  />

                  {/* Label */}
                  <span
                    className={`flex-1 text-sm ${column.mandatory ? "font-medium" : ""}`}
                    style={{
                      color: isVisible ? "var(--text-primary)" : "var(--text-muted)",
                    }}
                  >
                    {column.label}
                    {column.mandatory && (
                      <span className="text-xs ml-1" style={{ color: "var(--text-muted)" }}>
                        (required)
                      </span>
                    )}
                  </span>

                  {/* Move buttons */}
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => onMoveColumn(column.id, "top")}
                      disabled={isFirst}
                      className="p-1 rounded hover:bg-opacity-80 disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{ color: "var(--text-secondary)" }}
                      title="Move to top"
                    >
                      <LucideChevronsUp size={14} />
                    </button>
                    <button
                      onClick={() => onMoveColumn(column.id, "up")}
                      disabled={isFirst}
                      className="p-1 rounded hover:bg-opacity-80 disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{ color: "var(--text-secondary)" }}
                      title="Move up"
                    >
                      <LucideChevronUp size={14} />
                    </button>
                    <button
                      onClick={() => onMoveColumn(column.id, "down")}
                      disabled={isLast}
                      className="p-1 rounded hover:bg-opacity-80 disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{ color: "var(--text-secondary)" }}
                      title="Move down"
                    >
                      <LucideChevronDown size={14} />
                    </button>
                    <button
                      onClick={() => onMoveColumn(column.id, "bottom")}
                      disabled={isLast}
                      className="p-1 rounded hover:bg-opacity-80 disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{ color: "var(--text-secondary)" }}
                      title="Move to bottom"
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
```

**Step 2: Commit**

```bash
git add client/src/components/table/ColumnConfigPopover.jsx
git commit -m "feat: add ColumnConfigPopover for column visibility and ordering"
```

---

## Task 7: Create TableView Component

**Files:**
- Create: `client/src/components/table/TableView.jsx`

**Step 1: Create the main TableView component**

```javascript
// client/src/components/table/TableView.jsx

import { useState, useCallback } from "react";
import TableHeader from "./TableHeader.jsx";
import { getCellRenderer } from "./cellRenderers.jsx";

/**
 * Main table view component for displaying entity lists.
 *
 * @param {Object} props
 * @param {Array} props.items - Array of entities to display
 * @param {Array} props.columns - Visible columns with metadata
 * @param {Object} props.sort - Current sort { field, direction }
 * @param {Function} props.onSort - Called with (field, direction) when sort changes
 * @param {Function} props.onHideColumn - Called with columnId when hiding via context menu
 * @param {string} props.entityType - Entity type for cell rendering
 * @param {boolean} props.isLoading - Show loading state
 */
const TableView = ({
  items = [],
  columns,
  sort,
  onSort,
  onHideColumn,
  entityType,
  isLoading = false,
}) => {
  const [contextMenu, setContextMenu] = useState(null);

  const handleColumnContextMenu = useCallback((columnId, event) => {
    setContextMenu({
      columnId,
      x: event.clientX,
      y: event.clientY,
    });
  }, []);

  const handleHideColumn = useCallback(() => {
    if (contextMenu?.columnId) {
      onHideColumn?.(contextMenu.columnId);
    }
    setContextMenu(null);
  }, [contextMenu, onHideColumn]);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-max">
          <TableHeader
            columns={columns}
            sort={sort}
            onSort={onSort}
            entityType={entityType}
          />
          <tbody>
            {[...Array(10)].map((_, rowIndex) => (
              <tr
                key={rowIndex}
                className="border-b"
                style={{ borderColor: "var(--border-color)" }}
              >
                {columns.map((column) => (
                  <td key={column.id} className={`px-3 py-2 ${column.width || ""}`}>
                    <div
                      className="h-4 rounded animate-pulse"
                      style={{ backgroundColor: "var(--bg-secondary)" }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Empty state
  if (items.length === 0) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-max">
          <TableHeader
            columns={columns}
            sort={sort}
            onSort={onSort}
            entityType={entityType}
          />
          <tbody>
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-8 text-center"
                style={{ color: "var(--text-muted)" }}
              >
                No items found
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto" onClick={closeContextMenu}>
      <table className="w-full min-w-max">
        <TableHeader
          columns={columns}
          sort={sort}
          onSort={onSort}
          onColumnContextMenu={handleColumnContextMenu}
          entityType={entityType}
        />
        <tbody>
          {items.map((item, rowIndex) => (
            <tr
              key={item.id || rowIndex}
              className="border-b hover:bg-opacity-50 transition-colors"
              style={{
                borderColor: "var(--border-color)",
                backgroundColor: rowIndex % 2 === 0 ? "transparent" : "var(--bg-secondary)",
              }}
            >
              {columns.map((column) => {
                const renderer = getCellRenderer(column.id, entityType);
                return (
                  <td
                    key={column.id}
                    className={`px-3 py-2 text-sm ${column.width || ""}`}
                    style={{ color: "var(--text-primary)" }}
                  >
                    {renderer(item)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={closeContextMenu}
          />
          <div
            className="fixed z-50 py-1 rounded-md shadow-lg border min-w-[120px]"
            style={{
              left: contextMenu.x,
              top: contextMenu.y,
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-color)",
            }}
          >
            <button
              onClick={handleHideColumn}
              className="w-full px-4 py-2 text-left text-sm hover:bg-opacity-80"
              style={{
                color: "var(--text-primary)",
                backgroundColor: "transparent",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--bg-secondary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
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
```

**Step 2: Create index export file**

```javascript
// client/src/components/table/index.js

export { default as TableView } from "./TableView.jsx";
export { default as TableHeader } from "./TableHeader.jsx";
export { default as MultiValueCell } from "./MultiValueCell.jsx";
export { default as ColumnConfigPopover } from "./ColumnConfigPopover.jsx";
export * from "./cellRenderers.jsx";
```

**Step 3: Commit**

```bash
git add client/src/components/table/TableView.jsx client/src/components/table/index.js
git commit -m "feat: add TableView component"
```

---

## Task 8: Add "table" to ViewModeToggle

**Files:**
- Modify: `client/src/components/ui/ViewModeToggle.jsx`

**Step 1: Add table icon to MODE_ICONS**

```javascript
// In ViewModeToggle.jsx, add LucideList import and table mode

import { LucideGrid2X2, LucideSquare, LucideNetwork, LucideList } from "lucide-react";

// Update MODE_ICONS to include table
const MODE_ICONS = {
  grid: LucideGrid2X2,
  wall: LucideSquare,
  hierarchy: LucideNetwork,
  table: LucideList,
};
```

**Step 2: Commit**

```bash
git add client/src/components/ui/ViewModeToggle.jsx
git commit -m "feat: add table icon to ViewModeToggle"
```

---

## Task 9: Extend FilterPresets to Save Table Columns

**Files:**
- Modify: `client/src/components/ui/FilterPresets.jsx`

**Step 1: Add tableColumns to saved preset data**

In `FilterPresets.jsx`, update the `handleSavePreset` function to include `tableColumns` prop:

```javascript
// Add tableColumns prop to component
const FilterPresets = ({
  artifactType,
  context,
  currentFilters,
  permanentFilters = {},
  currentSort,
  currentDirection,
  currentViewMode = "grid",
  currentZoomLevel = "medium",
  currentTableColumns = null, // NEW: { visible: [], order: [] }
  onLoadPreset,
}) => {
```

Update `handleSavePreset`:

```javascript
await apiPost("/user/filter-presets", {
  artifactType,
  context: effectiveContext,
  name: presetName,
  filters: filtersToSave,
  sort: currentSort,
  direction: currentDirection,
  viewMode: currentViewMode,
  zoomLevel: currentZoomLevel,
  tableColumns: currentViewMode === "table" ? currentTableColumns : null, // NEW
  setAsDefault,
});
```

Update `handleLoadPreset`:

```javascript
onLoadPreset({
  filters: mergedFilters,
  sort: preset.sort,
  direction: preset.direction,
  viewMode: preset.viewMode || "grid",
  zoomLevel: preset.zoomLevel || "medium",
  tableColumns: preset.tableColumns || null, // NEW
});
```

**Step 2: Commit**

```bash
git add client/src/components/ui/FilterPresets.jsx
git commit -m "feat: add tableColumns support to FilterPresets"
```

---

## Task 10: Update useFilterState to Handle Table Columns

**Files:**
- Modify: `client/src/hooks/useFilterState.js`

**Step 1: Add tableColumns state and actions**

Add state for table columns:

```javascript
const [tableColumns, setTableColumnsState] = useState(null);
```

Update `loadPreset` callback to handle table columns:

```javascript
const loadPreset = useCallback((preset) => {
  const newFilters = { ...permanentFilters, ...preset.filters };
  const newViewMode = preset.viewMode || "grid";
  const newZoomLevel = preset.zoomLevel || "medium";
  const newTableColumns = preset.tableColumns || null;

  setFiltersState(newFilters);
  setSortState({ field: preset.sort, direction: preset.direction });
  setPaginationState((prev) => ({ ...prev, page: 1 }));
  setViewModeState(newViewMode);
  setZoomLevelState(newZoomLevel);
  setTableColumnsState(newTableColumns);

  syncToUrlParams({
    filters: newFilters,
    sort: { field: preset.sort, direction: preset.direction },
    pagination: { ...pagination, page: 1 },
    searchText,
    viewMode: newViewMode,
    zoomLevel: newZoomLevel,
  });
}, [permanentFilters, pagination, searchText, syncToUrlParams]);
```

Add `setTableColumns` action:

```javascript
const setTableColumns = useCallback((columns) => {
  setTableColumnsState(columns);
}, []);
```

Return new state and action:

```javascript
return {
  // ... existing returns
  tableColumns,
  setTableColumns,
};
```

**Step 2: Commit**

```bash
git add client/src/hooks/useFilterState.js
git commit -m "feat: add tableColumns support to useFilterState"
```

---

## Task 11: Update Server to Store Table Columns in Presets

**Files:**
- Modify: `server/controllers/user/filterPresets.ts`
- Modify: `server/types/api/user.ts` (if exists)

**Step 1: Update preset type to include tableColumns**

In the preset handler, accept and store `tableColumns`:

```typescript
// In the POST handler for filter presets
const { tableColumns } = req.body;

// Store with preset
const preset = {
  // ... existing fields
  tableColumns: tableColumns || null,
};
```

**Step 2: Commit**

```bash
git add server/controllers/user/filterPresets.ts
git commit -m "feat: store tableColumns in filter presets"
```

---

## Task 12: Add Table Column Defaults to User Settings

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create migration
- Modify: `server/controllers/user/settings.ts`

**Step 1: Add tableColumnDefaults field to User model**

```prisma
model User {
  // ... existing fields
  tableColumnDefaults Json? // { scene: { visible: [], order: [] }, performer: {...} }
}
```

**Step 2: Create migration**

Run: `cd server && npx prisma migrate dev --name add_table_column_defaults`

**Step 3: Update settings controller**

In GET `/user/settings`:

```typescript
// Return tableColumnDefaults
return {
  settings: {
    // ... existing
    tableColumnDefaults: user.tableColumnDefaults,
  },
};
```

In PUT `/user/settings`:

```typescript
// Accept tableColumnDefaults
if (req.body.tableColumnDefaults !== undefined) {
  await prisma.user.update({
    where: { id: userId },
    data: { tableColumnDefaults: req.body.tableColumnDefaults },
  });
}
```

**Step 4: Commit**

```bash
git add server/prisma/schema.prisma server/controllers/user/settings.ts
git commit -m "feat: add tableColumnDefaults to user settings"
```

---

## Task 13: Add Table Column Settings to CustomizationTab

**Files:**
- Create: `client/src/components/settings/TableColumnSettings.jsx`
- Modify: `client/src/components/settings/tabs/CustomizationTab.jsx`

**Step 1: Create TableColumnSettings component**

```javascript
// client/src/components/settings/TableColumnSettings.jsx

import { useState, useEffect } from "react";
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
        Configure which columns are shown by default when switching to table view.
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
              color: activeEntity === entity.id ? "white" : "var(--text-secondary)",
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
                backgroundColor: isVisible ? "transparent" : "var(--bg-secondary)",
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
                  color: isVisible ? "var(--text-primary)" : "var(--text-muted)",
                }}
              >
                {column.label}
                {column.mandatory && (
                  <span className="text-xs ml-1" style={{ color: "var(--text-muted)" }}>
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
```

**Step 2: Add to CustomizationTab**

Import and render `TableColumnSettings` in `CustomizationTab.jsx`:

```javascript
import TableColumnSettings from "../TableColumnSettings.jsx";

// In component, add state and loader
const [tableColumnDefaults, setTableColumnDefaults] = useState({});

// In loadSettings
setTableColumnDefaults(settings.tableColumnDefaults || {});

// Add save handler
const saveTableColumnDefaults = async (newDefaults) => {
  try {
    await api.put("/user/settings", {
      tableColumnDefaults: newDefaults,
    });
    setTableColumnDefaults(newDefaults);
    showSuccess("Table column defaults saved!");
  } catch (err) {
    showError(err.response?.data?.error || "Failed to save table column defaults");
  }
};

// In render, add section after View Preferences
<div
  className="p-6 rounded-lg border"
  style={{
    backgroundColor: "var(--bg-card)",
    borderColor: "var(--border-color)",
  }}
>
  <TableColumnSettings
    tableColumnDefaults={tableColumnDefaults}
    onSave={saveTableColumnDefaults}
  />
</div>
```

**Step 3: Commit**

```bash
git add client/src/components/settings/TableColumnSettings.jsx client/src/components/settings/tabs/CustomizationTab.jsx
git commit -m "feat: add table column settings to customization tab"
```

---

## Task 14: Integrate TableView into Entity Pages

**Files:**
- Modify: `client/src/components/pages/Performers.jsx` (example - repeat pattern for others)

**Step 1: Add table view mode option and render TableView**

This task shows the pattern for one page. Apply the same pattern to:
- `Performers.jsx`
- `Studios.jsx`
- `Tags.jsx`
- `Groups.jsx`
- `Galleries.jsx`
- `Images.jsx`
- `SceneSearch.jsx` (for scenes)

Example for Performers.jsx:

```javascript
// Add imports
import { TableView, ColumnConfigPopover } from "../table/index.js";
import { useTableColumns } from "../../hooks/useTableColumns.js";

// In component, add table modes to ViewModeToggle
const viewModes = [
  { id: "grid", label: "Grid view" },
  { id: "table", label: "Table view" },
];

// Add useTableColumns hook
const {
  allColumns,
  visibleColumns,
  visibleColumnIds,
  columnOrder,
  toggleColumn,
  hideColumn,
  moveColumn,
  getColumnConfig,
  applyPresetColumns,
} = useTableColumns("performer", {
  presetColumns: tableColumns, // from useFilterState
  userDefaultColumns: userTableColumnDefaults?.performer,
});

// Update preset loading to apply table columns
const handleLoadPreset = (preset) => {
  loadPreset(preset);
  if (preset.tableColumns) {
    applyPresetColumns(preset.tableColumns);
  }
};

// In toolbar, show Columns button when in table view
{viewMode === "table" && (
  <ColumnConfigPopover
    allColumns={allColumns}
    visibleColumnIds={visibleColumnIds}
    columnOrder={columnOrder}
    onToggleColumn={toggleColumn}
    onMoveColumn={moveColumn}
  />
)}

// In render, conditionally show table or grid
{viewMode === "table" ? (
  <TableView
    items={data?.findPerformers?.performers || []}
    columns={visibleColumns}
    sort={sort}
    onSort={setSort}
    onHideColumn={hideColumn}
    entityType="performer"
    isLoading={isLoading}
  />
) : (
  // Existing grid rendering
)}
```

**Step 2: Commit after updating all pages**

```bash
git add client/src/components/pages/*.jsx client/src/components/scene-search/SceneSearch.jsx
git commit -m "feat: integrate TableView into all entity list pages"
```

---

## Task 15: Update SearchControls to Pass Table Columns to Presets

**Files:**
- Modify: `client/src/components/ui/SearchControls.jsx`

**Step 1: Add currentTableColumns prop and pass to FilterPresets**

In SearchControls, accept `currentTableColumns` prop and pass it to `FilterPresets`:

```javascript
// Add prop
const SearchControls = ({
  // ... existing props
  currentTableColumns = null,
}) => {

// Pass to FilterPresets
<FilterPresets
  // ... existing props
  currentTableColumns={currentTableColumns}
/>
```

**Step 2: Commit**

```bash
git add client/src/components/ui/SearchControls.jsx
git commit -m "feat: pass table columns to FilterPresets from SearchControls"
```

---

## Task 16: Manual Testing Checklist

**No code changes - testing only**

**Step 1: Test table view on Performers page**

1. Navigate to /performers
2. Click table view mode button
3. Verify table renders with columns
4. Click column headers to sort
5. Verify sort indicator appears
6. Verify sort dropdown syncs

**Step 2: Test column configuration**

1. Click "Columns" button
2. Toggle column visibility
3. Use arrow buttons to reorder
4. Right-click header to hide column
5. Verify changes persist in view

**Step 3: Test multi-value cells**

1. Find a performer with multiple scenes/tags
2. Verify "+N more" appears
3. Click "+N more" to see popover
4. Click item in popover to navigate

**Step 4: Test presets**

1. Configure columns in table view
2. Save as preset
3. Switch to grid view
4. Load preset
5. Verify table view with columns restored

**Step 5: Test settings**

1. Go to Settings > Customization
2. Configure table column defaults
3. Save changes
4. Navigate to entity page
5. Switch to table view
6. Verify default columns match settings

**Step 6: Test all entity types**

Repeat basic table view test for:
- Scenes
- Studios
- Tags
- Groups
- Galleries
- Images

**Step 7: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during testing"
```

---

## Task 17: Final Cleanup and Documentation

**Files:**
- Update: `docs/plans/2025-01-13-table-list-view-design.md` (mark as implemented)

**Step 1: Update design doc status**

Change status from "Approved" to "Implemented"

**Step 2: Final commit**

```bash
git add docs/plans/2025-01-13-table-list-view-design.md
git commit -m "docs: mark table view design as implemented"
```

---

## Summary

This plan implements the table/list view feature across 17 tasks:

1. **Tasks 1-7**: Core infrastructure (column config, hook, components)
2. **Tasks 8-11**: Integration points (ViewModeToggle, presets, filter state)
3. **Tasks 12-13**: Settings persistence (database, customization UI)
4. **Task 14**: Page integration (repeat pattern for all entity pages)
5. **Tasks 15-17**: Finishing touches (SearchControls, testing, docs)

Each task is atomic and commits independently. The TDD approach isn't strictly followed here because this is primarily UI work, but each component is built incrementally and tested as part of the integration tasks.
