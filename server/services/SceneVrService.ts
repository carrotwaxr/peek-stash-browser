/**
 * Whether a scene is VR, and its projection (PR 11, V5; Contract 7).
 *
 * The instance's effective VR tag is the admin's override (`vrTagId`) when it
 * names a live tag on that instance, else the instance's live tag named
 * exactly as Stash's `configuration.ui.vrTag` (`stashVrTag`), the lowest id as
 * a number when two share the name, as Stash picks it. A scene is VR when one
 * of its own live tags on that instance is the effective tag or a descendant
 * of it; tags inherited from performers, studios or collections do not count.
 *
 * Three reads: the instance's two settings by primary key (never the instance
 * manager's copy, which sync does not reload), one recursive statement that
 * resolves the effective tag and walks up from the scene's tags by primary
 * key, and, for a VR scene only, its live tag names and aliases and its file
 * for `detectVrProjection`. A soft-deleted tag on the scene (its `SceneTag`
 * row stays until the scene is written again) counts for neither.
 */
import type { SceneVr } from "@peek/shared-types/vr.js";
import prisma from "../prisma/singleton.js";
import { parseJsonArray } from "../utils/sqlHelpers.js";
import { jsonListOrEmpty } from "../utils/sqlJson.js";
import { detectVrProjection } from "../utils/vrProjection.js";

/**
 * One row when the effective tag is the scene's own live tag or an ancestor
 * of one. Binds: the override id and instance, Stash's tag name and instance,
 * the scene id and instance, the scene's tags' instance, the walk's instance.
 * `UNION` ends a cycle in the hierarchy.
 */
const IS_VR_SQL = `
WITH RECURSIVE
  vr(id) AS (
    SELECT COALESCE(
      (SELECT o.id FROM StashTag o
        WHERE o.id = ? AND o.stashInstanceId = ? AND o.deletedAt IS NULL),
      (SELECT n.id FROM StashTag n
        WHERE n.name = ? AND +n.stashInstanceId = ? AND n.deletedAt IS NULL
        ORDER BY CAST(n.id AS INTEGER), n.id
        LIMIT 1)
    )
  ),
  up(id) AS (
    SELECT st.tagId FROM SceneTag st
    CROSS JOIN StashTag t0
      ON t0.id = st.tagId AND t0.stashInstanceId = st.tagInstanceId
      AND t0.deletedAt IS NULL
    WHERE st.sceneId = ? AND st.sceneInstanceId = ? AND st.tagInstanceId = ?
    UNION
    SELECT CAST(je.value AS TEXT) FROM up
    CROSS JOIN StashTag t
      ON t.id = up.id AND t.stashInstanceId = ? AND t.deletedAt IS NULL
    CROSS JOIN json_each(${jsonListOrEmpty("t.parentIds")}) je
  )
SELECT 1 AS hit FROM up WHERE up.id = (SELECT id FROM vr) LIMIT 1`;

/**
 * The scene's file and its own live tags' names and aliases, one row per
 * tag (one row with a null name when it has none live). Binds: the scene id
 * and instance.
 */
const HINTS_SQL = `
SELECT s.filePath, s.fileWidth, s.fileHeight, t.name, t.aliases
FROM StashScene s
LEFT JOIN SceneTag st
  ON st.sceneId = s.id AND st.sceneInstanceId = s.stashInstanceId
  AND st.tagInstanceId = s.stashInstanceId
LEFT JOIN StashTag t
  ON t.id = st.tagId AND t.stashInstanceId = st.tagInstanceId
  AND t.deletedAt IS NULL
WHERE s.id = ? AND s.stashInstanceId = ?`;

interface HintRow {
  filePath: string | null;
  fileWidth: number | null;
  fileHeight: number | null;
  name: string | null;
  aliases: string | null;
}

/**
 * The scene's `vr` for the single-scene lookup: its projection when it is
 * VR, null when it is not or its instance has no VR tag.
 */
export async function getSceneVr(
  sceneId: string,
  instanceId: string
): Promise<SceneVr | null> {
  const instance = await prisma.stashInstance.findUnique({
    where: { id: instanceId },
    select: { vrTagId: true, stashVrTag: true },
  });
  if (!instance || (!instance.vrTagId && !instance.stashVrTag)) return null;

  const hits = await prisma.$queryRawUnsafe<Array<{ hit: number }>>(
    IS_VR_SQL,
    instance.vrTagId,
    instanceId,
    instance.stashVrTag,
    instanceId,
    sceneId,
    instanceId,
    instanceId,
    instanceId
  );
  if (hits.length === 0) return null;

  const rows = await prisma.$queryRawUnsafe<HintRow[]>(
    HINTS_SQL,
    sceneId,
    instanceId
  );
  const file = rows[0];
  const tagNames = rows.flatMap((row) =>
    row.name === null
      ? []
      : [
          row.name,
          ...parseJsonArray<unknown>(row.aliases).filter(
            (alias): alias is string => typeof alias === "string"
          ),
        ]
  );
  return detectVrProjection({
    tagNames,
    filePath: file?.filePath,
    width: file?.fileWidth,
    height: file?.fileHeight,
  });
}
