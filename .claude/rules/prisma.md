---
paths:
  - "server/prisma/**"
  - "server/initializers/database.ts"
  - "server/initializers/migrations.ts"
  - "server/initializers/schemaCatchup.ts"
  - "docker/start.sh"
---

# Prisma and migrations

## Writing a migration

`prisma migrate dev` reads the `scene_fts` FTS5 table and its triggers as drift and offers to reset the database. Write migrations by hand:

1. Create `server/prisma/migrations/YYYYMMDD000000_short_name/migration.sql`, dated after the newest folder.
2. Write the SQL. SQLite cannot change a column or a primary key in place: build `X_new`, copy the rows, drop `X`, rename `X_new` to `X`, inside `PRAGMA foreign_keys=OFF` and `ON`. `20260126000000_composite_entity_keys` is the worked example.
3. Rebuilding `StashScene` drops the `scene_fts_insert`, `scene_fts_delete` and `scene_fts_update` triggers. Create them again in the same migration, as that example does.
4. Update `schema.prisma` to match the SQL exactly.
5. `cd server && npx prisma generate`, then apply with `npx prisma migrate deploy` against a scratch database. Then `docker compose restart peek-server`: the dev container has its own `node_modules`, and its start regenerates the client and applies the migration.

## How migrations run

- The server owns migrations, in Docker, development and E2E alike; `docker/start.sh` only starts Node, and the dev script only generates the client.
- At startup, before it listens, the server (`server/initializers/database.ts`) runs `runSchemaCatchup`, which adds the tables and columns databases from the `db push` era lack and marks their baseline applied. Then `migrateDatabase` (`server/initializers/migrations.ts`) reads `_prisma_migrations` through Prisma and compares it with the folders in `prisma/migrations/`.
- Nothing pending: it logs `Database schema is up to date (N migrations)` and starts no process. Otherwise it logs `Applying N pending migrations: <names>`, closes the Prisma pool, and runs `prisma migrate deploy` once, with Node on `node_modules/prisma/build/index.js` (no `npx`: the image's `node_modules` is read-only).
- Applied migrations with no folder (a newer Peek migrated the database) get a warning; startup continues.

Every past release upgrades through this path, so a migration must work on a populated database, not only an empty one.

## Schema conventions

- A cached Stash entity table has `@@id([id, stashInstanceId])` and `deletedAt DateTime?`, since sync soft-deletes. `stashInstanceId` is NOT NULL; an old migration backfilled every NULL.
- A junction table keys on both IDs and both instances, e.g. `@@id([sceneId, sceneInstanceId, tagId, tagInstanceId])`.
- Peek's own per-user tables call the column `instanceId`. In the exclusion tables an empty string means every instance.
