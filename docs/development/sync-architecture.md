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

An upgrade does not start a full sync. A migration that needs Peek to refetch some entity types clears their timestamps in `SyncState`, and the next sync (at startup or scheduled) fetches those types whole, the others incrementally. See [Sync State Tracking](#sync-state-tracking).

**Process:**
1. Sync all entity types in [dependency order](#entity-sync-order), each followed by its [cleanup](#cleanup-safety), on every instance
2. Then, once for the whole sync: compute scene tag inheritance, apply gallery inheritance (performers, tags, studio, date, etc. propagate from galleries to images), rebuild inherited image counts, rebuild user stats, recompute the exclusions of every user

**Characteristics:**
- **Always runs every post-sync step**, whole library, whatever changed: it is the catch-all for links Stash edits without moving `updated_at` (tag and performer merges, images added to a gallery)
- Slowest option but guarantees complete data consistency
- Safe recovery mechanism for any sync issues

### Incremental Sync

**Purpose:** Sync only entities that changed since a given timestamp.

**Triggered by:**
- Manual "Incremental Sync" button with date/time parameter

**Process:**
1. Sync all entity types, but only fetch entities with `updated_at > since`
2. Clean up deleted entities (detect deletions/merges in Stash)
3. After every instance, the [post-sync steps](#post-sync-processing) once, only for what changed; nothing changed means none of them runs

**Characteristics:**
- Faster than full sync for small changesets
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
3. After every instance, the [post-sync steps](#post-sync-processing) once, only for what changed; a sync in which Stash reports no change runs none of them

**Characteristics:**
- Fastest for typical usage (many entity types unchanged)
- Per-entity-type tracking prevents unnecessary work
- A no-op sync costs the change probes and the cleanup id lists, nothing else

---

## Entity Sync Order

Every sync type processes entities in the same dependency order, and runs its cleanups in it too:

```
1. tags        (no dependencies)
2. studios     (depends on tags)
3. performers  (depends on tags)
4. groups      (depends on studios, tags)
5. galleries   (depends on studios, performers, tags)
6. scenes      (depends on studios, performers, tags, groups, galleries)
7. clips       (depends on scenes, tags)
8. images      (depends on studios, performers, tags, galleries)
```

This order ensures foreign key relationships are satisfied: a junction row such as a studio's tag has a foreign key to the tag, which must already be stored.

**One failing type does not stop the rest.** When Stash (or the database) fails on one type, Peek records the error in that type's sync state, leaves its timestamps where they were so the next sync retries it, and goes on with the next type. The post-sync steps still run. Aborting a sync is different: it stops the whole run, every instance, and records nothing.

---

## Cleanup Safety

After syncing, each entity type runs a cleanup: Peek asks Stash for every id of that type (5,000 a page) and soft-deletes the cached rows Stash no longer lists, because they were deleted or merged there. All eight types (scenes, performers, studios, tags, collections, galleries, images and clips) use the same routine and the same guards, because a truncated list from Stash would otherwise hide most of the library:

| Guard | When | Result |
|-------|------|--------|
| Partial list | A page comes back empty before Stash's own count is reached ("Stash returned 100 of 120 scenes") | Skipped |
| Empty list | Stash returns no ids while Peek has live rows of that type | Skipped |
| Ratio | More than half of the live rows would go, and more than 50 of them | Refused |

The ratio guard has a floor of 50 rows, so a small library can still lose most of a type when Stash really did (8 of 10 tags, say). A skip or refusal soft-deletes nothing, and the next sync checks again. The server log names each skip (a warning) and refusal (an error) with its counts, and any Stash or database error in a cleanup; either way the sync moves on to the next type. Each is also kept in the type's `lastError` (see [Sync State Tracking](#sync-state-tracking)): `Cleanup skipped: Stash returned 100 of 120 scenes (page 2 was empty)`, `Cleanup refused: Stash no longer lists 812 of 1,200 scenes (more than half); ...`, or `Cleanup failed: ...`. The admin sees them in Settings → Server Configuration → Sync status. A refusal there has an **Apply deletions** button: after a confirmation, `POST /api/sync/cleanup` runs that one type's cleanup under the sync lock (409 while a sync or an instance deletion runs) with the ratio guard off and the partial and empty list guards still on, and records its outcome in `lastError` (null once it ran clean).

How the delete set is computed: one SQL statement compares the cached rows with Stash's whole id list, bound as one JSON parameter (`"id" NOT IN (SELECT value FROM json_each(?))`), so there is no limit on library size and no transaction: 178 ms for 260,599 image ids on a production copy. The rows then go in batches of 500, each a short write-queue unit. Scenes then move user data from merged scenes to their survivors (see [Merge Detection](../user-guide/merge-detection.md)).

---

## Post-Sync Processing

The steps below run once per sync, after every instance has synced, not once per instance. Each sync collects a change set (`SyncChangeSet`): every batch reports which of its rows changed, and every cleanup which rows it soft-deleted. An entity counts as changed when it is new, its `stashUpdatedAt` differs, it was soft-deleted and is back, or (for every type but images) its junction rows or studio differ from what was stored. An image's junction rows and studio are never compared, because gallery inheritance writes into them.

- **Full sync**: every step, whole library, and every user's exclusions are recomputed.
- **Incremental and smart sync**: nothing changed and no user holds `pending` exclusion rows means no step runs at all (the log says `nothing changed, post-sync steps skipped`). Otherwise the change set decides which steps run, as each step's trigger conditions say, and the exclusion recompute covers the users whose instance scope holds a changed instance (plus users with pending holds), not everyone.
- **Apply deletions** (the sync status's action after a refused cleanup) runs the steps for what it soft-deleted.
- A sync that is aborted or fails before its steps hands its change set to the next sync, so the steps still cover what it wrote.

A change to a user's instance scope recomputes exclusions in the same request: a user changing their instance selection (their own recompute), and an admin enabling, disabling or deleting an instance (every user with no selection or a selection naming it).

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
- Incremental and smart sync: Runs if any image was written (even one Stash returned unchanged: its junction rows were rewritten from Stash, and inheritance puts the gallery's back) or any gallery changed

### Scene Tag Inheritance

Scenes inherit tags from their performers and studios:

- Performer tags propagate to scenes featuring that performer
- Studio tags propagate to scenes from that studio
- Stored in `SceneInheritedTag` for efficient querying

**Trigger conditions:**
- Full sync: Always runs
- Incremental and smart sync: Runs if a scene changed, or a performer's, studio's or group's tag set changed

### Image Count Rebuild

Maintains denormalized image counts on entities:

- Performers: Count of images featuring them
- Tags: Count of images with that tag
- Studios: Count of images from that studio
- Galleries: Count of images in that gallery

Runs after every full sync and after any sync that changed or soft-deleted something, followed by the user stats rebuild and the tag counts via performers.

---

## Sync State Tracking

Each entity type of each instance maintains its own sync state:

```sql
CREATE TABLE SyncState (
  id INTEGER PRIMARY KEY,
  stashInstanceId TEXT NOT NULL,
  entityType TEXT,              -- 'scene', 'performer', 'studio', etc.
  lastFullSyncTimestamp TEXT,   -- RFC3339 timestamp from Stash
  lastIncrementalSyncTimestamp TEXT,
  lastError TEXT                -- what went wrong with this type in the last sync, or NULL
);
```

Smart incremental sync uses the more recent of `lastFullSyncTimestamp` or `lastIncrementalSyncTimestamp` for each entity type independently. A type with neither is fetched whole, by every sync mode; that is how a migration asks for a refetch.

`lastError` holds the last sync's problem with the type: Stash's error when fetching it failed (the operation, each GraphQL message with the field it broke on, and the HTTP status, as in `FindStudios: runtime error: invalid memory address or nil pointer dereference (at findStudios.studios.3.parent_studio) (HTTP 200)`; a timeout; or "Could not reach Stash"; never the query or its variables), then any cleanup skip, refusal or failure, joined with "; ". A type that syncs cleanly, or that a smart sync skips because nothing changed, clears it. A failed type keeps its timestamps, so the next sync fetches it again from the same point.

`GET /api/sync/status` (admins only) reports every configured instance, enabled or not, in priority order: its id, name, whether it is enabled, and its entity types' states in sync order (the row above without `id` and `stashInstanceId`). It never includes an instance's address or API key. It also says whether a sync runs (`inProgress`), what holds the sync lock (`activeJob`: `sync`, `instance-delete` or null) and the sync settings. Rows of an instance that is no longer configured are left out until the startup sweep removes them. The readiness check (`isReady`), the "last refreshed" time and the startup sync's choice between a full and a smart sync read only the enabled instances' own rows.

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

The three sync modes run through one per-instance path (`syncInstance`) and one set of post-sync steps (`runInstancePostSteps`), so a step added there runs in every mode. When changing a step's condition, keep the modes equivalent:

- Gallery inheritance (conditional on images/galleries synced)
- Scene tag inheritance (conditional on scenes synced)
- Image count rebuild
- User stats rebuild
- Exclusion recomputation

---

## Implementation Reference

The sync logic is implemented in:

- `server/services/StashSyncService.ts` - Main sync orchestration:
  - `runSync(mode, instanceId?)`: one sync run, of one instance or every enabled instance in turn, for `fullSync`, `incrementalSync` and `smartIncrementalSync`
  - `syncInstance(instanceId, mode, run)`: one instance's types in `SYNC_ORDER`, then the cleanups and the post-sync steps
  - `paginate(type, instanceId, { since, ids }, run)`: the one page loop for every type (500 a page): abort checks between pages, progress events, and the newest `updated_at` seen as the next sync's watermark
  - `ENTITY_SYNC`: each type's spec, `fetchPage` (the Stash query that lists it, narrowed by `updated_at` or by ids, carrying the run's abort signal) and `processBatch` (the writer of one page)
- `server/services/ImageGalleryInheritanceService.ts` - Gallery-to-image inheritance
- `server/services/SceneTagInheritanceService.ts` - Scene tag inheritance
- `server/services/EntityImageCountService.ts` - Image count denormalization
