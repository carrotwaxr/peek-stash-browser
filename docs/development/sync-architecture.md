# Sync Architecture

Peek maintains a local SQLite cache of Stash data to enable performant queries, per-user features, and offline resilience. This document describes the sync mechanisms that keep the cache in sync with Stash.

---

## Overview

Peek provides three sync strategies, each optimized for different use cases:

| Sync Type | When Used | Performance | Data Freshness |
|-----------|-----------|-------------|----------------|
| **Full Sync** | Initial setup, manual trigger, once a day | Slowest | Complete |
| **Incremental Sync** | Scheduled interval, manual trigger | Medium | Partial |
| **Smart Incremental Sync** | Automatic on startup | Fastest | Optimal |

---

## Sync Types

### Full Sync

**Purpose:** Complete refresh of all data from Stash.

**Triggered by:**
- Initial setup (first sync)
- Manual "Full Sync" button in UI
- The daily full pass: once a day, automatically (see below)
- Recovery from corrupted state

**The daily full pass:** the startup sync, or a scheduled sync, is a full sync instead when an enabled instance's last full pass (`StashInstance.lastFullPassAt`) is more than 24 hours old, or it has none. A full sync records it for each instance whose every entity type was tried, once the post-sync steps are done; a full sync from the button counts too. A pass cut off by an abort, a restart or a failure records nothing, so the next start or scheduled sync runs it again. A type that failed in a pass that ran to the end does not: it keeps its error (in the sync status) and its old timestamp, so each incremental sync tries it again, and the next pass is a day away. The time is stored, so a restart does not start another pass, and the pass needs no setting. It is the catch-all for what the incremental syncs cannot see: edits Stash makes without moving `updated_at` that no refetch covers (a deleted studio on the collections and studios that named it, a merged tag's parent and child tags), a refetch that failed, an entity an incremental sync skipped while Stash was edited under it, and changes from a sync whose post-sync steps never ran before a restart. On a library of 100k scenes and 500k images it costs a few minutes of Stash reads and row writes once a day, in short batch transactions. The upgrade that adds it starts each instance at its newest `lastFullSyncActual`, so an upgraded install does not run every pass at once.

An upgrade does not start a full sync. A migration that needs Peek to refetch some entity types clears their timestamps in `SyncState`, and the next sync (at startup or scheduled) fetches those types whole, the others incrementally. See [Sync State Tracking](#sync-state-tracking).

**Process:**
1. Sync all entity types in [dependency order](#entity-sync-order), each followed by its [cleanup](#cleanup-safety) and a fetch by id of what Stash lists and no page returned (see [Sync State Tracking](#sync-state-tracking)), on every instance
2. Then, once for the whole sync: compute scene tag inheritance, apply gallery inheritance (performers, tags, studio, date, etc. propagate from galleries to images), rebuild inherited image counts, rebuild user stats, recompute the exclusions of every user

**Characteristics:**
- **Always runs every post-sync step**, whole library, whatever changed: it is the catch-all for links Stash edits without moving `updated_at` that no refetch covers, and for a refetch that failed (see [Edits Stash makes without updated_at](#edits-stash-makes-without-updated_at))
- Slowest option but guarantees complete data consistency
- Safe recovery mechanism for any sync issues

### Incremental Sync

**Purpose:** Sync only entities that changed since a given timestamp.

**Triggered by:**
- Scheduled sync intervals, when the daily full pass is not due
- Manual "Incremental Sync" button with date/time parameter

**Process:**
1. Sync all entity types, but only fetch entities with `updated_at > since`
2. Clean up deleted entities (detect deletions/merges in Stash), then fetch again what linked to them, and the images and scenes of every gallery that changed or was deleted (see [Edits Stash makes without updated_at](#edits-stash-makes-without-updated_at))
3. After every instance, the [post-sync steps](#post-sync-processing) once, only for what changed; nothing changed means none of them runs

**Characteristics:**
- Faster than full sync for small changesets
- Useful for syncing recent changes without full resync

### Smart Incremental Sync

**Purpose:** Efficiently sync only what's needed, per-entity-type.

**Triggered by:**
- Automatic on server startup, when the daily full pass is not due
- Manual "Smart Sync" button

**Process:**
1. For each entity type independently:
   - Check last sync timestamp for that specific entity type
   - Query Stash for change count since that timestamp
   - If changes: sync that entity type
   - If no changes: skip entirely
2. Clean up deleted entities, then fetch again what linked to them, and the images and scenes of every gallery that changed or was deleted
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

A page can still point at something Peek has not stored: an entity created in Stash after its own type's pages ran, or of a type whose sync failed. Before writing a page, Peek looks up what the page references, fetches the missing entities by id, and writes them first. Then the page is written in one transaction: its rows and their links are replaced together, so a failure midway (a crash, a stop, a database error) leaves the page as it was, and the next sync writes it again. No request to Stash runs while that transaction holds the database's write lock (about 0.1 s for a page of 500 scenes). A scene page also stores, in the same transaction, the columns the scene list sorts by (`titleSort`, `performerCount`, `tagCount`), from its scenes' titles and new links.

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

### Edits Stash makes without updated_at

Some edits in Stash change links without moving the `updated_at` of the entities that carry them, so no incremental page returns those entities:

- Merging tags moves every link to the merged tag (on scenes, images, galleries, performers, studios, collections and clips, a clip's primary tag included) onto the tag kept, and deletes the merged one. Merging performers does the same for scenes, images and galleries.
- Deleting a studio clears it from its scenes, galleries and images; deleting a tag or a performer removes its links.
- Adding images to a gallery, removing them, or editing its scenes from the gallery moves only the gallery's `updated_at`; deleting a gallery removes its links to its images and scenes.

The cleanup notices the merged or deleted entity (Stash no longer lists it) and soft-deletes it. On an incremental or smart sync, and after **Apply deletions**, Peek then looks up what still links to it (a tag's scenes, images, galleries, performers, studios, collections and clips; a performer's scenes, images and galleries; a studio's scenes, galleries and images; a collection's scenes) and fetches those entities again by id, 500 a request. They count as changed for the post-sync steps, so their inherited tags, image counts and every affected user's exclusions are recomputed in the same sync. The cost is proportional to what the deleted entity linked to: a merged tag on 5,000 scenes is 10 requests. A full sync needs none of it, since it fetches every entity of the types after each cleanup anyway. A refetch that fails is recorded in the type's `lastError`, and those entities keep their old links until the next full sync.

Until then, and whatever an entity still links to, a soft-deleted performer, studio, collection or tag hands nothing down: scene tag inheritance, the tag counts via performers and gallery inheritance read only live ones.

Peek stores a gallery's images and scenes from their side (each image's and scene's own galleries). So on an incremental or smart sync, and after **Apply deletions**, the images and scenes of every gallery the sync changed or soft-deleted are fetched again by id too: the ones Peek links to it (the ones that left, and all of a deleted gallery's) and the ones Stash lists in it (asked with the `galleries` filter, 5,000 ids a page). They count as changed as well, so what an image inherits from its galleries follows a gallery's new studio, performers, tags and images in the same sync (see [Gallery Inheritance](#gallery-inheritance)). The cost is the members of the changed galleries: a few requests per gallery. A type the sync already fetched whole (its first sync) is skipped, and so is the full sync, which fetches every scene and image after the galleries.

---

## Post-Sync Processing

The steps below run once per sync, after every instance has synced, not once per instance. Each sync collects a change set (`SyncChangeSet`): every batch reports which of its rows changed, and every cleanup which rows it soft-deleted. An entity counts as changed when it is new, its `stashUpdatedAt` differs, it was soft-deleted and is back, or (for every type but images) its junction rows or studio differ from what was stored. An image's junction rows and studio are never compared, because gallery inheritance writes into them.

- **Full sync**: every step, whole library, and every user's exclusions are recomputed.
- **Incremental and smart sync**: nothing changed and no user holds `pending` exclusion rows means no step runs at all (the log says `nothing changed, post-sync steps skipped`). Otherwise the change set decides which steps run, as each step's trigger conditions say, and the exclusion recompute covers the users whose instance scope holds a changed instance (plus users with pending holds), not everyone.
- **Apply deletions** (the sync status's action after a refused cleanup) runs the steps for what it soft-deleted.
- A sync that is aborted or fails before its steps hands its change set to the next sync, so the steps still cover what it wrote.

A change to a user's instance scope recomputes exclusions in the same request: a user changing their instance selection (their own recompute), and an admin enabling, disabling or deleting an instance (every user whose selection names it or names no other enabled instance: a selection whose instances are all disabled means every enabled instance, as no selection does).

An instance on its first sync (just added, or its URL changed: `StashInstance.firstSyncedAt` is NULL) is hidden from every user, admins included, while its rows arrive: the allowed instances (`getUserAllowedInstanceIds`) and the by-id access checks (`EntityAccessService`) leave it out, and the exclusion compute already covers it. In a run that synced it, it counts as a change, so its users are recomputed even when nothing else changed (a URL changed to the same Stash, say); after that recompute Peek sets `firstSyncedAt` and the instance shows. When the recompute of a user who can see it fails, it stays hidden and the next sync retries. A user whose every instance is on its first sync gets `503 ready: false` from the library routes (the client shows its syncing notice).

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
- Never overwrites existing image metadata. An inherited value is stored like the image's own, so it stays until the image is written again from Stash: an incremental sync that sees a gallery change fetches its images again first (see [Edits Stash makes without updated_at](#edits-stash-makes-without-updated_at)), and inheritance then hands down the gallery's current values
- Uses first gallery if image is in multiple galleries
- Hands down only live performers and tags (a soft-deleted one was deleted or merged in Stash)

**Trigger conditions:**
- Full sync: Always runs, for every image
- Incremental and smart sync: Runs for the images the sync wrote, even ones Stash returned unchanged (writing an image rewrites its junction rows and studio from Stash, dropping what it had inherited, and inheritance puts the gallery's back), and for the images of every changed gallery. The images that joined, left or stayed in a gallery that changed or was deleted are among the written ones: the sync fetches them again. Other images are left as they are. Past the change set's limit (20,000 of a kind) it runs for every image

### Scene Tag Inheritance

Scenes inherit tags from their performers, studio and groups:

- Performer tags propagate to scenes featuring that performer
- Studio tags propagate to scenes from that studio
- Group tags propagate to the scenes in that group
- A soft-deleted performer, studio, group or tag passes nothing on
- A scene's own tags are left out; the rest are stored as a JSON array in `StashScene.inheritedTagIds`, which the tag filters and content restrictions read

**Trigger conditions:**
- Full sync: Always runs, for every scene
- Incremental and smart sync: Runs for the scenes the change set reaches: the changed scenes, plus the scenes of every performer, studio and group whose tag set changed or that was soft-deleted. A tag added to a performer in Stash reaches that performer's scenes on the next sync, though the scenes themselves did not change. Past the change set's limit (20,000 of a kind) it runs for every scene

### Image Count Rebuild

Maintains denormalized image counts on entities, counting an image that has the entity itself or is in a gallery that has it:

- Performers: Count of images featuring them
- Tags: Count of images with that tag
- Studios: Count of images from that studio

A gallery's own image count is Stash's, stored as synced. Sync writes a new performer, studio or tag with Stash's count (its direct images only) and never overwrites the stored count when it updates one; the rebuild sets it.

**Trigger conditions:**
- Full sync: Always runs, for every performer, studio and tag
- Incremental and smart sync: Runs after any sync that changed or soft-deleted something, for the performers, studios and tags the change set reaches: the old and new performers, tags and studios of changed images and galleries; the performers, tags and studio of every gallery a changed image joined or left; those of soft-deleted images (with their galleries') and galleries; and every changed performer, studio and tag. Past the change set's limit it runs for every one

The user stats rebuild and the tag counts via performers follow it.

### Database Upkeep

Last, unless the steps were skipped, Peek refreshes SQLite's planner statistics (`PRAGMA optimize`, which analyzes a table that has none or whose size changed about 25-fold since: 0.3 s the first time on a 26,000-scene library, 0.65 s with 200,000 scenes, under a millisecond after) and moves the write-ahead log into the database file (`wal_checkpoint(TRUNCATE)`). Each is one unit of the writer queue (`refreshPlannerStatistics` and `checkpointWal` in `utils/databaseMaintenance.ts`); a failure, or a checkpoint that open reads keep busy, is only logged. The shutdown runs both too, through the same queue.

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
  lastFullSyncActual DATETIME,  -- when the type was last fetched whole
  lastError TEXT                -- what went wrong with this type in the last sync, or NULL
);
```

Smart incremental sync uses the more recent of `lastFullSyncTimestamp` or `lastIncrementalSyncTimestamp` for each entity type independently. A type with neither is fetched whole, by every sync mode; that is how a migration asks for a refetch.

Every type is paged in `updated_at` order, oldest first, and the timestamp saved is the newest `updated_at` the pages returned. An entity edited in Stash while a sync pages moves to the end of that order, so a later page fetches it again with its edit. Its move shifts the entities after it up one place, so paging by offset skips one of them. When a type was fetched whole (a full sync, or a type with no timestamp yet), its cleanup reads Stash's whole id list anyway, and the ids no page returned are fetched by id afterwards: the ones a shift skipped, and ones created after the last page. An incremental sync that pages over more than 500 changes can still skip one entity per edit made meanwhile; the next full sync fetches it.

An `updated_at` more than 5 minutes ahead of Peek's clock (clock skew allowance) is left out of the timestamp and logged as a warning: the entity is synced, but the saved timestamp is the newest one that is not in the future. A Stash import with future dates would otherwise make every later incremental sync ask for changes after that date and find none. Such entities are fetched again by each sync until their date passes.

`lastError` holds the last sync's problem with the type: Stash's error when fetching it failed (the operation, each GraphQL message with the field it broke on, and the HTTP status, as in `FindStudios: runtime error: invalid memory address or nil pointer dereference (at findStudios.studios.3.parent_studio) (HTTP 200)`; a timeout; or "Could not reach Stash"; never the query or its variables), then any cleanup skip, refusal or failure, joined with "; ". A type that syncs cleanly, or that a smart sync skips because nothing changed, clears it. A failed type keeps its timestamps, so the next sync fetches it again from the same point.

`GET /api/sync/status` (admins only) reports every configured instance, enabled or not, in priority order: its id, name, whether it is enabled, and its entity types' states in sync order (the row above without `id` and `stashInstanceId`). It also gives `firstSyncedAt` per instance (null while its first sync runs). It never includes an instance's address or API key. It also says whether a sync runs (`inProgress`), what holds the sync lock (`activeJob`: `sync`, `instance-delete` or null) and the sync settings. Rows of an instance that is no longer configured are left out until the startup sweep removes them. The readiness check (`isReady`: some enabled instance has finished its first sync), the "last refreshed" time and the startup sync's choice between a full and a smart sync read only the enabled instances.

---

## Troubleshooting

### Images not showing expected performers/tags

**Symptom:** Filtering images by performer returns 0 results, but the performer is associated with the gallery.

**Cause:** The sync that sees the gallery change has not run yet, or its refetch of the gallery's images failed. A sync that fetches a changed gallery also fetches its images again and re-applies inheritance to them; a failed refetch is shown in the image type's sync status.

**Solution:** Wait for the next scheduled sync, or start one. If the image type shows a refetch error, fix its cause (the error names it) and sync again; a full sync also catches it.

### Stale data after Stash changes

**Symptom:** Changes made in Stash don't appear in Peek.

**Cause:** Incremental and smart syncs fetch what Stash marks updated. Merging or deleting tags and performers, and deleting a studio, reach Peek on the next sync anyway: the entities that linked to them are fetched again (see [Edits Stash makes without updated_at](#edits-stash-makes-without-updated_at)). So do images and scenes added to or removed from a gallery from the gallery's side, and a deleted gallery's: the gallery's members are fetched again. Other edits that leave `updated_at` alone, such as deleting a studio that collections or other studios name, wait for the next full sync, and so do the entities of a refetch that failed (its error is in the type's sync status). Peek runs one once a day on its own (see [the daily full pass](#full-sync)).

**Solution:** Wait for the daily full pass, or run a full sync.

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

The three sync modes run through one per-instance path (`syncInstance`) and one set of post-sync steps (`runPostSyncSteps`), so a step added there runs in every mode. When changing a step's condition, keep the modes equivalent:

- Gallery inheritance (scoped to the images written and the changed galleries' images)
- Scene tag inheritance (scoped to the scenes the change set reaches)
- Image count rebuild (scoped to the performers, studios and tags the change set reaches)
- User stats rebuild
- Exclusion recomputation

---

## Implementation Reference

The sync logic is implemented in:

- `server/services/StashSyncService.ts` - Main sync orchestration:
  - `runSync(mode, instanceId?)`: one sync run, of one instance or every enabled instance in turn, for `fullSync`, `incrementalSync` and `smartIncrementalSync`
  - `syncInstance(instanceId, mode, run)`: one instance's types in `SYNC_ORDER`, then the cleanups and, on the incremental paths, `refetchLinkedToDeleted` (what linked to the entities they soft-deleted, along `LINK_PATHS`) and `refetchGalleryMembers` (the scenes and images of the galleries the run changed or soft-deleted: Peek's `SceneGallery`/`ImageGallery` rows and Stash's `galleries` INCLUDES id lists)
  - `paginate(type, instanceId, { since, ids }, run)`: the one page loop for every type (500 a page): abort checks between pages, progress events, the page's missing references fetched first (`ensureReferenced`), and the newest `updated_at` seen as the next sync's watermark
  - `ENTITY_SYNC`: each type's spec, `fetchPage` (the Stash query that lists it, narrowed by `updated_at` or by ids, carrying the run's abort signal), `references` (what a page points at) and `processBatch` (the writer of one page, in one transaction through `writeBatch`)
- `server/services/ImageGalleryInheritanceService.ts` - Gallery-to-image inheritance
- `server/services/SceneTagInheritanceService.ts` - Scene tag inheritance
- `server/services/EntityImageCountService.ts` - Image count denormalization
