---
paths:
  - "server/prisma/**"
  - "server/initializers/database.ts"
  - "server/initializers/migrations.ts"
  - "docker/start.sh"
---

# Prisma and migrations

## Writing a migration

Write migrations by hand:

1. Create `server/prisma/migrations/YYYYMMDD000000_short_name/migration.sql`, dated after the newest folder.
2. Write the SQL in one transaction, so a failure rolls back every statement and the next start can retry it:

   ```sql
   PRAGMA foreign_keys=OFF;
   BEGIN;
   -- the migration
   COMMIT;
   PRAGMA foreign_keys=ON;
   ```

   - Prisma runs a migration statement by statement; the wrapper is what makes it atomic. `isAtomicMigration` (`server/initializers/migrations.ts`) checks the form, and `tests/prisma/migrationFiles.test.ts` holds every folder from `20260925000000` on to it.
   - Foreign keys go off before `BEGIN`: inside a transaction the pragma does nothing, and a rebuild's `DROP TABLE` would cascade.
   - No other `BEGIN`, `COMMIT`, `PRAGMA foreign_keys` or `PRAGMA defer_foreign_keys` in between: strip the pairs Prisma generates.
   - SQLite cannot change a column or a primary key in place: build `new_X`, copy the rows, drop `X`, rename `new_X` to `X`. `20260126000000_composite_entity_keys` shows the steps (in the older form, without the transaction; leave out its `scene_fts` triggers, which `20260925000100_drop_scene_fts` dropped with their table).
   - A migration that rebuilds tables ends, before `COMMIT`, with the foreign-key guard over the tables it rebuilt. A row whose parent is missing aborts the migration (SQLite error 275), and it rolls back:

     ```sql
     CREATE TEMP TABLE "_fk_guard" ("violations" INTEGER NOT NULL CHECK ("violations" = 0));
     INSERT INTO "_fk_guard" SELECT count(*) FROM (SELECT 1 FROM pragma_foreign_key_check('<T1>') UNION ALL SELECT 1 FROM pragma_foreign_key_check('<T2>'));
     DROP TABLE "_fk_guard";
     ```

3. A migration that changes what sync stores, so the cached rows must be fetched again, says so in its own SQL: `UPDATE "SyncState" SET "lastFullSyncTimestamp" = NULL, "lastIncrementalSyncTimestamp" = NULL WHERE "entityType" IN ('scene', ...);`. Name only the types it affects.
4. Update `schema.prisma` to match the SQL exactly.
5. `cd server && npx prisma generate`, then apply with `npx prisma migrate deploy` against a scratch database. Then `docker compose restart peek-server`: the dev container has its own `node_modules`, and its start regenerates the client and applies the migration.

## How migrations run

- The server owns migrations, in Docker, development and E2E alike; `docker/start.sh` only starts Node, and the dev script only generates the client.
- At startup, before it listens, the server (`server/initializers/database.ts`) runs `migrateDatabase` (`server/initializers/migrations.ts`), which reads the database's tables and `_prisma_migrations` through Prisma and compares them with the folders in `prisma/migrations/`.
- Databases from `prisma db push` (Peek up to v2.0.0, no `_prisma_migrations`) upgrade only from v2.0.0: one with every `0_baseline` table (`LEGACY_BASELINE_TABLES`) gets `migrate resolve --applied 0_baseline`, then the deploy. One missing any stops startup with `LegacyDatabaseError`, which names v2.0.0 to start once first (its boot runs `db push`). A migrated database whose `0_baseline` is marked applied but lacks one of its tables (v2.0.1 marked it on older databases) names v3.2.2, whose schema repair creates them. Neither error writes anything, and `main()` logs the message as it is.
- Nothing pending: it logs `Database schema is up to date (N migrations)` and starts no process. Otherwise it logs `Applying N pending migrations: <names>`, closes the Prisma pool, and runs `prisma migrate deploy` once, with Node on `node_modules/prisma/build/index.js` (no `npx`: the image's `node_modules` is read-only).
- Before the first write to a database that has tables (the deploy, or a v2.0.0 database's baseline marking), `createPreMigrationBackup` (`services/DatabaseBackupService.ts`) copies it with `VACUUM INTO` to `<base>.backup-<YYYYMMDD-HHMMSS>-pre-<version>` in `CONFIG_DIR`, fsynced, and keeps the newest 3 (manual backups are never pruned). With less than 2.2 times the used size plus 64 MiB free there, it throws `InsufficientSpaceError` and nothing is written. That backup is the only downgrade path. A failed deploy is followed by a best-effort `PRAGMA wal_checkpoint(TRUNCATE)`.
- A migration an earlier start began and did not finish (a `_prisma_migrations` row with neither `finished_at` nor `rolled_back_at`, which makes `migrate deploy` stop with P3009):
  - Atomic (`isAtomicMigration`): it rolled back whole. The server logs `Migration X was interrupted and rolled back; retrying`, runs `migrate resolve --rolled-back X`, then deploys once. It takes no new backup when a `-pre-<this version>` backup exists: the failed start took it, and the server has not served since.
  - Not atomic (every migration before `20260925000000`), or its folder is missing: `MigrationFailedError` (`partial`) before anything is written or started. The message names the migration, Prisma's logged error, the newest pre-migration backup, and the two ways out: restore it, or fix the cause and run `migrate resolve --rolled-back X` through `docker run` (the container crash-loops, and `docker exec` runs as root).
  - The retried deploy fails: `MigrationFailedError` (`retryFailed`: fix the cause, the next start retries). When it fails on an object the migration itself creates or drops (`objectMigrationAlreadyChanged`), the migration had committed before Prisma recorded it (a stop between `COMMIT` and Prisma's update): `alreadyApplied`, whose message gives `migrate resolve --applied X` instead. A later migration's first failure is rethrown as Prisma's error.
- Applied migrations with no folder (a newer Peek migrated the database) get a warning; startup continues.
- Applying migrations starts no sync of its own. A type whose `SyncState` timestamps are both NULL is fetched whole by the next sync, startup or scheduled, in every mode (the `!lastSync` branch), and the other types sync incrementally. The request lives in the data, so it survives a restart mid-sync and holds whoever ran `migrate deploy`.

Every release from v2.0.0 on upgrades through this path, so a migration must work on a populated database, not only an empty one. No migration may drop a `0_baseline` table without changing the legacy check, which reads a missing one as a broken upgrade.

## Schema conventions

- A cached Stash entity table has `@@id([id, stashInstanceId])` and `deletedAt DateTime?`, since sync soft-deletes. `stashInstanceId` is NOT NULL; an old migration backfilled every NULL.
- A junction table keys on both IDs and both instances, e.g. `@@id([sceneId, sceneInstanceId, tagId, tagInstanceId])`.
- Peek's own per-user tables call the column `instanceId`. In the exclusion tables an empty string means every instance.
