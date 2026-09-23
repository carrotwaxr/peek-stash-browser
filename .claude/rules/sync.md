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
- `syncSingleEntity`, from the plugin webhook in `routes/sync.ts`: one entity, and no post-sync steps at all.

## Ordering

- Sync tags before anything that references them: junction rows such as `StudioTag` have foreign keys to `StashTag`, `foreign_keys` is ON, and `INSERT OR IGNORE` does not suppress foreign key errors. `fullSync` and `incrementalSync` go tags, studios, performers, groups, galleries, scenes, clips, images. `smartIncrementalSync` currently does studios before tags.
- After a full sync: scene tag inheritance, image gallery inheritance, entity image counts, user stats, tag scene counts, exclusion recompute, in that order.
- The incremental paths run image gallery inheritance only when images or galleries changed, and scene tag inheritance only when scenes changed. Scene tag inheritance also reads performer, studio and group tags, so a tag change on one of those stays unapplied until a scene changes or a full sync runs.

## Timestamps

- Stash stores sub-second timestamps but returns whole seconds. `formatTimestampForStash` appends `.999`; without it, incremental sync fetches the entities from the last second again, forever.
- The "since" time is the newer of the last full and the last incremental sync (`getMostRecentSyncTime`).

## Cleanup

`cleanupDeletedEntities` sets `deletedAt` on rows Stash no longer returns. A truncated ID list from Stash would soft-delete the library, so it:

- skips when Stash returns no IDs but the cache has rows, or page 1 is empty while the count is not;
- for scenes, aborts when more than `MAX_CLEANUP_DELETE_RATIO` (0.5) of the live rows would go;
- for scenes, runs the TEMP table create, insert, `NOT IN` select and drop in one interactive `$transaction`. A TEMP table lives on one connection, and nothing pins Prisma's pool to one connection (comments claiming `connection_limit=1` are wrong) (#526).

Keep all three when changing cleanup. The other entity types lack the ratio guard so far.

## Raw SQL

Several junction writes build SQL with `this.escape()` and string interpolation. Keep the escaping when touching them, and use `?` parameters in new code.

## Tests

- `server/tests/services/StashSyncService.cleanup.test.ts` mocks `$transaction` as `cb => cb(mockPrisma)`. Its `afterEach` runs `vi.restoreAllMocks()`, which wipes that implementation, so `beforeEach` sets it again.
- Real-SQLite coverage is in `server/integration/services/StashSyncService.cleanup.integration.test.ts`. It seeds rows under a made-up `stashInstanceId` that real sync never touches, and spies on `getStashClient` to control what Stash returns.
