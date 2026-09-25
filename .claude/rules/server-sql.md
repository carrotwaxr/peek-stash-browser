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
  - "server/utils/dbWrite.ts"
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
- The allowed-instances filter (`buildInstanceFilter`, fed by `UserInstanceService.getUserAllowedInstanceIds`: enabled, selected (a selection naming no enabled instance means every enabled one) and past their first sync). Its `OR stashInstanceId IS NULL` arm is dead, since the column is NOT NULL; don't copy it into new queries.
- The count is `COUNT(*)`, exact because every other LEFT JOIN is on a unique key (the per-user rows by user, instance and entity) and the exclusion join is an anti-join (`e.id IS NULL`). A new LEFT JOIN that can match several rows overcounts silently: filter with `EXISTS` instead.
- BigInt columns such as `fileSize` go through `Number()` in `transformRow`. Row types live in `server/types/internal/queryRows.ts`.
- Scene sorts on an index: `created_at`, `updated_at`, `date` and `duration` through `(deletedAt, X DESC)`, and `title`, `performer_count` and `tag_count` through the stored `titleSort`, `performerCount` and `tagCount` with `(deletedAt, X, id)`. `titleSort` is the displayed title (the title, else the file name without its extension), lower-cased by SQLite's `lower()`, which folds ASCII only; `performerCount` and `tagCount` count the scene's `ScenePerformer` and `SceneTag` rows. `refreshSceneDerivedColumns` (`SCENE_DERIVED_COLUMNS_SQL` in `StashSyncService.ts`) writes all three after the junction inserts of every scene batch; anything else that writes a scene or its junction rows calls it too. The per-user sorts (rating, plays, O count) and random sort in a temp B-tree.
- The random sort reduces `% 2147483647` at each step to keep large seeds in integer range.
- The database has planner statistics (migration `20260925001100` runs `ANALYZE`, and each sync that wrote runs `PRAGMA optimize`), so a plan on the replay's small tables says little. Time a new list query on a 200k-scene copy with `server/scripts/db-bench/` (its README), before and after.

## Lookups

- The per-entity getters `get<Entity>(id, instanceId)` and most `get<Entity>sByIds` require an instanceId. Many other `StashEntityService` methods (name maps, counts, `getAll*`, cross-entity lookups) ignore instances; check before relying on one.
- `getEntityInstanceId()` takes a bare id. If the id exists on several instances it returns the alphabetically first `stashInstanceId` and only logs. If it finds nothing, or the lookup throws, it returns the first configured instance. Prefer an instanceId from the request.
- In-memory maps key on `` `${id}${KEY_SEP}${instanceId}` ``, with `KEY_SEP = "\0"` exported from `UserStatsService`; several controllers redefine it locally.
- A query that drives from a bound JSON list (`json_each(?)`) into an entity table joins it with `CROSS JOIN`, so SQLite keeps `json_each` as the outer loop and looks each ref up by primary key. A plain `JOIN` can make it scan the table and re-read the JSON for every row (27.7 s for 5,000 refs against 26k scenes; 10 ms with `CROSS JOIN`). Check with `EXPLAIN QUERY PLAN`: `SCAN j`, then `SEARCH x USING ... PRIMARY KEY`.

## Writes

- The writer rule: every transaction, every multi-row statement (`createMany`, `INSERT ... SELECT`, a whole-table `UPDATE`, a chunked delete) and every single-row write on a user path (ratings, favorites, O counts, plays, image views, hides, stats, playlists, restrictions) is a unit of the writer queue in `server/utils/dbWrite.ts`. Units run one at a time, in arrival order. `dbWrite(label, fn)` for statements, `dbWriteTransaction(label, fn)` for an interactive transaction, `dbWriteBatch(label, [...])` for a batch; the label ("rating.scene", "sync.scenes") names the unit in the logs. Other single-row writes (settings, setup, groups, themes, carousels, downloads, auth) stay autocommit and wait in SQLite's `busy_timeout` (5 s).
- Why a queue in Node: Prisma's SQLite driver waits for the write lock on the query engine's worker threads (one per CPU). A few waiting writers occupy them all, the lock holder cannot run its next statement, and they time out together (P1008: 32 of 40 simultaneous hides failed on a 16-CPU box). A unit waiting in the queue holds no connection and no engine thread.
- No unit holds the lock longer than 1 s on a 200k-scene library (`DB_WRITE_HOLD_WARN_MS`): longer work is chunked (one unit per sync page, per user's exclusion swap, per 500 to 5,000 rows), so user writes interleave with it. Build every statement before the unit starts, and make no Stash request inside one. A unit over the bound logs `Database write held the lock {label, ms}`; one that waited in the queue longer than 10 s logs `Database write waited for the queue {label, ms, behind}`, naming the unit ahead of it.
- A busy failure (the lock held from outside the queue: the sqlite3 CLI, another process) reruns the unit from the start for up to 30 s, logging `Database write waiting for the lock`, so `fn` keeps no state between attempts. Any other error, a transaction's own timeout (P2028) included, is thrown at once.
- Nesting: inside a `dbWriteTransaction` callback write through `tx`, never through `dbWrite`; a nested unit throws `dbWrite re-entered: <outer> -> <inner>` in tests and development and logs it and runs inline in production. Never take the compute connection (`withComputeConnection`) inside a unit: the order is the compute connection first, then the queue.
- Reads never queue: under WAL a read waits only for a pool connection and an engine worker, never for the writer. The one write that waits on readers is `wal_checkpoint(TRUNCATE)` (`checkpointWal` in `utils/databaseMaintenance.ts`, after the post-sync steps and at shutdown): it holds the lock while readers of older pages finish, up to `busy_timeout`, and the queue waits behind it.
- Lint: `prisma.$transaction` outside `utils/dbWrite.ts` is an error (`no-restricted-syntax`; tests may mock it).
- `configureSQLite`'s performance PRAGMAs (`synchronous = NORMAL`, cache, mmap) reach only the pooled connection that ran them; the compute connection sets its own `cache_size` and `synchronous`. A timing taken through the pool may run on a connection with SQLite's defaults (2 MB cache, `synchronous = FULL`).

## `||` defaults

A `||` on an id, an instance id or a count needs a `??` review before it changes: `""` means every instance (in the exclusion and hidden-entity tables, say) and `0` is a real count, so `||` may be replacing a meaningful value. `prefer-nullish-coalescing` flags them; the unreviewed ones sit in `server/eslint-suppressions.json`.

## SQLite numbers

SQLite can return `5.0000000001` from an integer column, and BigInt from a large one. Wrap counts in `Math.round(Number(x))` before writing them to an `Int` field (#410), and convert BigInt with `Number()` before JSON.

Prisma's raw queries return `COUNT`, `SUM` and `COALESCE` over integers as `bigint`, a `BIGINT` column such as `fileSize` as `bigint`, and a `BOOLEAN` column as `boolean`. A raw row type says so, and its `Number()` stays: `no-unnecessary-type-conversion` flags one only when the row type wrongly claims `number`.
