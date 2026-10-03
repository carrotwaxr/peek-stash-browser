/**
 * One filter-state hook for every filter surface (Contract 11): the list's
 * flat prefixed filters and their tree, the panel's free options, and the
 * row operations. It wraps `useListUrlState`'s `filters` and `applyFilters`,
 * which stays the only writer: the chip bar commits live, and the sheet and
 * the Advanced view hold a draft and call `commit` once.
 */
import { useCallback, useMemo } from "react";
import type { ListKind, RowKey } from "@peek/shared-types";
import {
  type FilterOption,
  type PanelState,
  type PanelTree,
  removeGroup,
  removeRow,
  setRow,
  treeOf,
} from "../utils/filterFields";
import { withoutLockedOptions } from "../utils/listQuery";
import type { ListUrlState } from "./useListUrlState";

export interface CommitOptions {
  history?: "push" | "replace";
}

export interface ListFilters {
  readonly kind: ListKind;
  /** The whole flat prefixed state (Contract 3): root rows, repeats, groups, `match` */
  readonly filters: PanelState;
  /** treeOf(kind, filters) */
  readonly tree: PanelTree;
  /** The free rows: the list's options without view-locked fields (timeline date, folder) */
  readonly options: readonly FilterOption[];
  commit(next: PanelState, opts?: CommitOptions): void;
  /** Replace one row's state (FieldEditor's onChange); a missing row is added */
  setRow(at: RowKey, next: PanelState, opts?: CommitOptions): void;
  removeRow(at: RowKey): void;
  removeGroup(group: number): void;
  /** Every row and group removed; on the list, the active View goes too */
  clear(): void;
}

export function useListFilters(
  kind: ListKind,
  listState: ListUrlState,
  options: readonly FilterOption[]
): ListFilters {
  const {
    filters,
    viewLockedFields,
    applyFilters,
    clearFilters: clearAll,
  } = listState;

  const tree = useMemo(() => treeOf(kind, filters), [kind, filters]);
  // The page's own locks are offered (their rows are AND-ed with the page's
  // criterion, FILTERS-12); only the fields the view fixes are left out
  const free = useMemo(
    () => withoutLockedOptions(kind, [...options], viewLockedFields),
    [kind, options, viewLockedFields]
  );

  const commit = useCallback(
    (next: PanelState, opts?: CommitOptions) => applyFilters(next, opts),
    [applyFilters]
  );

  return useMemo(
    () => ({
      kind,
      filters,
      tree,
      options: free,
      commit,
      setRow: (at, next, opts) => commit(setRow(kind, filters, at, next), opts),
      removeRow: (at) => commit(removeRow(kind, filters, at)),
      removeGroup: (group) => commit(removeGroup(kind, filters, group)),
      // Clear all leaves no View, as `listState.clearFilters` writes it
      clear: clearAll,
    }),
    [kind, filters, tree, free, commit, clearAll]
  );
}
