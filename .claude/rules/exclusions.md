---
paths:
  - "server/services/ExclusionComputationService.ts"
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
- `GET /user/:id/restrictions` answers each list parsed (`StoredRestriction`): a stored value that is not a JSON array of strings comes back as `entityIds: null, unreadable: true`, and the editor blocks editing and offers a confirmed Clear all restrictions (`DELETE`). A save refuses a bare entity id with a 400 naming it, unless a stored list of that entity type already holds it (legacy data). A Show-only list can be stored as `[]` after its server is deleted; it still hides the whole type, and the editor keeps Save off until the admin chooses items or removes the list (owner decision, 2026-09-29).

## Computation

- The empty phase treats a collection as empty only when it has no visible scene and no visible, non-empty sub-collection at any depth: one recursive CTE over `GroupRelation` per compute, built over every group in scope even for `only`, with `UNION` ending cycles. A studio is empty the same way, through a recursive CTE over `parentId` on the same instance: a network with no visible scene or image of its own stays while a child studio has one.
- A full recompute runs direct, cascade and empty-entity phases in a read snapshot on the compute connection (`withComputeConnection` and `readSnapshot` in `prisma/computeClient.ts`: no write lock), fills the deduplicated rows into the TEMP table `_peek_result`, and swaps them in with one `DELETE` and one `INSERT OR IGNORE ... SELECT` inside a short `BEGIN IMMEDIATE` on that connection (the `exclusions.swap` unit). The `DELETE` keeps `pending` rows written after the snapshot began, so holds a sync batch wrote meanwhile survive. `addHiddenEntities` takes the same path with a merge (`INSERT OR IGNORE`, the `exclusions.hide` unit) instead of a swap, never overwrites a row, and writes the `UserHiddenEntity` rows in the merge's unit, so a failure leaves neither. A bulk hide is one compute and one unit. Above `MERGE_CHUNK` (200,000 rows) the merge is split into ranges of `_peek_result`'s primary key, one unit each, with the hidden rows in the last. The swap stays under the writer rule's 1 s because the compute connection sets the main client's `cache_size` and `synchronous = NORMAL`: a user with 180k rows swaps in 0.67 s, and in 1.0 s with SQLite's defaults.
- Recomputes for one user coalesce to at most two, the running one and one queued (#431). A "skip if one is pending" shortcut loses the admin's latest save. A save never coalesces into a running recompute: it waits for it and registers its own, and a recompute requested during a save queues behind it.
- Cascades follow the junction rows sync writes. A missing junction row is a silent cascade miss, not an error.
- Reason precedence: every restriction-derived reason is stored ahead of `hidden`, and restriction cascades run apart from hide cascades (order in the compute's file header). The Hidden Items list relies on it: a `hidden` row means the user would see the entity if they had hidden nothing. Merging the cascade sources again, or reordering the dedup, shows restricted entities' data there.
- Every entity type is hideable, clips included. A clip hide stores one `hidden` row and no cascade (`clip` is not in `RESOLVE_TABLE`); `ClipQueryBuilder`'s exclusion anti-join and `EntityAccessService`'s clip source (which also checks the clip's scene) read it. Hiding a scene hides its clips; hiding a clip never touches its scene. `HiddenEntityType` in shared, `HideableEntityType` in `EntityAccessService` and `SUMMARY_SOURCES` in `UserHiddenEntityService` follow `HIDEABLE_ENTITY_TYPES`; a new type needs all three.
- The swap also rewrites `UserExcludedContentCount` (the viewer's excluded links per entity, from `_peek_counts`), and a hide's unit increments it for the rows it adds; the builders subtract it from the live count columns, so a card equals the tab's total.

## Triggers

- Saving restrictions (`updateUserRestrictions`, `deleteUserRestrictions`) goes through `saveRestrictions`: the recompute runs on the proposed rows and its swap writes the rows and the exclusions in one `BEGIN IMMEDIATE`, so a failure leaves both as they were.
- Every hide names its instance: `validateHideTarget` answers 400 "instanceId is required" without one, and `unknownHideInstance` 400 "Invalid instanceId" for an instance with no `StashInstance` row; the visibility check is by (id, instance) only. Unhide's `instanceId` stays optional (a repeated one answers 400): without one it removes a legacy row stored for every instance (`""`).
- Hiding requires visibility: `checkHideTargets` in `controllers/user.ts` answers 404 for anything the user can't see; a repeat hide succeeds without writing. It then calls `addHiddenEntities`, which adds that entity and its cascades but skips the empty-entity phase, and never overwrites an existing row. Unhiding awaits a full recompute.
- A sync recomputes once per run, after every instance: a full sync `recomputeAllUsers`; an incremental or smart sync `recomputeUsersForInstances(changedInstances)`, the users whose scope (`getUserInstanceScope`: enabled instances, narrowed by the selection; an empty selection, or one whose instances are all disabled, means all) holds a changed instance, plus every user with a `pending` row (`usersWithPendingHolds`). A sync that found nothing recomputes nobody, unless an instance of the run is on its first sync (`StashInstance.firstSyncedAt` NULL), which counts as a change. `recomputeAllUsers` stays for `routes/exclusions.ts` and the data migrations.
- An instance on its first sync (new, or its URL changed) is hidden from everyone, admins included, until that run's recompute has succeeded for every user whose scope covers it; `runPostSyncSteps` then sets `firstSyncedAt` (`markFirstSynced`). A failed recompute of one of those users leaves it NULL and the next sync retries.
- A scope change recomputes in the same request: `PUT /user/stash-instances` and the first-login wizard recompute that user; `updateStashInstance` with a changed `enabled`, and `deleteInstance` (before its purge), recompute `getUsersSelecting(instanceId)`, the users whose selection names the instance or names no other enabled instance (none at all included), through `recomputeUsers`.

## Holds during sync

- A sync batch holds what it changed from the users with exclusion inputs until their recompute: inside its transaction, after the upsert and the junction rows, `holdForRecompute` writes a `pending` row per user for each changed entity, for the first-order `EDGES` content of a changed tag, studio, group or gallery, and for the scenes of a performer, studio or group whose tag set changed (the scene edges). `INSERT OR IGNORE`, so an existing row keeps its reason; a failed batch rolls its holds back with it.
- The users: `usersWithExclusionInputs(instanceId)`, non-admins with a `UserContentRestriction` row plus everyone with a `UserHiddenEntity` row (admins' own hides apply to them), among the users whose scope holds the instance; none while the instance is disabled or on its first sync (C17 hides it whole). The sync reads it once per run and instance (`usersToHold`), before the batch's transaction opens.
- A `pending` row excludes on every surface like any other reason, the Hidden Items list included (`resolveVisibleApartFromOwnHides` ignores only `hidden`). The recompute's swap replaces them: its `DELETE` keeps only holds written after its snapshot began, and `recomputeUsersForInstances` recomputes every user with a `pending` row, so a sync that finds nothing still clears the holds an aborted run left. A failed recompute leaves the user's holds in place, and they see less until the next one succeeds.
- Residual: content reached only through the closure of a changed hierarchy (a moved tag's grandchildren's scenes) shows until the same sync's recompute, seconds later. `pending.computedAt` is written as integer epoch milliseconds, as Prisma stores `DateTime`. The swap's `DELETE` keeps the pending rows whose id is above the table's highest row id read as the snapshot's first statement, so a hold committed after the snapshot opened survives it.

## Reading exclusions

A new endpoint filters through one of two paths. An endpoint with neither shows restricted content.

Two instance lists, never swapped: the compute (`doRecomputeForUser`, `addHiddenEntities`) runs over `getUserInstanceScope`, first-syncing instances included, so their rows exist before they show; everything that shows content reads `getUserAllowedInstanceIds`, the scope without the instances whose first sync has not finished. A selection only narrows: when none of its instances is enabled (and, for a limited user, allowed), the scope is every enabled instance the user may use, as with no selection. See "Instance access" below for the admin's limit. `requireCacheReady` answers 503 `ready: false` when the allowed list is empty, which then means every instance in scope is still on its first sync, and otherwise puts the list on the request.

- The `LEFT JOIN UserExcludedEntity` with the instance, for lists and reads of many entities: the query builders and their nested refs (`query/nestedRefs.ts`), `TagTreeService`, `TooltipRelations`, `MinimalEntityQuery`, `RecommendationService` and `PlaylistQueryService`.
- A relation read through scenes (`viaSceneClause` in `utils/sqlClauses.ts`: performers by studio, scene, collection or co-star, collections by scene or performer, galleries by scene, tags by scene or collection) anti-joins the scene's exclusion rows through `exclusionJoin` under its own alias (`vse`, never the outer statement's `e`), its every-instance (`''`) arm included, when the viewer's exclusions apply: a scene the viewer hid links nothing, neither a match nor, under EXCLUDES, an exclusion. A via table with `related` (the "appears with" performer) also requires the named entity live and not excluded (`vre`).
- A scene's Untagged (`tagged`), and its Tags "has none" and "has any", read the stored tag count and `SceneInheritedTag` (`sceneUntaggedSql`) with no visibility arm, so they keep the browse index. Nothing is missed: an excluded tag, restricted or hidden, cascades to every scene holding it, own or inherited (the `SceneTag` and inherited edges), and a Show-only tag list's admission rule excludes every scene holding none of its tags, so a scene the viewer sees never holds only tags they cannot see. An arm would match nothing and costs about 170 ms at 215k scenes. A presence filter on a relation whose hide does not cascade to the row (a collection's studio) does count only rows the viewer can see.
- A list request's `where` groups compile after the base clauses (`EntityQueryBuilder.whereClauses`), so no "any" group ever ORs with the exclusion join or the allowed-instance list: a hidden or restricted entity matching a group's row stays out of the list and its count.
- `services/EntityAccessService.ts`, for endpoints that act on ids from the request: ratings, history writes, downloads, media and hides. It also checks `deletedAt` and the user's allowed instances (enabled, first sync done, in the admin's allow-list and selected: `LIVE_AND_ALLOWED_WHERE`, which mirrors `getUserAllowedInstanceIds`; see "Instance access"). It needs no role logic, because the compute already settles admins: an admin's rows hold only their own hides and cascades. The Hidden Items list uses its `resolveVisibleApartFromOwnHides`, which ignores only `hidden` rows.

### Instance access

An admin can limit a USER to chosen Stash servers (#439). The state is `User.instanceAccessLimited` plus `UserInstanceAccess` rows (`userId`, `instanceId`; both sides cascade on delete). Admins are never limited: the flag and rows are ignored for an ADMIN, and `PUT /api/user/:userId/instance-access` refuses one with 400. A limit is kept across a promotion (flag and rows stay, so a demotion applies it again), and the rows are kept while the flag is off, so turning the limit back on restores them. A limited user with no rows sees nothing; the allow-list may name a disabled instance. A server added later is in nobody's list, so it stays hidden from limited users until an admin ticks it.

The limit is applied in two places, which must agree:

- `readScope` in `UserInstanceService`: the enabled instances shrink to the allowed ones for a limited non-admin (`getUserInstanceAccess(userId)` returns the ids, or `null` for an unlimited user, an admin or a missing user), then the user's selection narrows them. A selection naming no accessible instance means every accessible one. Both `getUserInstanceScope` and `getUserAllowedInstanceIds` read it.
- `LIVE_AND_ALLOWED_WHERE` in `EntityAccessService`: rule 3a is the allow-list probe, rule 3b the user's selection with the same fallback counted over accessible instances only. The user id binds six times (`LIVE_AND_ALLOWED_USER_BINDS`); change the SQL and the count together. The integration test "agrees with getUserAllowedInstanceIds" (`EntityAccessService.integration.test.ts`) pins the two; it must keep passing.

Around the scope:

- `getUsersSelecting(instanceId)` (the users a sync, enable or delete of an instance recomputes) counts a limited USER allowed the instance whatever their selection names (a selection of servers they may not use falls back to the allowed ones) and leaves out a limited USER without access to it.
- The admin API is `GET` and `PUT /api/user/:userId/instance-access`, body and answer `{ limited, instanceIds }`. A save replaces the flag and rows in one `dbWriteTransaction`, then recomputes the user's exclusions and bumps their library stamp.
- The user's own selection writes (`PUT /api/user/stash-instances`, `complete-setup`) refuse ids outside their access with 400, and the picker lists (`GET /api/user/stash-instances`, setup status) offer only the servers they may use. A stored selection naming a server outside the access is not reported.
- Sync from Stash imports only from the instances the target user may use (400 when none).
- A narrowing expires the user's finished playlist zips (`DownloadService.expireUserPlaylistZips`, which `deleteDownload`s each): a save of the instance access that removes a server or turns the limit on, and a save of the user's restrictions. A zip is served from disk without re-checking its scenes. A pending or running build re-scopes when it builds. `getUserDownloads` leaves out scene and image rows of an instance the user may no longer use.
- The history reads (`getWatchHistory`, the image view history GET) answer "no history" for an entity the user cannot reach (`resolveAccessibleInstanceId`): outside their access, or hidden from them.
- Readiness: with an empty allowed list `requireCacheReady`, `requirePickerReady` and `GET /api/library/ready` answer `ready: false` with `reason`: `noAccess` when the user is limited and their scope is empty (waiting will not help), else `initializing` (`libraryReadiness`, `notReadyReason` in `middleware/auth.ts`). A grant is picked up by the client's 5 s re-check.

One surface reads no exclusions on purpose: the `/minimal` pickers with `scope: "allEnabled"`, which only an admin may send (the Content Restrictions editor), list every live entity on every enabled, synced instance.
