---
paths:
  - "server/services/StashSyncService.ts"
  - "server/services/SyncScheduler.ts"
  - "server/services/SceneTagInheritanceService.ts"
  - "server/services/ImageGalleryInheritanceService.ts"
  - "server/services/EntityImageCountService.ts"
  - "server/routes/sync.ts"
  - "server/tests/**/StashSyncService*"
  - "server/integration/**/StashSyncService*"
---

# Stash sync

## Sync paths

- `fullSync`: every entity, then every post-sync step.
- `incrementalSync` and `smartIncrementalSync` (the startup path, from `SyncScheduler`): entities changed since the last sync, then the post-sync steps below.

## Ordering

- Sync tags before anything that references them: junction rows such as `StudioTag` have foreign keys to `StashTag`, `foreign_keys` is ON, and `INSERT OR IGNORE` does not suppress foreign key errors. Every path, and its cleanups, goes in `SYNC_ORDER`: tags, studios, performers, groups, galleries, scenes, clips, images.
- One type's failure does not stop the others. `runEntityType` syncs a type (and, on the full path, cleans it up) and saves its `SyncState`: a Stash or database error becomes the type's `lastError` (through `describeStashError`), its timestamps stay, so the next sync retries it from its old "since", and the loop goes on. A cleanup that skips, refuses or fails adds its text after it (`recordEntityError` on the incremental paths); a smart sync that skips an unchanged type sets `lastError` to null. An abort is different: it throws `Error("Sync aborted")`, saves nothing, and ends the whole run, every instance (`getChangeCount` rethrows it too). The post-sync steps still run after a failed type: they are library-wide.
- After a full sync: scene tag inheritance, image gallery inheritance, entity image counts, user stats, tag scene counts, exclusion recompute, in that order.
- The incremental paths run image gallery inheritance only when images or galleries changed, and scene tag inheritance only when scenes changed. Scene tag inheritance also reads performer, studio and group tags, so a tag change on one of those stays unapplied until a scene changes or a full sync runs.

## Timestamps

- Stash stores sub-second timestamps but returns whole seconds. `formatTimestampForStash` appends `.999`; without it, incremental sync fetches the entities from the last second again, forever.
- The "since" time is the newer of the last full and the last incremental sync (`getMostRecentSyncTime`).
- `SyncState` is one row per instance and type (`stashInstanceId` NOT NULL). Every reader names its instances: `getSyncStatus` lists the configured instances (`GET /api/sync/status`, no address), and `isReady`, `getLastRefreshed` and the startup sync's full-or-smart choice read only the enabled instances' rows.

## Cleanup

`cleanupDeletedEntities` sets `deletedAt` on rows Stash no longer returns, for all eight types through one routine (`ENTITY_TABLES`, `CLEANUP_ID_FETCHERS`). A truncated id list from Stash would soft-delete the library, so it:

- skips when a page comes back empty before Stash's own count is reached (a partial list), and when Stash returns no ids while the cache has live rows;
- refuses, for every type, when more than `MAX_CLEANUP_DELETE_RATIO` (0.5) of the live rows would go and more than `CLEANUP_MIN_GUARDED_DELETES` (50), so a small library can still lose most of its rows;
- computes the delete set in one statement, `"id" NOT IN (SELECT value FROM json_each(?))` with Stash's whole list as one JSON parameter: no TEMP table (a TEMP table lives on one pooled connection, #526), no transaction, no bound-variable ceiling (Prisma's `notIn` binds one variable per id, and SQLite stops at 250,000). 178 ms for 260k image ids on the prod copy.

Keep all three when changing cleanup. `softDeleteMissing` writes 500 rows per `dbWrite` unit, binding `deletedAt` as epoch milliseconds, as Prisma stores a `DateTime`. The routine returns a `CleanupOutcome`: `deleted` and `deletedIds`, `stashIds` when it ran to the end, `skipped` for a guard's refusal, `error` for a failure. An abort rethrows. `skipped` is the text the type's `lastError` shows: `Cleanup skipped: ...` for a partial or empty list, `Cleanup refused: ...` with the counts for the ratio guard; a failure is stored as `Cleanup failed: ...`. Keep the prefixes: they are how a reader of `lastError` tells a refusal from a skip.

Merges (`MergeReconciliationService`): the scene branch soft-deletes first and then calls `reconcileDeletedScenes(instanceId, deleted)`, so scenes that leave Stash together are never each other's target. A scene merges only into the one live scene of its own instance sharing its phash; with several it waits in Merge Recovery. Each scene cleanup starts with `reconcileRecentDeletions`, the catch-up for scenes soft-deleted in the last 24 hours with activity and no `MergeRecord` as source.

## Deleting an instance

- Lock: the service runs one job at a time, `activeJob` (`"sync"` or `"instance-delete"`). `isSyncing()` is true while either holds it; `getSyncStatus().inProgress` only for a sync. `deleteInstance` throws `SyncBusyError` when the lock is held, and `deleteStashInstance` answers 409.
- Queue: a change already saved (an instance added, or its URL or key changed) calls `queueFullSync(id)`, which starts now or queues the sync for when the lock frees, and the response says `sync: "started" | "queued" | "none"`. `release()` starts one queued full sync, every instance first (it covers the ones queued singly); `abort()` drops the queue; `deleteInstance` drops its instance's entry. An explicit click answers 409 instead (`/api/sync/trigger`, `/api/stats/refresh-cache`).
- Background callers log an abort as "Sync aborted" at info through `logSyncFailure` (`utils/syncLog.ts`), and anything else at error level.
- Instance row first: one `dbWriteBatch` deletes the `StashInstance` row (`UserStashInstance` cascades), its `SyncState`, every user's own rows for it (history, the seven rating tables, image views, playlist entries, hides, entity downloads, merge records with it on either side) and the derived stats and rankings; rows with `instanceId = ''` stay. Then `stashInstanceManager.reload()`, and the request is answered.
- Cascade: the cached library goes afterwards, still under the lock. Junction rows go by their composite `ON DELETE CASCADE` keys; never delete a junction by a bare entity id, which removes the same id's rows on every instance.
- Chunked purge: `purgeInstanceCache` deletes 1,000 rows per `dbWrite` unit, `UserExcludedEntity` first (by id, since it has no `instanceId` index), then the eight entity tables, clips to tags, then `SyncState`. It checks the abort flag before every chunk and stops there.
- Startup sweep: `purgeUnknownInstanceCaches`, called by `initializeCache` before the scheduler starts, purges every instance id in the eight tables or `SyncState` without a `StashInstance` row, so a failed or aborted purge finishes at the next start. It does nothing when no instance exists.

## Stash requests

- Every `StashClient` request fails after `STASH_REQUEST_TIMEOUT_MS` (120 s) with `StashRequestTimeoutError`. While a job holds the lock, `getStashClient` returns `client.withSignal(abortController.signal)`, so `abort()` ends a request in flight with `Error("Sync aborted")`. A test's stub client used under the lock needs `withSignal` (returning the stub).
- Report a Stash failure through `describeStashError`: a graphql-request `ClientError`'s own message embeds the query and its variables. It gives the operation, each GraphQL message with its `path` (the field that broke) and the HTTP status.

## Raw SQL

Several junction writes build SQL with `this.escape()` and string interpolation. Keep the escaping when touching them, and use `?` parameters in new code.

## Tests

- `server/tests/services/StashSyncService.cleanup.test.ts` mocks Prisma with `tests/helpers/prismaMock.ts`, routes `$queryRawUnsafe` by statement shape and spies on `dbWrite`.
- Real-SQLite coverage is in `server/integration/services/StashSyncService.cleanup.integration.test.ts`, every type: it seeds rows under two made-up instances with the same ids, which real sync never touches, and spies on `stashInstanceManager.get` to page what Stash returns.
