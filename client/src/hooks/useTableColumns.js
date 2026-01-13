import { useState, useCallback, useMemo } from "react";
import {
  getColumnsForEntity,
  getDefaultVisibleColumns,
  getDefaultColumnOrder,
} from "../config/tableColumns.js";

/**
 * Hook for managing table column visibility and order with a three-tier preference system:
 * 1. Preset-specific columns (if preset has tableColumns)
 * 2. User default columns (from settings)
 * 3. System default columns (from tableColumns.js)
 *
 * @param {string} entityType - The entity type (scene, performer, studio, tag, gallery, image, group)
 * @param {Object} options - Configuration options
 * @param {Object} options.presetColumns - Columns from a loaded preset { visible: [], order: [] }
 * @param {Object} options.userDefaultColumns - User's default columns { visible: [], order: [] }
 * @returns {Object} Column state and management functions
 */
export const useTableColumns = (entityType, options = {}) => {
  const { presetColumns, userDefaultColumns } = options;

  // Get all column definitions for this entity type
  const allColumns = useMemo(
    () => getColumnsForEntity(entityType),
    [entityType]
  );

  // Get all column IDs for validation
  const allColumnIds = useMemo(
    () => new Set(allColumns.map((col) => col.id)),
    [allColumns]
  );

  // Get mandatory column IDs
  const mandatoryColumnIds = useMemo(
    () => new Set(allColumns.filter((col) => col.mandatory).map((col) => col.id)),
    [allColumns]
  );

  // Determine initial visible columns based on priority
  const getInitialVisibleColumnIds = useCallback(() => {
    // Priority 1: Preset columns
    if (presetColumns?.visible?.length > 0) {
      return presetColumns.visible.filter((id) => allColumnIds.has(id));
    }
    // Priority 2: User default columns
    if (userDefaultColumns?.visible?.length > 0) {
      return userDefaultColumns.visible.filter((id) => allColumnIds.has(id));
    }
    // Priority 3: System default columns
    return getDefaultVisibleColumns(entityType);
  }, [presetColumns, userDefaultColumns, entityType, allColumnIds]);

  // Determine initial column order based on priority
  const getInitialColumnOrder = useCallback(() => {
    // Priority 1: Preset columns
    if (presetColumns?.order?.length > 0) {
      return presetColumns.order.filter((id) => allColumnIds.has(id));
    }
    // Priority 2: User default columns
    if (userDefaultColumns?.order?.length > 0) {
      return userDefaultColumns.order.filter((id) => allColumnIds.has(id));
    }
    // Priority 3: System default columns
    return getDefaultColumnOrder(entityType);
  }, [presetColumns, userDefaultColumns, entityType, allColumnIds]);

  // State for visible column IDs and column order
  const [visibleColumnIds, setVisibleColumnIds] = useState(getInitialVisibleColumnIds);
  const [columnOrder, setColumnOrder] = useState(getInitialColumnOrder);

  /**
   * Compute visible columns with full metadata, in display order
   * Logic:
   * 1. Start with columnOrder
   * 2. Filter to only include columns that exist in allColumns
   * 3. Add any missing columns (new columns) at the end
   * 4. Filter to only show columns that are mandatory OR in visibleColumnIds
   * 5. Map IDs to full column objects
   */
  const visibleColumns = useMemo(() => {
    // Start with current order, filtering to valid columns
    const orderedIds = columnOrder.filter((id) => allColumnIds.has(id));

    // Find any columns in allColumns that aren't in the order (new columns)
    const orderedSet = new Set(orderedIds);
    const missingIds = allColumns
      .filter((col) => !orderedSet.has(col.id))
      .map((col) => col.id);

    // Combine: ordered columns + missing columns at end
    const fullOrder = [...orderedIds, ...missingIds];

    // Filter to visible or mandatory
    const visibleSet = new Set(visibleColumnIds);
    const filteredIds = fullOrder.filter(
      (id) => mandatoryColumnIds.has(id) || visibleSet.has(id)
    );

    // Map to full column objects
    const columnMap = new Map(allColumns.map((col) => [col.id, col]));
    return filteredIds.map((id) => columnMap.get(id)).filter(Boolean);
  }, [columnOrder, allColumnIds, allColumns, visibleColumnIds, mandatoryColumnIds]);

  /**
   * Toggle column visibility (cannot hide mandatory columns)
   * @param {string} columnId - The column ID to toggle
   */
  const toggleColumn = useCallback((columnId) => {
    if (mandatoryColumnIds.has(columnId)) {
      return; // Cannot toggle mandatory columns
    }

    setVisibleColumnIds((prev) => {
      const isVisible = prev.includes(columnId);
      if (isVisible) {
        return prev.filter((id) => id !== columnId);
      } else {
        return [...prev, columnId];
      }
    });
  }, [mandatoryColumnIds]);

  /**
   * Hide a column (cannot hide mandatory columns)
   * @param {string} columnId - The column ID to hide
   */
  const hideColumn = useCallback((columnId) => {
    if (mandatoryColumnIds.has(columnId)) {
      return; // Cannot hide mandatory columns
    }

    setVisibleColumnIds((prev) => prev.filter((id) => id !== columnId));
  }, [mandatoryColumnIds]);

  /**
   * Move a column in the display order
   * @param {string} columnId - The column ID to move
   * @param {"top" | "up" | "down" | "bottom"} direction - Direction to move
   */
  const moveColumn = useCallback((columnId, direction) => {
    setColumnOrder((prev) => {
      const currentIndex = prev.indexOf(columnId);
      if (currentIndex === -1) return prev;

      const newOrder = [...prev];

      switch (direction) {
        case "top":
          if (currentIndex === 0) return prev;
          newOrder.splice(currentIndex, 1);
          newOrder.unshift(columnId);
          break;

        case "up":
          if (currentIndex === 0) return prev;
          newOrder.splice(currentIndex, 1);
          newOrder.splice(currentIndex - 1, 0, columnId);
          break;

        case "down":
          if (currentIndex === prev.length - 1) return prev;
          newOrder.splice(currentIndex, 1);
          newOrder.splice(currentIndex + 1, 0, columnId);
          break;

        case "bottom":
          if (currentIndex === prev.length - 1) return prev;
          newOrder.splice(currentIndex, 1);
          newOrder.push(columnId);
          break;

        default:
          return prev;
      }

      return newOrder;
    });
  }, []);

  /**
   * Get current column configuration for saving
   * @returns {{ visible: string[], order: string[] }}
   */
  const getColumnConfig = useCallback(() => {
    return {
      visible: [...visibleColumnIds],
      order: [...columnOrder],
    };
  }, [visibleColumnIds, columnOrder]);

  /**
   * Reset columns to defaults
   * @param {boolean} useUserDefaults - If true, use user defaults; if false, use system defaults
   */
  const resetToDefaults = useCallback((useUserDefaults = true) => {
    if (useUserDefaults && userDefaultColumns?.visible?.length > 0) {
      setVisibleColumnIds(userDefaultColumns.visible.filter((id) => allColumnIds.has(id)));
    } else {
      setVisibleColumnIds(getDefaultVisibleColumns(entityType));
    }

    if (useUserDefaults && userDefaultColumns?.order?.length > 0) {
      setColumnOrder(userDefaultColumns.order.filter((id) => allColumnIds.has(id)));
    } else {
      setColumnOrder(getDefaultColumnOrder(entityType));
    }
  }, [userDefaultColumns, entityType, allColumnIds]);

  /**
   * Apply columns from a loaded preset
   * @param {{ visible?: string[], order?: string[] }} presetCols - Preset column configuration
   */
  const applyPresetColumns = useCallback((presetCols) => {
    if (presetCols?.visible?.length > 0) {
      setVisibleColumnIds(presetCols.visible.filter((id) => allColumnIds.has(id)));
    }
    if (presetCols?.order?.length > 0) {
      setColumnOrder(presetCols.order.filter((id) => allColumnIds.has(id)));
    }
  }, [allColumnIds]);

  return {
    // Column data
    allColumns,
    visibleColumns,
    visibleColumnIds,
    columnOrder,

    // Column management functions
    toggleColumn,
    hideColumn,
    moveColumn,
    getColumnConfig,
    resetToDefaults,
    applyPresetColumns,
  };
};
