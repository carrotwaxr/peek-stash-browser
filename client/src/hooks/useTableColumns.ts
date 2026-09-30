import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type {
  GetUserSettingsResponse,
  TableColumnsConfig,
  UpdateUserSettingsBody,
} from "@peek/shared-types";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { getErrorMessage } from "../api/client";
import {
  useUpdateUserSettings,
  useUserSettings,
} from "../api/hooks/useUserSettings";
import { queryKeys } from "../api/queryKeys";
import {
  type ColumnConfig,
  getColumnsForEntity,
  getDefaultColumnOrder,
  getDefaultVisibleColumns,
  presetColumnsOf,
} from "../config/tableColumns";
import { showError } from "../utils/toast";

type ColumnMap = Record<string, TableColumnsConfig>;
type SendSettings = (patch: UpdateUserSettingsBody) => Promise<unknown>;
/** A caller waiting for the save that carries its change */
interface Waiter {
  resolve: () => void;
  reject: (err: unknown) => void;
}

/**
 * The column saves of one query client. The PUT replaces the whole
 * `tableColumnDefaults` field, so each save sends the whole map, and saves
 * run one at a time: changes made while one is in flight collapse into one
 * more save of the latest map. A change made before the settings load waits
 * in `early` and is merged into the loaded map. Settings' editor saves its
 * edited types through the same queue (`save`), merged over the latest map.
 */
class ColumnSaves {
  /** Changes made before the settings loaded, by table type */
  early: ColumnMap = {};
  /** The map the user wants while saves are in flight, else null */
  private wanted: ColumnMap | null = null;
  private inFlight = false;
  private queued = false;
  /** Callers of `save` whose change the next save carries */
  private waiting: Waiter[] = [];
  private listeners = new Set<() => void>();

  constructor(private readonly queryClient: QueryClient) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getEarly = () => this.early;

  /** Show `columns` as the type's columns at once and save them. */
  change(type: string, columns: TableColumnsConfig, send: SendSettings) {
    const loaded = this.loadedMap();
    if (!loaded) {
      this.early = { ...this.early, [type]: columns };
      this.notify();
      return;
    }
    this.want({ ...(this.wanted ?? loaded), [type]: columns }, send);
  }

  /**
   * Save `changes` (whole types' columns) over the latest map; settles once
   * a save carrying them has. A failure is reported here, then rejects.
   */
  save(changes: ColumnMap, send: SendSettings): Promise<void> {
    const loaded = this.loadedMap();
    if (!loaded) {
      return Promise.reject(new Error("The settings have not loaded"));
    }
    return new Promise<void>((resolve, reject) => {
      this.waiting.push({ resolve, reject });
      this.want({ ...(this.wanted ?? loaded), ...changes }, send);
    });
  }

  /** Save the changes made before the settings loaded, once they have. */
  flushEarly(send: SendSettings) {
    const loaded = this.loadedMap();
    if (!loaded || Object.keys(this.early).length === 0) return;
    const early = this.early;
    this.early = {};
    this.want({ ...(this.wanted ?? loaded), ...early }, send);
    this.notify();
  }

  private loadedMap(): ColumnMap | null {
    const data = this.queryClient.getQueryData<GetUserSettingsResponse>(
      queryKeys.user.settings()
    );
    return data ? (data.settings.tableColumnDefaults ?? {}) : null;
  }

  private writeCache(map: ColumnMap) {
    this.queryClient.setQueryData<GetUserSettingsResponse>(
      queryKeys.user.settings(),
      (old) =>
        old && { settings: { ...old.settings, tableColumnDefaults: map } }
    );
  }

  private want(map: ColumnMap, send: SendSettings) {
    this.wanted = map;
    this.writeCache(map);
    if (this.inFlight) {
      this.queued = true;
      return;
    }
    this.send(send);
  }

  private send(send: SendSettings) {
    const map = this.wanted;
    if (!map) return;
    this.inFlight = true;
    const carried = this.waiting;
    this.waiting = [];
    send({ tableColumnDefaults: map }).then(
      () => {
        this.inFlight = false;
        for (const waiter of carried) waiter.resolve();
        if (!this.queued) {
          this.wanted = null;
          return;
        }
        // The answer put the sent map in the cache: show the later one again
        this.queued = false;
        if (this.wanted) this.writeCache(this.wanted);
        this.send(send);
      },
      (err: unknown) => {
        this.inFlight = false;
        this.queued = false;
        this.wanted = null;
        // The queued change is dropped with the failed one
        const dropped = [...carried, ...this.waiting];
        this.waiting = [];
        showError(getErrorMessage(err, "Failed to save the table columns"));
        for (const waiter of dropped) waiter.reject(err);
        void this.queryClient.invalidateQueries({
          queryKey: queryKeys.user.settings(),
        });
      }
    );
  }

  private notify() {
    for (const listener of this.listeners) listener();
  }
}

const savesByClient = new WeakMap<QueryClient, ColumnSaves>();

function columnSavesFor(queryClient: QueryClient): ColumnSaves {
  let saves = savesByClient.get(queryClient);
  if (!saves) {
    saves = new ColumnSaves(queryClient);
    savesByClient.set(queryClient, saves);
  }
  return saves;
}

/**
 * Save whole types' columns (Settings' editor) through the tables' queue,
 * merged over the latest saved map, so another type saved meanwhile keeps
 * its columns. Rejects after reporting a failure.
 */
export const useSaveTableColumns = () => {
  const saves = columnSavesFor(useQueryClient());
  const { mutateAsync: send } = useUpdateUserSettings();
  return useCallback(
    (changes: ColumnMap) => saves.save(changes, send),
    [saves, send]
  );
};

/**
 * A table's columns: the user's saved columns for its type
 * (`tableColumnDefaults[entityType]` in the user settings, the same value
 * Settings > Customization edits), else the system default. Every change
 * (show, hide, reorder) shows at once and saves as the type's columns.
 * `applyPresetColumns` shows a preset's columns without saving them (null
 * returns to the saved ones); the next change saves the columns then shown.
 */
export const useTableColumns = (entityType: string) => {
  const queryClient = useQueryClient();
  const saves = columnSavesFor(queryClient);
  const { data } = useUserSettings();
  const { mutateAsync: send } = useUpdateUserSettings();
  const early = useSyncExternalStore(saves.subscribe, saves.getEarly);
  const [presetColumns, setPresetColumns] = useState<ColumnConfig | null>(null);

  const loaded = data !== undefined;
  useEffect(() => {
    if (loaded) saves.flushEarly(send);
  }, [loaded, early, saves, send]);

  const allColumns = useMemo(
    () => getColumnsForEntity(entityType),
    [entityType]
  );
  const allColumnIds = useMemo(
    () => new Set(allColumns.map((col) => col.id)),
    [allColumns]
  );
  const mandatoryColumnIds = useMemo(
    () =>
      new Set(allColumns.filter((col) => col.mandatory).map((col) => col.id)),
    [allColumns]
  );

  const saved = data?.settings.tableColumnDefaults?.[entityType];
  const stored = early[entityType] ?? saved;

  // What the table shows: a preset's columns, else the stored ones, else the
  // system default; unknown ids dropped, and columns the order lacks (added
  // since it was saved) at its end
  const { visibleColumnIds, columnOrder } = useMemo(() => {
    const visible =
      presetColumns?.visible ??
      stored?.visible ??
      getDefaultVisibleColumns(entityType);
    const order =
      presetColumns?.order ??
      (stored?.order && stored.order.length > 0
        ? stored.order
        : getDefaultColumnOrder(entityType));
    const knownOrder = order.filter((id) => allColumnIds.has(id));
    const inOrder = new Set(knownOrder);
    return {
      visibleColumnIds: visible.filter((id) => allColumnIds.has(id)),
      columnOrder: [
        ...knownOrder,
        ...allColumns.map((col) => col.id).filter((id) => !inOrder.has(id)),
      ],
    };
  }, [presetColumns, stored, entityType, allColumns, allColumnIds]);

  const visibleColumns = useMemo(() => {
    const visibleSet = new Set(visibleColumnIds);
    const columnMap = new Map(allColumns.map((col) => [col.id, col]));
    return columnOrder
      .filter((id) => mandatoryColumnIds.has(id) || visibleSet.has(id))
      .map((id) => columnMap.get(id))
      .filter((col) => col !== undefined);
  }, [columnOrder, visibleColumnIds, allColumns, mandatoryColumnIds]);

  /** Show and save the type's columns */
  const change = useCallback(
    (columns: TableColumnsConfig) => {
      setPresetColumns(null);
      saves.change(entityType, columns, send);
    },
    [saves, entityType, send]
  );

  /** Show or hide a column (a mandatory column always shows) */
  const toggleColumn = useCallback(
    (columnId: string) => {
      if (mandatoryColumnIds.has(columnId)) return;
      change({
        visible: visibleColumnIds.includes(columnId)
          ? visibleColumnIds.filter((id) => id !== columnId)
          : [...visibleColumnIds, columnId],
        order: columnOrder,
      });
    },
    [mandatoryColumnIds, visibleColumnIds, columnOrder, change]
  );

  /** Hide a column (a mandatory column always shows) */
  const hideColumn = useCallback(
    (columnId: string) => {
      if (
        mandatoryColumnIds.has(columnId) ||
        !visibleColumnIds.includes(columnId)
      ) {
        return;
      }
      change({
        visible: visibleColumnIds.filter((id) => id !== columnId),
        order: columnOrder,
      });
    },
    [mandatoryColumnIds, visibleColumnIds, columnOrder, change]
  );

  /** Move a column in the display order */
  const moveColumn = useCallback(
    (columnId: string, direction: "top" | "up" | "down" | "bottom") => {
      const index = columnOrder.indexOf(columnId);
      const last = columnOrder.length - 1;
      const target =
        direction === "top"
          ? 0
          : direction === "up"
            ? index - 1
            : direction === "down"
              ? index + 1
              : last;
      if (index === -1 || target < 0 || target > last || target === index) {
        return;
      }
      const order = columnOrder.filter((id) => id !== columnId);
      order.splice(target, 0, columnId);
      change({ visible: visibleColumnIds, order });
    },
    [columnOrder, visibleColumnIds, change]
  );

  const columnConfig = useMemo(
    () => ({ visible: visibleColumnIds, order: columnOrder }),
    [visibleColumnIds, columnOrder]
  );
  /** The columns shown, as a preset saves them */
  const getColumnConfig = useCallback(() => columnConfig, [columnConfig]);

  /** Show a preset's columns for this page without saving them; null (a
   * preset without columns) shows the saved columns again */
  const applyPresetColumns = useCallback((columns: ColumnConfig | null) => {
    setPresetColumns(presetColumnsOf(columns));
  }, []);

  return {
    allColumns,
    visibleColumns,
    visibleColumnIds,
    columnOrder,
    toggleColumn,
    hideColumn,
    moveColumn,
    getColumnConfig,
    applyPresetColumns,
  };
};
