# Incremental Sync Per-Entity Timestamp Fix

**Issue:** #200 (Part 1) - Full performer sync on every incremental sync
**Date:** 2025-12-26
**Status:** Draft

## Problem

Every scheduled incremental sync performs a complete resync of all performers (1,947 entities taking 10+ minutes), even when no performers have changed. The user's logs show the sync timestamp remains unchanged across multiple sync cycles:

```
"since":"2025-12-17T08:18:12.430Z" (unchanged across all syncs)
Performers synced: 1,947 consistently
Duration: 663-996 seconds per sync
```

The application becomes unavailable for ~10 minutes during each hourly sync.

## Root Cause Analysis

In `StashSyncService.incrementalSync()`, the code retrieves the last sync timestamp using `getLastSyncTime()`:

```typescript
// StashSyncService.ts:405
const lastSync = await this.getLastSyncTime(stashInstanceId);
```

This method only queries the **scene** entity type's timestamp:

```typescript
// StashSyncService.ts:2158-2167
private async getLastSyncTime(stashInstanceId?: string): Promise<Date | null> {
  const syncState = await prisma.syncState.findFirst({
    where: {
      stashInstanceId: stashInstanceId || null,
      entityType: "scene", // <-- Only looks at scene!
    },
  });
  return syncState?.lastFullSync || syncState?.lastIncrementalSync || null;
}
```

This same timestamp is then used for ALL entity types (performers, tags, studios, etc.):

```typescript
// StashSyncService.ts:429
result = await this.syncPerformers(stashInstanceId, false, lastSync);
```

The database schema stores per-entity-type timestamps (`SyncState.entityType`), but `incrementalSync()` ignores them.

## Solution

Replace `incrementalSync()` with per-entity timestamp logic, similar to what `smartIncrementalSync()` already does correctly.

### Option A: Refactor incrementalSync to Use Per-Entity Timestamps (Recommended)

Modify `incrementalSync()` to:
1. Loop through each entity type
2. Get that entity type's specific last sync timestamp using `getEntitySyncState()`
3. Only sync entities changed since that timestamp

This matches how `smartIncrementalSync()` works but without the change count check.

### Option B: Replace incrementalSync with smartIncrementalSync

Change the scheduler to call `smartIncrementalSync()` instead of `incrementalSync()`.

**Trade-off:** `smartIncrementalSync` does an extra API call per entity type to check change counts before syncing. This adds latency but can skip entity types with zero changes entirely.

## Design Decision

**Use Option A** - Refactor `incrementalSync()` to use per-entity timestamps.

Rationale:
- Maintains separation between "smart" sync (checks change counts, used on startup) and regular incremental sync (used on schedule)
- Avoids extra API calls on every scheduled sync
- Fixes the core bug without changing sync behavior

## Implementation Plan

### 1. Refactor incrementalSync method

Replace the single `getLastSyncTime()` call with per-entity lookups:

```typescript
async incrementalSync(stashInstanceId?: string): Promise<SyncResult[]> {
  // ... existing setup code ...

  const entityTypes: EntityType[] = [
    "tag", "studio", "performer", "group", "gallery", "scene", "image",
  ];

  for (const entityType of entityTypes) {
    this.checkAbort();

    // Get THIS entity type's last sync timestamp
    const syncState = await this.getEntitySyncState(stashInstanceId, entityType);
    const lastSync = syncState?.lastFullSync || syncState?.lastIncrementalSync;

    if (!lastSync) {
      // Never synced - do full sync for this entity type
      const result = await this.syncEntityType(entityType, stashInstanceId, true);
      results.push(result);
      await this.saveSyncState(stashInstanceId, "full", result);
    } else {
      // Incremental sync using this entity's timestamp
      const result = await this.syncEntityType(entityType, stashInstanceId, false, lastSync);
      results.push(result);
      await this.saveSyncState(stashInstanceId, "incremental", result);
    }
  }

  // ... rest of method ...
}
```

### 2. Remove getLastSyncTime method

This method is no longer needed after the refactor. Remove it to prevent future misuse.

### 3. Add logging for visibility

Log which timestamp is being used for each entity type:

```typescript
logger.info(`${entityType}: syncing changes since ${lastSync.toISOString()}`);
```

## Files to Modify

- `server/services/StashSyncService.ts`
  - Refactor `incrementalSync()` method
  - Remove `getLastSyncTime()` method

## Testing

1. Run a full sync to establish baseline timestamps
2. Wait for scheduled incremental sync
3. Verify logs show different timestamps per entity type
4. Verify performer sync only fetches changed performers (count should be 0 or minimal if nothing changed)
5. Verify total sync time is greatly reduced when no changes exist

## Rollback Plan

If issues arise, revert the `incrementalSync()` changes. The `smartIncrementalSync()` method remains unchanged as a fallback.
