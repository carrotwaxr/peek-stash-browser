---
paths:
  - "server/prisma/**"
  - "server/initializers/database.ts"
  - "server/initializers/migrations.ts"
  - "docker/start.sh"
---

# Prisma and migrations

## Writing a migration

`prisma migrate dev` reads the `scene_fts` FTS5 table and its triggers as drift and offers to reset the database. Write migrations by hand:

1. Create `server/prisma/migrations/YYYYMMDD000000_short_name/migration.sql`, dated after the newest folder.
2. Write the SQL. SQLite cannot change a column or a primary key in place: build `X_new`, copy the rows, drop `X`, rename `X_new` to `X`, inside `PRAGMA foreign_keys=OFF` and `ON`. `20260126000000_composite_entity_keys` is the worked example.
3. Rebuilding `StashScene` drops the `scene_fts_insert`, `scene_fts_delete` and `scene_fts_update` triggers. Create them again in the same migration, as that example does.
4. A migration that changes what sync stores, so the cached rows must be fetched again, says so in its own SQL: `UPDATE "SyncState" SET "lastFullSyncTimestamp" = NULL, "lastIncrementalSyncTimestamp" = NULL WHERE "entityType" IN ('scene', ...);`. Name only the types it affects.
5. Update `schema.prisma` to match the SQL exactly.
6. `cd server && npx prisma generate`, then apply with `npx prisma migrate deploy` against a scratch database. Then `docker compose restart peek-server`: the dev container has its own `node_modules`, and its start regenerates the client and applies the migration.

## How migrations run

- The server owns migrations, in Docker, development and E2E alike; `docker/start.sh` only starts Node, and the dev script only generates the client.
- At startup, before it listens, the server (`server/initializers/database.ts`) runs `migrateDatabase` (`server/initializers/migrations.ts`), which reads the database's tables and `_prisma_migrations` through Prisma and compares them with the folders in `prisma/migrations/`.
- Databases from `prisma db push` (Peek up to v2.0.0, no `_prisma_migrations`) upgrade only from v2.0.0: one with every `0_baseline` table (`LEGACY_BASELINE_TABLES`) gets `migrate resolve --applied 0_baseline`, then the deploy. One missing any stops startup with `LegacyDatabaseError`, which names v2.0.0 to start once first (its boot runs `db push`). A migrated database whose `0_baseline` is marked applied but lacks one of its tables (v2.0.1 marked it on older databases) names v3.2.2, whose schema repair creates them. Neither error writes anything, and `main()` logs the message as it is.
- Nothing pending: it logs `Database schema is up to date (N migrations)` and starts no process. Otherwise it logs `Applying N pending migrations: <names>`, closes the Prisma pool, and runs `prisma migrate deploy` once, with Node on `node_modules/prisma/build/index.js` (no `npx`: the image's `node_modules` is read-only).
- Before the first write to a database that has tables (the deploy, or a v2.0.0 database's baseline marking), `createPreMigrationBackup` (`services/DatabaseBackupService.ts`) copies it with `VACUUM INTO` to `<base>.backup-<YYYYMMDD-HHMMSS>-pre-<version>` in `CONFIG_DIR`, fsynced, and keeps the newest 3 (manual backups are never pruned). With less than 2.2 times the used size plus 64 MiB free there, it throws `InsufficientSpaceError` and nothing is written. That backup is the only downgrade path. A failed deploy is followed by a best-effort `PRAGMA wal_checkpoint(TRUNCATE)`.
- Applied migrations with no folder (a newer Peek migrated the database) get a warning; startup continues.
- Applying migrations starts no sync of its own. A type whose `SyncState` timestamps are both NULL is fetched whole by the next sync, startup or scheduled, in every mode (the `!lastSync` branch), and the other types sync incrementally. The request lives in the data, so it survives a restart mid-sync and holds whoever ran `migrate deploy`.

Every release from v2.0.0 on upgrades through this path, so a migration must work on a populated database, not only an empty one. No migration may drop a `0_baseline` table without changing the legacy check, which reads a missing one as a broken upgrade.

## Schema conventions

- A cached Stash entity table has `@@id([id, stashInstanceId])` and `deletedAt DateTime?`, since sync soft-deletes. `stashInstanceId` is NOT NULL; an old migration backfilled every NULL.
- A junction table keys on both IDs and both instances, e.g. `@@id([sceneId, sceneInstanceId, tagId, tagInstanceId])`.
- Peek's own per-user tables call the column `instanceId`. In the exclusion tables an empty string means every instance.
