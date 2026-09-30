-- Clips for the clip list's bench, on a copy built by build-200k.sh.
--
--   sqlite3 big.db < build-clips.sql
--     one clip per live scene (about 207k on the 200k copy)
--   sqlite3 -cmd ".parameter set @clips 300000" big.db < build-clips.sql
--     the same, then a second clip on enough scenes to reach @clips in all
--
-- A clip's primary tag is its scene's lowest tag id and one more of the
-- scene's tags goes in ClipTag (the second clip: the highest, then the
-- lowest); 90% are generated; created times are spread over the list, not
-- in scene order. New ids start at 2,000,000 (first clips) and 3,000,000
-- (second clips). Run ANALYZE afterwards through Prisma, not this shell:
-- Prisma's SQLite keeps STAT4 samples, which the sqlite3 shell's ANALYZE
-- deletes when it is built without them.
PRAGMA journal_mode = WAL;
BEGIN;
CREATE TEMP TABLE sc AS
  SELECT s.id AS sid, s.stashInstanceId AS sinst, ROW_NUMBER() OVER (ORDER BY s.id) AS n
  FROM StashScene s WHERE s.deletedAt IS NULL;
INSERT INTO StashClip (id, stashInstanceId, sceneId, sceneInstanceId, title, seconds, endSeconds,
  primaryTagId, primaryTagInstanceId, isGenerated, stashCreatedAt, stashUpdatedAt, syncedAt)
SELECT CAST(2000000 + sc.n AS TEXT), sc.sinst, sc.sid, sc.sinst, 'Clip ' || sc.n,
  (sc.n % 50) * 30.0, (sc.n % 50) * 30.0 + 20,
  (SELECT MIN(st.tagId) FROM SceneTag st WHERE st.sceneId = sc.sid AND st.sceneInstanceId = sc.sinst), sc.sinst,
  CASE WHEN sc.n % 10 = 0 THEN 0 ELSE 1 END,
  1700000000000 + ((sc.n * 7919) % 207592) * 60000, 1700000000000 + sc.n * 1000, 1700000000000
FROM sc;
INSERT INTO ClipTag (clipId, clipInstanceId, tagId, tagInstanceId)
SELECT c.id, c.stashInstanceId, t.tagId, c.stashInstanceId FROM StashClip c
JOIN (SELECT st.sceneId, st.sceneInstanceId, MAX(st.tagId) AS tagId FROM SceneTag st GROUP BY st.sceneId, st.sceneInstanceId) t
  ON t.sceneId = c.sceneId AND t.sceneInstanceId = c.sceneInstanceId
WHERE CAST(c.id AS INTEGER) BETWEEN 2000000 AND 2999999
  AND c.primaryTagId IS NOT NULL AND t.tagId != c.primaryTagId;

-- The second clips: none unless @clips is set above the count so far
CREATE TEMP TABLE want AS
  SELECT MAX(0, COALESCE(@clips, 0) - (SELECT COUNT(*) FROM StashClip)) AS n;
INSERT INTO StashClip (id, stashInstanceId, sceneId, sceneInstanceId, title, seconds, endSeconds,
  primaryTagId, primaryTagInstanceId, isGenerated, stashCreatedAt, stashUpdatedAt, syncedAt)
SELECT CAST(3000000 + p.n AS TEXT), p.sinst, p.sid, p.sinst, 'Clip ' || p.n || ' b',
  ((p.n + 25) % 50) * 30.0, ((p.n + 25) % 50) * 30.0 + 45,
  (SELECT MAX(st.tagId) FROM SceneTag st WHERE st.sceneId = p.sid AND st.sceneInstanceId = p.sinst), p.sinst,
  CASE WHEN p.n % 10 = 5 THEN 0 ELSE 1 END,
  1700000000000 + ((p.n * 104729) % 207592) * 60000 + 30000, 1700000000000 + p.n * 1000 + 500, 1700000000000
FROM (SELECT sc.* FROM sc ORDER BY (sc.n * 7919) % 207592 LIMIT (SELECT n FROM want)) p;
INSERT INTO ClipTag (clipId, clipInstanceId, tagId, tagInstanceId)
SELECT c.id, c.stashInstanceId, t.tagId, c.stashInstanceId FROM StashClip c
JOIN (SELECT st.sceneId, st.sceneInstanceId, MIN(st.tagId) AS tagId FROM SceneTag st GROUP BY st.sceneId, st.sceneInstanceId) t
  ON t.sceneId = c.sceneId AND t.sceneInstanceId = c.sceneInstanceId
WHERE CAST(c.id AS INTEGER) >= 3000000
  AND c.primaryTagId IS NOT NULL AND t.tagId != c.primaryTagId;
COMMIT;
PRAGMA wal_checkpoint(TRUNCATE);
SELECT COUNT(*) AS clips, SUM(isGenerated) AS generated, COUNT(primaryTagId) AS withPrimaryTag FROM StashClip;
SELECT COUNT(*) AS clipTags FROM ClipTag;
