# Sync Architecture

Peek maintains a local SQLite cache of Stash data to enable performant queries, per-user features, and offline resilience. This document describes the sync mechanisms that keep the cache in sync with Stash.

---

## Overview

Peek provides three sync strategies, each optimized for different use cases:

| Sync Type | When Used | Performance | Data Freshness |
|-----------|-----------|-------------|----------------|
| **Full Sync** | Initial setup, manual trigger | Slowest | Complete |
| **Incremental Sync** | Manual trigger with "since" parameter | Medium | Partial |
| **Smart Incremental Sync** | Automatic on startup | Fastest | Optimal |

---

## Sync Types

### Full Sync

**Purpose:** Complete refresh of all data from Stash.

**Triggered by:**
- Initial setup (first sync)
- Manual "Full Sync" button in UI
- Recovery from corrupted state

**Process:**
1. Sync all entity types in dependency order: studios, tags, performers, groups, galleries, scenes, images
2. Apply gallery inheritance (performers, tags, studio, date, etc. propagate from galleries to images)
3. Compute scene tag inheritance
4. Rebuild inherited image counts
5. Rebuild user stats
6. Recompute user exclusions

**Characteristics:**
- **Always runs gallery inheritance** regardless of what changed
- Slowest option but guarantees complete data consistency
- Safe recovery mechanism for any sync issues

### Incremental Sync

**Purpose:** Sync only entities that changed since a given timestamp.

**Triggered by:**
- Manual "Incremental Sync" button with date/time parameter

**Process:**
1. Sync all entity types, but only fetch entities with `updated_at > since`
2. Clean up deleted entities (detect deletions/merges in Stash)
3. **Conditionally** apply gallery inheritance (if images OR galleries synced)
4. **Conditionally** compute scene tag inheritance (if scenes synced)
5. Rebuild inherited image counts
6. Rebuild user stats
7. Recompute user exclusions

**Characteristics:**
- Faster than full sync for small changesets
- Gallery inheritance runs if **either** images or galleries were updated
- Useful for syncing recent changes without full resync

### Smart Incremental Sync

**Purpose:** Efficiently sync only what's needed, per-entity-type.

**Triggered by:**
- Automatic on server startup
- Scheduled sync intervals
- Manual "Smart Sync" button

**Process:**
1. For each entity type independently:
   - Check last sync timestamp for that specific entity type
   - Query Stash for change count since that timestamp
   - If changes: sync that entity type
   - If no changes: skip entirely
2. Clean up deleted entities
3. **Conditionally** apply gallery inheritance (if images OR galleries synced)
4. **Conditionally** compute scene tag inheritance (if scenes synced)
5. Rebuild inherited image counts
6. Rebuild user stats
7. Recompute user exclusions

**Characteristics:**
- Fastest for typical usage (many entity types unchanged)
- Per-entity-type tracking prevents unnecessary work
- Gallery inheritance runs if **either** images or galleries were updated

---

## Entity Sync Order

All sync types process entities in dependency order:

```
1. studios     (no dependencies)
2. tags        (no dependencies)
3. performers  (no dependencies)
4. groups      (depends on studios, tags)
5. galleries   (depends on studios, performers, tags)
6. scenes      (depends on studios, performers, tags, groups, galleries)
7. images      (depends on studios, performers, tags, galleries)
```

This order ensures foreign key relationships are satisfied.

---

## Post-Sync Processing

### Gallery Inheritance

Images can inherit metadata from their parent galleries:

**Inherited fields:**
- `studioId` (if image has none)
- `date` (if image has none)
- `photographer` (if image has none)
- `details` (if image has none)
- Performers (via `ImagePerformer` junction table)
- Tags (via `ImageTag` junction table)

**Rules:**
- Only copies metadata if the image field is NULL/empty
- Never overwrites existing image metadata
- Uses first gallery if image is in multiple galleries

**Trigger conditions:**
- Full sync: Always runs
- Incremental sync: Runs if images OR galleries were synced
- Smart incremental: Runs if images OR galleries were synced

### Scene Tag Inheritance

Scenes inherit tags from their performers and studios:

- Performer tags propagate to scenes featuring that performer
- Studio tags propagate to scenes from that studio
- Stored in `SceneInheritedTag` for efficient querying

**Trigger conditions:**
- Full sync: Always runs
- Incremental sync: Runs if scenes were synced
- Smart incremental: Runs if scenes were synced

### Image Count Rebuild

Maintains denormalized image counts on entities:

- Performers: Count of images featuring them
- Tags: Count of images with that tag
- Studios: Count of images from that studio
- Galleries: Count of images in that gallery

**Always runs** after any sync to ensure consistency.

---

## Sync State Tracking

Each entity type maintains its own sync state:

```sql
CREATE TABLE SyncState (
  id TEXT PRIMARY KEY,
  stashInstanceId TEXT,
  entityType TEXT,              -- 'scene', 'performer', 'studio', etc.
  lastFullSyncTimestamp TEXT,   -- RFC3339 timestamp from Stash
  lastIncrementalSyncTimestamp TEXT
);
```

Smart incremental sync uses the more recent of `lastFullSyncTimestamp` or `lastIncrementalSyncTimestamp` for each entity type independently.

---

## Troubleshooting

### Images not showing expected performers/tags

**Symptom:** Filtering images by performer returns 0 results, but the performer is associated with the gallery.

**Cause:** Gallery inheritance didn't run after galleries were updated.

**Solution:** Run a full sync to ensure inheritance is applied.

### Stale data after Stash changes

**Symptom:** Changes made in Stash don't appear in Peek.

**Cause:** Smart incremental sync may have missed changes if Stash's `updated_at` timestamps weren't updated.

**Solution:** Run a full sync, or incremental sync with an earlier timestamp.

### Sync appears stuck

**Symptom:** Sync progress stops or takes unusually long.

**Cause:** Large datasets or network issues with Stash.

**Solution:** Check Peek logs for errors. Consider syncing entity types individually.

---

## Testing Strategy

### How to catch sync parity bugs

The bug fixed in v3.1.0-beta.13 was that `smartIncrementalSync` was missing gallery inheritance. To catch this type of bug:

**1. Integration tests for end-to-end behavior:**

Add a test entity `galleryWithPerformerNoDirectImagePerformer` - a gallery that has a performer, containing images that do NOT have that performer directly assigned. Then test:

```typescript
it("filters images by performer inherited from gallery", async () => {
  const response = await adminClient.post("/api/library/images", {
    filter: { per_page: 50 },
    image_filter: {
      performers: {
        value: [TEST_ENTITIES.galleryPerformerNotOnImages],
        modifier: "INCLUDES",
      },
    },
  });

  expect(response.ok).toBe(true);
  expect(response.data.findImages.count).toBeGreaterThan(0);
});
```

This test will fail if gallery inheritance doesn't run.

**2. Behavioral parity checks:**

When adding post-sync processing to one sync method, verify all three methods have equivalent processing. The three sync methods should have the same set of post-processing steps:

- Gallery inheritance (conditional on images/galleries synced)
- Scene tag inheritance (conditional on scenes synced)
- Image count rebuild
- User stats rebuild
- Exclusion recomputation

---

## Implementation Reference

The sync logic is implemented in:

- `server/services/StashSyncService.ts` - Main sync orchestration
- `server/services/ImageGalleryInheritanceService.ts` - Gallery-to-image inheritance
- `server/services/SceneTagInheritanceService.ts` - Scene tag inheritance
- `server/services/EntityImageCountService.ts` - Image count denormalization
