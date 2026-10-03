/**
 * The ids of the row editor's controls, shared by the row that draws them
 * and the editor that moves focus to them.
 */
import type { ContainerId } from "../../utils/filterFields";

/** The ids of a row's controls, from its id (unique per row, so two Tags rows never share one) */
export const rowControlIds = (rowId: string) => ({
  value: `filter-${rowId}`,
  field: `filter-${rowId}-field`,
  condition: `filter-${rowId}-condition`,
  actions: `filter-${rowId}-actions`,
});

/** The waiting row's field select in a container */
export const waitingSelectId = (containerId: ContainerId) =>
  `filter-waiting-${containerId}`;
