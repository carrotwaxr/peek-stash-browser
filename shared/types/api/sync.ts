// shared/types/api/sync.ts
/**
 * Sync API types: /api/sync/* (admins only).
 *
 * The status names each Stash instance by its id and display name only:
 * never its address or API key.
 */

/**
 * What holds the sync service's one lock: a sync, or the removal of a
 * deleted instance's cached library.
 */
export type SyncJob = "sync" | "instance-delete";

/** One entity type's sync state on one instance (a `SyncState` row). */
export interface SyncEntityState {
  /** `tag`, `studio`, `performer`, `group`, `gallery`, `scene`, `clip` or `image` */
  entityType: string;
  /**
   * The newest `updated_at` Stash returned in the last full or incremental
   * sync (RFC3339, as Stash wrote it): where the next sync starts.
   */
  lastFullSyncTimestamp: string | null;
  lastIncrementalSyncTimestamp: string | null;
  /** When those syncs ran (ISO timestamps). */
  lastFullSyncActual: string | null;
  lastIncrementalSyncActual: string | null;
  /** Rows the last run synced, and how long it took. */
  lastSyncCount: number;
  lastSyncDurationMs: number | null;
  /**
   * The last run's problem with this type (a Stash or database error, a
   * cleanup that was skipped, refused or failed), or null when it synced
   * cleanly.
   */
  lastError: string | null;
  totalEntities: number;
}

/** A configured Stash instance and its entity types' sync states. */
export interface SyncInstanceStatus {
  instanceId: string;
  name: string;
  enabled: boolean;
  /** In sync order: tags first, images last. */
  states: SyncEntityState[];
}

/** GET /api/sync/status */
export interface SyncStatusResponse {
  /** A sync is running. */
  inProgress: boolean;
  /** What holds the lock, if anything: a sync or an instance's removal. */
  activeJob: SyncJob | null;
  settings: {
    syncIntervalMinutes: number;
    enableScanSubscription: boolean;
  };
  /** Every configured instance, enabled or not, in priority order. */
  instances: SyncInstanceStatus[];
}
