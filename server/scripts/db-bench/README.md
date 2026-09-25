# Scene list benchmark

Two scripts, run by hand, that time the scene list's counts and sorts on a
library of about 200,000 scenes. They were used to measure the stored sort
columns (`titleSort`, `performerCount`, `tagCount`, migration
`20260925001100_scene_sort_columns`) and can re-take the numbers after a
change to `SceneQueryBuilder` or the scene indexes. They touch no application
code and never write to the database they read from.

- `build-200k.sh <source.db> <target.db> [copies=7]` copies a Peek database
  and clones every live scene of one instance `copies` more times (ids offset
  by 100,000 per copy), with its `SceneTag`, `ScenePerformer` and `SceneGroup`
  rows and every user's scene exclusions, watch history and ratings. Seven
  copies of a 26k-scene library give about 207k scenes (690 MB, 6 s).
- `bench.sh <db> <userId> [label]` runs each list query as `SceneQueryBuilder`
  builds it for that user (the rating, history and exclusion joins, the
  instance filter): the count, the page-1 sorts, a deep title page and a
  tag-filtered title page. Each runs three times and the last time is
  reported, with its `EXPLAIN QUERY PLAN` summarised on the same line. A
  query whose column the database lacks prints `n/a`: `title_*`,
  `performer_count_p1` and `tag_count_p1` are the sorts before the stored
  columns, `titleSort_*`, `performerCount_p1` and `tagCount_p1` after.

Both take `INSTANCE=<id>` from the environment, the instance to clone and
list; by default the one with the most live scenes. Only scene ids below
100,000 are cloned. They need the `sqlite3` command-line shell and bash.

## Running them

Work on a copy, never on a live database (a backup from Settings → Backup,
or the production snapshot), under `/tmp`:

```bash
mkdir -p /tmp/db-bench
cp <peek database> /tmp/db-bench/source.db
# Bring the copy to the schema to measure: the checkout's migrations
cd server && DATABASE_URL=file:/tmp/db-bench/source.db npx prisma migrate deploy
scripts/db-bench/build-200k.sh /tmp/db-bench/source.db /tmp/db-bench/big.db 7
# Give the bench user (here 11) exclusions on 1 scene in 40, as a user with
# content restrictions has
sqlite3 /tmp/db-bench/big.db "INSERT OR IGNORE INTO UserExcludedEntity (userId, entityType, entityId, instanceId, reason, computedAt) SELECT 11, 'scene', id, stashInstanceId, 'cascade', datetime('now') FROM StashScene WHERE deletedAt IS NULL AND CAST(id AS INTEGER) % 40 = 0"
scripts/db-bench/bench.sh /tmp/db-bench/big.db 11 before
```

To measure a migration, copy `big.db`, apply it with `migrate deploy` as
above, and run `bench.sh` on the copy with another label. Timings depend on
the machine and on whether the database has statistics (`stat1=` in the
header line; `ANALYZE` creates them): compare runs on the same machine.
