/**
 * How many live scenes each instance holds: the N of a tag's rarity
 * (`tagIdf`), which Recommended and Scenes Like This both read here, so a
 * tag's weight is its share of its own instance's library, whatever the
 * viewer may see of it.
 */
import prisma from "../prisma/singleton.js";
import { instanceClause } from "../utils/sqlClauses.js";

/** Instance id -> live scenes, for the given instances (none is absent) */
export async function liveSceneCounts(
  instanceIds: readonly string[]
): Promise<Map<string, number>> {
  const instances = instanceClause("s", instanceIds);
  const rows = await prisma.$queryRawUnsafe<
    Array<{ instanceId: string; n: bigint | number }>
  >(
    `SELECT s.stashInstanceId AS instanceId, COUNT(*) AS n FROM StashScene s
      WHERE s.deletedAt IS NULL AND ${instances.sql}
      GROUP BY s.stashInstanceId`,
    ...instances.params
  );
  return new Map(rows.map((r) => [r.instanceId, Number(r.n)]));
}
