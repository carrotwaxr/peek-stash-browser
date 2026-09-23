---
paths:
  - "server/services/ExclusionComputationService.ts"
  - "server/services/EntityExclusionHelper.ts"
  - "server/services/UserHiddenEntityService.ts"
  - "server/routes/exclusions.ts"
  - "server/tests/**/*xclusion*"
  - "server/integration/**/content-restrictions*"
---

# Content restrictions and exclusions

`ExclusionComputationService` precomputes every entity a user must not see and stores it in `UserExcludedEntity`; queries then filter against that table. This area produced #200, #378, #412 and #437.

## Inputs

- `UserContentRestriction.entityIds` holds `"id:instanceId"` strings exactly as `SearchableSelect` sent them. Parse each one before any lookup (#412).
- `UserHiddenEntity` already stores a bare `entityId` and a separate `instanceId`.
- An empty `instanceId` means the record applies to every instance (`splitGlobalScoped`).
- INCLUDE mode compares (id, instance) pairs from `getAllEntityIdsWithInstance`. Comparing bare IDs includes tag 6 on every server when the admin picked tag 6 on one (#437).

## Computation

- Phases run direct, then cascade, then empty. Only the final DELETE and INSERT share a transaction, which keeps SQLite's write lock short; keep the computation outside it.
- Recomputes for one user coalesce to at most two, the running one and one queued (#378). A "skip if one is pending" shortcut loses the admin's latest save.
- Cascades follow the junction rows sync writes. A missing junction row is a silent cascade miss, not an error.
- Sync calls `recomputeAllUsers` after each sync. Saving restrictions and hiding an entity recompute for that user.

## Reading exclusions

A new endpoint filters through one of two paths: the `LEFT JOIN UserExcludedEntity` in the query builders, or `entityExclusionHelper.filterExcluded` for endpoints that read cached entities in memory. An endpoint with neither shows restricted content.
