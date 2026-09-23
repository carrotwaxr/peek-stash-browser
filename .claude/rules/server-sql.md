---
paths:
  - "server/services/*QueryBuilder.ts"
  - "server/utils/sqlFilterBuilders.ts"
  - "server/utils/sqlHelpers.ts"
  - "server/services/StashEntityService.ts"
  - "server/services/UserInstanceService.ts"
  - "server/services/UserStatsService.ts"
  - "server/services/RankingComputeService.ts"
  - "server/utils/entityInstanceId.ts"
  - "server/utils/instanceUtils.ts"
---

# Instance-aware queries

The query builders run their list and count queries as raw SQL through `prisma.$queryRawUnsafe` with `?` parameters, then load related entities in one batch per relation.

## Filter values

- Filter values arrive as `"id:instanceId"` strings. `coerceEntityRefs` marks them as `InstanceAwareId`, and `buildJunctionFilter` and `buildDirectFilter` match them as (id, instance) pairs.
- `parseCompositeFilterValues` returns the instance as well as the id. Code that keeps only `.id` matches every instance that reuses the number, and two Stash servers reuse small numbers all the time.
- A scene tag filter checks both the `SceneTag` junction and the `inheritedTagIds` JSON column through `json_each`.

## Every list query

- Exclusions: `LEFT JOIN UserExcludedEntity e ON ... AND (e.instanceId = '' OR e.instanceId = x.stashInstanceId)`, with `e.id IS NULL` in the WHERE. Never `NOT IN (...)`: a user with a few hundred exclusions pushes it past SQLite's parameter limit (Prisma P2029).
- `x.deletedAt IS NULL`, because sync soft-deletes.
- The allowed-instances filter (`buildInstanceFilter`, fed by `UserInstanceService.getUserAllowedInstanceIds`).
- BigInt columns such as `fileSize` go through `Number()` in `transformRow`. Row types live in `server/types/internal/queryRows.ts`.

## Lookups

- Every `StashEntityService.get*()` takes a required instanceId. A caller that truly has none falls back to `stashInstanceManager.getDefaultConfig().id` explicitly.
- `getEntityInstanceId()` falls back to the default instance, and logs a warning, when the entity isn't found. That warning points at a bug upstream.
- In-memory maps key on `` `${id}${KEY_SEP}${instanceId}` ``, with `KEY_SEP = "\0"` exported from `UserStatsService`.

## Intentional, do not fix

- `OR x.stashInstanceId IS NULL` in the instance filter keeps rows from before multi-instance visible.
- `1 = 0` for INCLUDES_ALL with several studios on groups and galleries: each has at most one studio.
- The random sort reduces `% 2147483647` at each step, to stay in integer range and to match Stash's own order.
