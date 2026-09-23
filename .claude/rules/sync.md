---
paths:
  - "server/services/StashSyncService.ts"
  - "server/services/SyncScheduler.ts"
  - "server/tests/**/StashSyncService*"
  - "server/integration/**/StashSyncService*"
---

# Stash sync

## Ordering

- Entity order is tags, studios, performers, groups, galleries, scenes, clips, images: later types write junction rows that point at earlier ones.
- After a full sync: scene tag inheritance, image gallery inheritance, entity image counts, user stats, tag scene counts, exclusion recompute, in that order. Incremental sync runs the image gallery step, then the scene tag step, each only when its entity types changed; the rest always runs.

## Timestamps

- Stash stores sub-second timestamps but returns whole seconds. `formatTimestampForStash` appends `.999`; without it, incremental sync fetches the entities from the last second again, forever.
- The "since" time is the newer of the last full and the last incremental sync (`getMostRecentSyncTime`).

## Cleanup

`cleanupDeletedEntities` sets `deletedAt` on rows Stash no longer returns. A truncated ID list from Stash would soft-delete the library, so it:

- skips when Stash returns no IDs but the cache has rows, or page 1 is empty while the count is not;
- for scenes, aborts when more than `MAX_CLEANUP_DELETE_RATIO` (0.5) of the live rows would go;
- for scenes, runs the TEMP table create, insert, `NOT IN` select and drop in one interactive `$transaction`, because a TEMP table lives on one connection (#526).

Keep all three when changing cleanup. The other entity types lack the ratio guard so far.

## Raw SQL

Several junction writes build SQL with `this.escape()` and string interpolation. Keep the escaping when touching them, and use `?` parameters in new code.

## Tests

- `server/tests/services/StashSyncService.cleanup.test.ts` mocks `$transaction` as `cb => cb(mockPrisma)`. Its `afterEach` runs `vi.restoreAllMocks()`, which wipes that implementation, so `beforeEach` sets it again.
- Real-SQLite coverage is in `server/integration/services/StashSyncService.cleanup.integration.test.ts`. It seeds rows under a made-up `stashInstanceId` that real sync never touches, and spies on `getStashClient` to control what Stash returns.
