---
paths:
  - "server/services/ExclusionComputationService.ts"
  - "server/services/EntityExclusionHelper.ts"
  - "server/services/UserHiddenEntityService.ts"
  - "server/services/EntityAccessService.ts"
  - "server/routes/exclusions.ts"
  - "server/controllers/user.ts"
  - "server/tests/**/*xclusion*"
  - "server/integration/**/content-restrictions*"
  - "server/integration/**/exclusion-application*"
  - "server/integration/**/hidden-entities*"
---

# Content restrictions and exclusions

`ExclusionComputationService` precomputes every entity a user must not see and stores it in `UserExcludedEntity`; queries then filter against that table. This area produced #200, #378, #412 and #437.

## Inputs

- `UserContentRestriction.entityIds` holds `"id:instanceId"` strings exactly as `SearchableSelect` sent them. Parse each one before any lookup (#412).
- `UserHiddenEntity` already stores a bare `entityId` and a separate `instanceId`.
- An empty `instanceId` means the record applies to every instance (`splitGlobalScoped`).
- INCLUDE mode compares (id, instance) pairs from `getAllEntityIdsWithInstance`. Comparing bare IDs includes tag 6 on every server when the admin picked tag 6 on one (#437).

## Computation

- A full recompute runs direct, cascade and empty-entity phases in a read snapshot on the compute connection (`withComputeConnection` and `readSnapshot` in `prisma/computeClient.ts`: no write lock), fills the deduplicated rows into the TEMP table `_peek_result`, and swaps them in with one `DELETE` and one `INSERT OR IGNORE ... SELECT` inside a short `BEGIN IMMEDIATE` on that connection (the `exclusions.swap` unit). The `DELETE` keeps `pending` rows written after the snapshot began, so holds a sync batch wrote meanwhile survive. `UserEntityStats` is updated after the swap, in one batch. `addHiddenEntity` takes the same path with a merge (`INSERT OR IGNORE`) instead of a swap.
- Recomputes for one user coalesce to at most two, the running one and one queued (#431). A "skip if one is pending" shortcut loses the admin's latest save.
- Cascades follow the junction rows sync writes. A missing junction row is a silent cascade miss, not an error.
- Reason precedence: every restriction-derived reason is stored ahead of `hidden`, and restriction cascades run apart from hide cascades (order in the compute's file header). The Hidden Items list relies on it: a `hidden` row means the user would see the entity if they had hidden nothing. Merging the cascade sources again, or reordering the dedup, shows restricted entities' data there.

## Triggers

- Saving restrictions (`updateUserRestrictions` in `controllers/user.ts`) runs a full recompute for that user.
- Hiding requires visibility: `checkHideTarget` in `controllers/user.ts` answers 404 for anything the user can't see; a repeat hide succeeds without writing. It then calls `addHiddenEntity`, which adds that entity and its cascades but skips the empty-entity phase and the stats update, and never overwrites an existing row. Unhiding queues a full recompute in the background without awaiting it.
- A sync recomputes once per run, after every instance: a full sync `recomputeAllUsers`; an incremental or smart sync `recomputeUsersForInstances(changedInstances)`, the users whose scope (`getUserInstanceScope`: enabled instances, narrowed by the selection; an empty selection means all) holds a changed instance, plus every user with a `pending` row (`usersWithPendingHolds`). A sync that found nothing recomputes nobody, unless an instance of the run is on its first sync (`StashInstance.firstSyncedAt` NULL), which counts as a change. `recomputeAllUsers` stays for `routes/exclusions.ts` and the data migrations.
- An instance on its first sync (new, or its URL changed) is hidden from everyone, admins included, until that run's recompute has succeeded for every user whose scope covers it; `runPostSyncSteps` then sets `firstSyncedAt` (`markFirstSynced`). A failed recompute of one of those users leaves it NULL and the next sync retries.
- A scope change recomputes in the same request: `PUT /user/stash-instances` and the first-login wizard recompute that user; `updateStashInstance` with a changed `enabled`, and `deleteInstance` (before its purge), recompute `getUsersSelecting(instanceId)`, the users with no selection or one naming the instance, through `recomputeUsers`.

## Holds during sync

- A sync batch holds what it changed from the users with exclusion inputs until their recompute: inside its transaction, after the upsert and the junction rows, `holdForRecompute` writes a `pending` row per user for each changed entity, for the first-order `EDGES` content of a changed tag, studio, group or gallery, and for the scenes of a performer, studio or group whose tag set changed (the scene edges). `INSERT OR IGNORE`, so an existing row keeps its reason; a failed batch rolls its holds back with it.
- The users: `usersWithExclusionInputs(instanceId)`, non-admins with a `UserContentRestriction` row plus everyone with a `UserHiddenEntity` row (admins' own hides apply to them), among the users whose scope holds the instance; none while the instance is disabled or on its first sync (C17 hides it whole). The sync reads it once per run and instance (`usersToHold`), before the batch's transaction opens.
- A `pending` row excludes on every surface like any other reason, the Hidden Items list included (`resolveVisibleApartFromOwnHides` ignores only `hidden`). The recompute's swap replaces them: its `DELETE` keeps only holds written after its snapshot began, and `recomputeUsersForInstances` recomputes every user with a `pending` row, so a sync that finds nothing still clears the holds an aborted run left. A failed recompute leaves the user's holds in place, and they see less until the next one succeeds.
- Residual: content reached only through the closure of a changed hierarchy (a moved tag's grandchildren's scenes) shows until the same sync's recompute, seconds later. `pending.computedAt` is written as integer epoch milliseconds, as Prisma stores `DateTime` and the swap's `DELETE` compares.

## Reading exclusions

A new endpoint filters through one of three paths. An endpoint with none of them shows restricted content.

Two instance lists, never swapped: the compute (`doRecomputeForUser`, `addHiddenEntity`) runs over `getUserInstanceScope`, first-syncing instances included, so their rows exist before they show; everything that shows content reads `getUserAllowedInstanceIds`, the scope without the instances whose first sync has not finished. `requireCacheReady` answers 503 `ready: false` when that list is empty.

- The `LEFT JOIN UserExcludedEntity` in the query builders, for lists.
- `entityExclusionHelper.filterExcluded`, for endpoints that read cached entities in memory.
- `services/EntityAccessService.ts`, for endpoints that act on ids from the request: ratings, history writes, downloads, media and hides. It also checks `deletedAt` and the user's allowed instances (enabled, first sync done, selected: `LIVE_AND_ALLOWED_WHERE`, which mirrors `getUserAllowedInstanceIds`). It needs no role logic, because the compute already settles admins: an admin's rows hold only their own hides and cascades. The Hidden Items list uses its `resolveVisibleApartFromOwnHides`, which ignores only `hidden` rows.
