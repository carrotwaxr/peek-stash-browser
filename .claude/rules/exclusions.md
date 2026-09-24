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

- A full recompute runs direct, cascade and empty-entity phases outside any transaction. Then one transaction deletes the old rows, inserts the new ones and updates `UserEntityStats`. Keeping the computation outside keeps SQLite's write lock short.
- Recomputes for one user coalesce to at most two, the running one and one queued (#431). A "skip if one is pending" shortcut loses the admin's latest save.
- Cascades follow the junction rows sync writes. A missing junction row is a silent cascade miss, not an error.
- Reason precedence: every restriction-derived reason is stored ahead of `hidden`, and restriction cascades run apart from hide cascades (order in the compute's file header). The Hidden Items list relies on it: a `hidden` row means the user would see the entity if they had hidden nothing. Merging the cascade sources again, or reordering the dedup, shows restricted entities' data there.

## Triggers

- Saving restrictions (`updateUserRestrictions` in `controllers/user.ts`) runs a full recompute for that user.
- Hiding requires visibility: `checkHideTarget` in `controllers/user.ts` answers 404 for anything the user can't see; a repeat hide succeeds without writing. It then calls `addHiddenEntity`, which adds that entity and its cascades but skips the empty-entity phase and the stats update, and never overwrites an existing row. Unhiding queues a full recompute in the background without awaiting it.
- `fullSync`, `incrementalSync` and `smartIncrementalSync` end with `recomputeAllUsers`. The plugin webhook's `syncSingleEntity` does not.

## Reading exclusions

A new endpoint filters through one of three paths. An endpoint with none of them shows restricted content.

- The `LEFT JOIN UserExcludedEntity` in the query builders, for lists.
- `entityExclusionHelper.filterExcluded`, for endpoints that read cached entities in memory.
- `services/EntityAccessService.ts`, for endpoints that act on ids from the request: ratings, history writes, downloads, media and hides. It also checks `deletedAt` and the user's allowed instances. It needs no role logic, because the compute already settles admins: an admin's rows hold only their own hides and cascades. The Hidden Items list uses its `resolveVisibleApartFromOwnHides`, which ignores only `hidden` rows.
