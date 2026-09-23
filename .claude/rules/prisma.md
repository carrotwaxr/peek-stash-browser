---
paths:
  - "server/prisma/**"
  - "server/initializers/database.ts"
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
5. `cd server && npx prisma generate`, then apply with `npx prisma migrate deploy` against a scratch database.

## How migrations run

- In the container, `docker/start.sh` first marks `0_baseline` as applied for databases from the `db push` era, then runs `prisma migrate deploy`, then starts the server.
- On startup the server (`server/initializers/database.ts`) runs `runSchemaCatchup`, which adds tables and columns those old databases lack, then `prisma migrate deploy` again. Outside Docker only this second part runs.

Every past release upgrades through this path, so a migration must work on a populated database, not only an empty one.

## Schema conventions

- A cached Stash entity table has `@@id([id, stashInstanceId])` and `deletedAt DateTime?`, since sync soft-deletes. `stashInstanceId` is NOT NULL; an old migration backfilled every NULL.
- A junction table keys on both IDs and both instances, e.g. `@@id([sceneId, sceneInstanceId, tagId, tagInstanceId])`.
- Peek's own per-user tables call the column `instanceId`. In the exclusion tables an empty string means every instance.
