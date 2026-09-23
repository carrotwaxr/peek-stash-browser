---
paths:
  - "server/services/*QueryBuilder.ts"
  - "server/utils/sqlFilterBuilders.ts"
  - "server/utils/sqlHelpers.ts"
  - "server/utils/hierarchyUtils.ts"
  - "server/services/StashEntityService.ts"
  - "server/services/UserInstanceService.ts"
  - "server/services/UserStatsService.ts"
  - "server/services/EntityAccessService.ts"
  - "server/services/RankingComputeService.ts"
  - "server/utils/entityInstanceId.ts"
  - "server/utils/instanceUtils.ts"
  - "server/controllers/library/**"
---

# Instance-aware queries

The query builders run their list and count queries as raw SQL through `prisma.$queryRawUnsafe` with `?` parameters, then load related entities in one batch per relation.

## Filter values

- Filter values arrive as `"id:instanceId"` strings, and `coerceEntityRefs` marks them as `InstanceAwareId`.
- `buildJunctionFilter` and `buildDirectFilter` match (id, instance) pairs only for values that carry an instance. A bare id matches that id on every instance, and two Stash servers reuse small ids all the time.
- `parseCompositeFilterValues` returns the instance with each id. Several builders keep only `.id`, and the depth expansion in `hierarchyUtils.ts` works on bare ids, so those filters cross instances. New code keeps the instance through expansion.
- A scene tag filter checks both the `SceneTag` junction and the `inheritedTagIds` JSON column through `json_each`.

## Every list query

- Exclusions: `LEFT JOIN UserExcludedEntity e ON ... AND (e.instanceId = '' OR e.instanceId = x.stashInstanceId)`, with `e.id IS NULL` in the WHERE. Never `NOT IN (...)` with one parameter per excluded entity: users with many exclusions exceed SQLite's bound-parameter limit (Prisma P2029).
- `x.deletedAt IS NULL`, because sync soft-deletes.
- The allowed-instances filter (`buildInstanceFilter`, fed by `UserInstanceService.getUserAllowedInstanceIds`). Its `OR stashInstanceId IS NULL` arm is dead, since the column is NOT NULL; don't copy it into new queries.
- BigInt columns such as `fileSize` go through `Number()` in `transformRow`. Row types live in `server/types/internal/queryRows.ts`.
- The random sort reduces `% 2147483647` at each step to keep large seeds in integer range.

## Lookups

- The per-entity getters `get<Entity>(id, instanceId)` and most `get<Entity>sByIds` require an instanceId. Many other `StashEntityService` methods (name maps, counts, `getAll*`, cross-entity lookups) ignore instances; check before relying on one.
- `getEntityInstanceId()` takes a bare id. If the id exists on several instances it returns the alphabetically first `stashInstanceId` and only logs. If it finds nothing, or the lookup throws, it returns the first configured instance. Prefer an instanceId from the request.
- In-memory maps key on `` `${id}${KEY_SEP}${instanceId}` ``, with `KEY_SEP = "\0"` exported from `UserStatsService`; several controllers redefine it locally.
- A query that drives from a bound JSON list (`json_each(?)`) into an entity table joins it with `CROSS JOIN`, so SQLite keeps `json_each` as the outer loop and looks each ref up by primary key. A plain `JOIN` can make it scan the table and re-read the JSON for every row (27.7 s for 5,000 refs against 26k scenes; 10 ms with `CROSS JOIN`). Check with `EXPLAIN QUERY PLAN`: `SCAN j`, then `SEARCH x USING ... PRIMARY KEY`.

## SQLite numbers

SQLite can return `5.0000000001` from an integer column, and BigInt from a large one. Wrap counts in `Math.round(Number(x))` before writing them to an `Int` field (#410), and convert BigInt with `Number()` before JSON.
