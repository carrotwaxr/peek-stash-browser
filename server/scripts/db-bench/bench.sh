#!/usr/bin/env bash
# Time the scene list query's counts and sorts as SceneQueryBuilder builds
# them (buildFromClause, buildBaseWhere, the instance filter), with each
# one's EXPLAIN QUERY PLAN summarised. Usage:
#   bench.sh <db> <userId> [label]
# INSTANCE=<id> is the instance the list shows (default: the one with the
# most live scenes). Each statement runs 3 times; the time reported is the
# last run (warm cache). A query whose columns the database lacks prints
# "n/a": the title_*, performer_count_* and tag_count_* queries are the sorts
# before 3.4.0's stored columns, titleSort_*, performerCount_* and
# tagCount_* the ones after. See README.md.
set -euo pipefail
DB=$1; USER_ID=$2; LABEL=${3:-}
INSTANCE=${INSTANCE:-$(sqlite3 -readonly "$DB" "SELECT stashInstanceId FROM StashScene WHERE deletedAt IS NULL GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 1")}
EQP=$(mktemp); trap 'rm -f "$EQP"' EXIT
SEL="s.id, s.stashInstanceId, s.title, s.filePath, s.stashCreatedAt, r.rating AS userRating, w.playCount AS userPlayCount"
FROM="FROM StashScene s
  LEFT JOIN SceneRating r ON s.id = r.sceneId AND s.stashInstanceId = r.instanceId AND r.userId = $USER_ID
  LEFT JOIN WatchHistory w ON s.id = w.sceneId AND s.stashInstanceId = w.instanceId AND w.userId = $USER_ID
  LEFT JOIN UserExcludedEntity e ON e.userId = $USER_ID AND e.entityType = 'scene' AND e.entityId = s.id AND (e.instanceId = '' OR e.instanceId = s.stashInstanceId)"
WHERE="WHERE s.deletedAt IS NULL AND e.id IS NULL AND (s.stashInstanceId IN ('$INSTANCE') OR s.stashInstanceId IS NULL)"
# The title sort before the stored titleSort
FILENAME="REPLACE(s.filePath, RTRIM(s.filePath, REPLACE(s.filePath, '/', '')), '')"
TITLE_EXPR="COALESCE(NULLIF(s.title, ''), $FILENAME) COLLATE NOCASE"
PC="(SELECT COUNT(*) FROM ScenePerformer sp WHERE sp.sceneId = s.id AND sp.sceneInstanceId = s.stashInstanceId)"
TC="(SELECT COUNT(*) FROM SceneTag st WHERE st.sceneId = s.id AND st.sceneInstanceId = s.stashInstanceId)"
# A tag on many scenes, not the largest
TOPTAG=$(sqlite3 -readonly "$DB" "SELECT tagId FROM SceneTag WHERE tagInstanceId = '$INSTANCE' GROUP BY tagId ORDER BY COUNT(*) DESC LIMIT 1 OFFSET 3")
TAGFILTER="AND EXISTS (SELECT 1 FROM SceneTag st WHERE st.sceneId = s.id AND st.sceneInstanceId = s.stashInstanceId AND st.tagId IN ('$TOPTAG'))"

declare -A Q
Q[count_distinct]="SELECT COUNT(DISTINCT s.id || ':' || s.stashInstanceId) AS total $FROM $WHERE"
Q[count_star]="SELECT COUNT(*) AS total $FROM $WHERE"
Q[created_at_p1]="SELECT $SEL $FROM $WHERE ORDER BY s.stashCreatedAt DESC, s.id DESC LIMIT 40 OFFSET 0"
Q[title_p1]="SELECT $SEL $FROM $WHERE ORDER BY $TITLE_EXPR ASC, s.id ASC LIMIT 40 OFFSET 0"
Q[title_p100]="SELECT $SEL $FROM $WHERE ORDER BY $TITLE_EXPR ASC, s.id ASC LIMIT 40 OFFSET 4000"
Q[performer_count_p1]="SELECT $SEL $FROM $WHERE ORDER BY $PC DESC, s.id DESC LIMIT 40 OFFSET 0"
Q[tag_count_p1]="SELECT $SEL $FROM $WHERE ORDER BY $TC DESC, s.id DESC LIMIT 40 OFFSET 0"
Q[rating_p1]="SELECT $SEL $FROM $WHERE ORDER BY COALESCE(r.rating, 0) DESC, s.id DESC LIMIT 40 OFFSET 0"
Q[tagfilter_title_p1]="SELECT $SEL $FROM $WHERE $TAGFILTER ORDER BY $TITLE_EXPR ASC, s.id ASC LIMIT 40 OFFSET 0"
Q[tagfilter_count_distinct]="SELECT COUNT(DISTINCT s.id || ':' || s.stashInstanceId) AS total $FROM $WHERE $TAGFILTER"
Q[tagfilter_count_star]="SELECT COUNT(*) AS total $FROM $WHERE $TAGFILTER"
# The stored columns (3.4.0 on)
Q[titleSort_p1]="SELECT $SEL $FROM $WHERE ORDER BY s.titleSort ASC, s.id ASC LIMIT 40 OFFSET 0"
Q[titleSort_p100]="SELECT $SEL $FROM $WHERE ORDER BY s.titleSort ASC, s.id ASC LIMIT 40 OFFSET 4000"
Q[performerCount_p1]="SELECT $SEL $FROM $WHERE ORDER BY s.performerCount DESC, s.id DESC LIMIT 40 OFFSET 0"
Q[tagCount_p1]="SELECT $SEL $FROM $WHERE ORDER BY s.tagCount DESC, s.id DESC LIMIT 40 OFFSET 0"
Q[tagfilter_titleSort_p1]="SELECT $SEL $FROM $WHERE $TAGFILTER ORDER BY s.titleSort ASC, s.id ASC LIMIT 40 OFFSET 0"

ORDER="count_distinct count_star created_at_p1 title_p1 title_p100 performer_count_p1 tag_count_p1 rating_p1 tagfilter_title_p1 tagfilter_count_distinct tagfilter_count_star titleSort_p1 titleSort_p100 performerCount_p1 tagCount_p1 tagfilter_titleSort_p1"
echo "## bench $LABEL db=$DB user=$USER_ID instance=$INSTANCE tag=$TOPTAG scenes=$(sqlite3 -readonly "$DB" 'SELECT COUNT(*) FROM StashScene WHERE deletedAt IS NULL') stat1=$(sqlite3 -readonly "$DB" "SELECT COUNT(*) FROM sqlite_master WHERE name = 'sqlite_stat1'")"
for name in $ORDER; do
  sql=${Q[$name]}
  if ! sqlite3 -readonly "$DB" "EXPLAIN QUERY PLAN $sql" > "$EQP" 2>&1; then
    echo "- $name: n/a ($(head -n 1 "$EQP" | cut -c1-80))"; continue
  fi
  t=$(printf '.timer on\n%s;\n%s;\n%s;\n' "$sql" "$sql" "$sql" | sqlite3 -readonly "$DB" 2>&1 | grep -o 'real [0-9.]*' | tail -1 | awk '{printf "%d ms", $2*1000}' || true)
  plan=$(grep -E "SCAN|SEARCH|TEMP B-TREE|BLOOM" "$EQP" | sed 's/^[-|` ]*//' | grep -E "^(SCAN|SEARCH|USE TEMP|BLOOM)" | grep -vE "SEARCH (r|w|e) " | paste -sd ";" | cut -c1-220 || true)
  echo "- $name: $t | $plan"
done
