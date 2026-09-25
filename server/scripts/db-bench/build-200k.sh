#!/usr/bin/env bash
# Build a ~200k-scene copy of a Peek database by cloning every live scene of
# one instance COPIES more times (ids offset by k*100000), with its junction
# rows and every user's per-user scene rows, so the list query's joins stay
# realistic. Works on a database at any schema from 3.4.0 on (the columns
# are read from the source). Usage:
#   build-200k.sh <source.db> <target.db> [copies=7]
# INSTANCE=<id> picks the instance to clone (default: the one with the most
# live scenes). Only ids below 100000 are cloned. See README.md.
set -euo pipefail
SRC=$1; DST=$2; COPIES=${3:-7}
INSTANCE=${INSTANCE:-$(sqlite3 -readonly "$SRC" "SELECT stashInstanceId FROM StashScene WHERE deletedAt IS NULL GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 1")}
cp "$SRC" "$DST"; rm -f "$DST-wal" "$DST-shm"
cols() { sqlite3 -readonly "$SRC" "select group_concat(name, ', ') from pragma_table_info('$1')"; }
# clone TABLE ID_COL "join/where" OFF: copy rows with ID_COL shifted by OFF;
# a leading autoincrement `id` column (per-user tables) is left to SQLite.
clone() {
  local t=$1 idc=$2 extra=$3 off=$4 names sel
  names=$(cols "$t"); names=${names#id, }
  sel=$(echo "$names" | sed "s/\(^\|, \)$idc\(,\|$\)/\1CAST(CAST(x.$idc AS INTEGER)+$off AS TEXT)\2/")
  echo "INSERT OR IGNORE INTO $t ($names) SELECT $sel FROM $t x $extra AND CAST(x.$idc AS INTEGER) < 100000;"
}
SQL="PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA foreign_keys=OFF; PRAGMA cache_size=-256000;"
LIVE="JOIN StashScene s ON s.id=x.sceneId AND s.stashInstanceId=x.sceneInstanceId WHERE s.deletedAt IS NULL AND s.stashInstanceId='$INSTANCE'"
SCENE_COLS=$(cols StashScene)
for k in $(seq 1 "$COPIES"); do
  OFF=$((k*100000))
  SQL+="
INSERT INTO StashScene ($SCENE_COLS) SELECT ${SCENE_COLS/id, /CAST(CAST(id AS INTEGER)+$OFF AS TEXT), } FROM StashScene WHERE stashInstanceId='$INSTANCE' AND deletedAt IS NULL AND CAST(id AS INTEGER) < 100000;
$(clone SceneTag sceneId "$LIVE" $OFF)
$(clone ScenePerformer sceneId "$LIVE" $OFF)
$(clone SceneGroup sceneId "$LIVE" $OFF)
$(clone UserExcludedEntity entityId "WHERE x.entityType='scene' AND x.instanceId IN ('', '$INSTANCE')" $OFF)
$(clone WatchHistory sceneId "WHERE x.instanceId='$INSTANCE'" $OFF)
$(clone SceneRating sceneId "WHERE x.instanceId='$INSTANCE'" $OFF)
"
done
SQL+="
PRAGMA journal_mode=WAL;
SELECT 'scenes', COUNT(*) FROM StashScene WHERE deletedAt IS NULL;
SELECT 'SceneTag', COUNT(*) FROM SceneTag;
SELECT 'ScenePerformer', COUNT(*) FROM ScenePerformer;
SELECT 'UserExcludedEntity scene', COUNT(*) FROM UserExcludedEntity WHERE entityType='scene';
SELECT 'WatchHistory', COUNT(*) FROM WatchHistory;
SELECT 'SceneRating', COUNT(*) FROM SceneRating;
"
echo "$SQL" > "$DST.build.sql"
time sqlite3 "$DST" < "$DST.build.sql"
ls -la "$DST"
