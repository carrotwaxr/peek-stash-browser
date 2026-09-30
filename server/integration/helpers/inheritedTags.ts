import prisma from "../../prisma/singleton.js";

/**
 * Rewrites the SceneInheritedTag rows of these instances' scenes from their
 * stored `inheritedTagIds`, as scene tag inheritance writes them beside the
 * JSON column (and the migration's backfill copies them). For files that
 * seed `inheritedTagIds` directly: the tag filters, the counts and the
 * exclusion compute read the junction, not the JSON. Call it after every
 * write to the column; deleting the scenes deletes the rows.
 */
export async function mirrorInheritedTags(
  instanceIds: readonly string[]
): Promise<void> {
  const list = JSON.stringify(instanceIds);
  await prisma.$executeRawUnsafe(
    `DELETE FROM SceneInheritedTag
     WHERE sceneInstanceId IN (SELECT value FROM json_each(?))`,
    list
  );
  await prisma.$executeRawUnsafe(
    `INSERT OR IGNORE INTO SceneInheritedTag (sceneId, sceneInstanceId, tagId, tagInstanceId)
     SELECT s.id, s.stashInstanceId, je.value, s.stashInstanceId
     FROM StashScene s
     CROSS JOIN json_each(CASE WHEN json_valid(s.inheritedTagIds) AND json_type(s.inheritedTagIds) = 'array' THEN s.inheritedTagIds ELSE '[]' END) je
     WHERE s.stashInstanceId IN (SELECT value FROM json_each(?)) AND je.atom IS NOT NULL`,
    list
  );
}
