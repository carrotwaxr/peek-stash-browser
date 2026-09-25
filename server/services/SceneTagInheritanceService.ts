import prisma from "../prisma/singleton.js";
import { dbWrite } from "../utils/dbWrite.js";
import { logger } from "../utils/logger.js";
import { type EntityRef, distinctRefs, pairsJson } from "./SyncChangeSet.js";

/** Scenes per batch: one read of their sources and one UPDATE (a dbWrite unit). */
const BATCH_SIZE = 500;

/** A scene as the batch reads it. */
interface SceneRow {
  id: string;
  stashInstanceId: string;
  studioId: string | null;
}

/** An entity whose tags its scenes inherit. */
export type InheritanceSource = "performer" | "studio" | "group";

/**
 * The scenes of a batch of sources, one statement per source type, driving
 * from the bound (id, instance) pairs: `CROSS JOIN` keeps `json_each` as the
 * outer loop, so each pair searches the junction's reverse index (the
 * studio's by `studioId`; the `+` keeps the planner off the instance index,
 * which matches every scene of the instance).
 */
const SCENES_OF: Record<InheritanceSource, string> = {
  performer: `SELECT DISTINCT sp.sceneId AS id, sp.sceneInstanceId AS instanceId
FROM json_each(?) j
CROSS JOIN ScenePerformer sp ON sp.performerId = json_extract(j.value, '$[0]') AND sp.performerInstanceId = json_extract(j.value, '$[1]')`,
  studio: `SELECT s.id AS id, s.stashInstanceId AS instanceId
FROM json_each(?) j
CROSS JOIN StashScene s ON s.studioId = json_extract(j.value, '$[0]') AND +s.stashInstanceId = json_extract(j.value, '$[1]')
WHERE s.deletedAt IS NULL`,
  group: `SELECT DISTINCT sg.sceneId AS id, sg.sceneInstanceId AS instanceId
FROM json_each(?) j
CROSS JOIN SceneGroup sg ON sg.groupId = json_extract(j.value, '$[0]') AND sg.groupInstanceId = json_extract(j.value, '$[1]')`,
};

/**
 * SceneTagInheritanceService
 *
 * Computes inherited tags for scenes from related entities.
 * Called after sync completes to denormalize tag data for efficient filtering.
 *
 * Inheritance sources:
 * - Performer tags (from performers in the scene)
 * - Studio tags (from the scene's studio)
 * - Group tags (from groups the scene belongs to)
 *
 * Rules:
 * - Direct scene tags are NOT included in inheritedTagIds (they're already in SceneTag)
 * - Tags are deduplicated across all sources
 * - Stored as JSON array for efficient querying
 * - Multi-instance aware: uses composite keys (id:instanceId) to prevent cross-instance contamination
 * - Scoped: a sync recomputes only the scenes its change set reaches (see
 *   `scenesInheritingFrom`); a full sync, or a scope past the change set's
 *   limit, recomputes every live scene
 */
class SceneTagInheritanceService {
  /**
   * Recompute `inheritedTagIds` for `scope`: every live scene ("all", the
   * default), or the live scenes among the given refs (soft-deleted and
   * unknown refs are skipped), 500 at a time.
   */
  async computeInheritedTags(
    scope: readonly EntityRef[] | "all" = "all"
  ): Promise<void> {
    const startTime = Date.now();

    try {
      let sceneCount = 0;
      if (scope === "all") {
        const scenes = await prisma.stashScene.findMany({
          where: { deletedAt: null },
          select: { id: true, stashInstanceId: true, studioId: true },
        });
        for (let i = 0; i < scenes.length; i += BATCH_SIZE) {
          const batch = scenes.slice(i, i + BATCH_SIZE);
          await this.processBatch(batch);
          sceneCount += batch.length;

          if (sceneCount % 1000 === 0) {
            logger.info(`Processed ${sceneCount}/${scenes.length} scenes`);
          }
        }
      } else {
        const refs = distinctRefs(scope);
        for (let i = 0; i < refs.length; i += BATCH_SIZE) {
          const batch = await this.liveScenes(refs.slice(i, i + BATCH_SIZE));
          if (batch.length > 0) await this.processBatch(batch);
          sceneCount += batch.length;
        }
      }

      const duration = Date.now() - startTime;
      logger.info(
        `Scene tag inheritance computed in ${duration}ms for ${sceneCount} scenes${scope === "all" ? "" : " (scoped)"}`
      );
    } catch (error) {
      logger.error("Failed to compute scene tag inheritance", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  /**
   * The scenes that inherit from these performers, studios or groups. Some
   * may be soft-deleted; `computeInheritedTags` skips those.
   */
  async scenesInheritingFrom(
    source: InheritanceSource,
    refs: readonly EntityRef[]
  ): Promise<EntityRef[]> {
    if (refs.length === 0) return [];
    return prisma.$queryRawUnsafe<EntityRef[]>(
      SCENES_OF[source],
      pairsJson(refs)
    );
  }

  /** The live scenes among `refs`, each looked up by its primary key. */
  private async liveScenes(refs: readonly EntityRef[]): Promise<SceneRow[]> {
    return prisma.$queryRawUnsafe<SceneRow[]>(
      `SELECT s.id AS id, s.stashInstanceId AS stashInstanceId, s.studioId AS studioId
FROM json_each(?) j
CROSS JOIN StashScene s ON s.id = json_extract(j.value, '$[0]') AND s.stashInstanceId = json_extract(j.value, '$[1]')
WHERE s.deletedAt IS NULL`,
      pairsJson(refs)
    );
  }

  private async processBatch(scenes: SceneRow[]): Promise<void> {
    const sceneIds = scenes.map((s) => s.id);
    const sceneInstanceIds = [...new Set(scenes.map((s) => s.stashInstanceId))];

    // Composite key helper
    const KEY_SEP = "\0";
    const compositeKey = (id: string, instanceId: string) =>
      `${id}${KEY_SEP}${instanceId}`;

    // Get direct tags for all scenes in batch (scoped by instance)
    const directTags = await prisma.sceneTag.findMany({
      where: {
        sceneId: { in: sceneIds },
        sceneInstanceId: { in: sceneInstanceIds },
      },
      select: { sceneId: true, sceneInstanceId: true, tagId: true },
    });
    const directTagsByScene = new Map<string, Set<string>>();
    for (const dt of directTags) {
      const key = compositeKey(dt.sceneId, dt.sceneInstanceId);
      if (!directTagsByScene.has(key)) {
        directTagsByScene.set(key, new Set());
      }
      directTagsByScene.get(key)?.add(dt.tagId);
    }

    // Get performer tags for all scenes in batch (scoped by instance)
    const scenePerformers = await prisma.scenePerformer.findMany({
      where: {
        sceneId: { in: sceneIds },
        sceneInstanceId: { in: sceneInstanceIds },
      },
      select: {
        sceneId: true,
        sceneInstanceId: true,
        performerId: true,
        performerInstanceId: true,
      },
    });
    const performerIds = [
      ...new Set(scenePerformers.map((sp) => sp.performerId)),
    ];
    const performerInstanceIds = [
      ...new Set(scenePerformers.map((sp) => sp.performerInstanceId)),
    ];
    const performerTags = await prisma.performerTag.findMany({
      where: {
        performerId: { in: performerIds },
        performerInstanceId: { in: performerInstanceIds },
      },
      select: { performerId: true, performerInstanceId: true, tagId: true },
    });
    const tagsByPerformer = new Map<string, string[]>();
    for (const pt of performerTags) {
      const key = compositeKey(pt.performerId, pt.performerInstanceId);
      if (!tagsByPerformer.has(key)) {
        tagsByPerformer.set(key, []);
      }
      tagsByPerformer.get(key)?.push(pt.tagId);
    }

    // Get studio tags (scoped by instance)
    const studioIds = [
      ...new Set(
        scenes.filter((s) => s.studioId).map((s) => s.studioId as string)
      ),
    ];
    const studioTags = await prisma.studioTag.findMany({
      where: {
        studioId: { in: studioIds },
        studioInstanceId: { in: sceneInstanceIds },
      },
      select: { studioId: true, studioInstanceId: true, tagId: true },
    });
    const tagsByStudio = new Map<string, string[]>();
    for (const st of studioTags) {
      const key = compositeKey(st.studioId, st.studioInstanceId);
      if (!tagsByStudio.has(key)) {
        tagsByStudio.set(key, []);
      }
      tagsByStudio.get(key)?.push(st.tagId);
    }

    // Get group tags for all scenes in batch (scoped by instance)
    const sceneGroups = await prisma.sceneGroup.findMany({
      where: {
        sceneId: { in: sceneIds },
        sceneInstanceId: { in: sceneInstanceIds },
      },
      select: {
        sceneId: true,
        sceneInstanceId: true,
        groupId: true,
        groupInstanceId: true,
      },
    });
    const groupIds = [...new Set(sceneGroups.map((sg) => sg.groupId))];
    const groupInstanceIds = [
      ...new Set(sceneGroups.map((sg) => sg.groupInstanceId)),
    ];
    const groupTags = await prisma.groupTag.findMany({
      where: {
        groupId: { in: groupIds },
        groupInstanceId: { in: groupInstanceIds },
      },
      select: { groupId: true, groupInstanceId: true, tagId: true },
    });
    const tagsByGroup = new Map<string, string[]>();
    for (const gt of groupTags) {
      const key = compositeKey(gt.groupId, gt.groupInstanceId);
      if (!tagsByGroup.has(key)) {
        tagsByGroup.set(key, []);
      }
      tagsByGroup.get(key)?.push(gt.tagId);
    }

    // Build scene -> performer mapping (using composite keys)
    const performersByScene = new Map<string, string[]>();
    for (const sp of scenePerformers) {
      const sceneKey = compositeKey(sp.sceneId, sp.sceneInstanceId);
      const perfKey = compositeKey(sp.performerId, sp.performerInstanceId);
      if (!performersByScene.has(sceneKey)) {
        performersByScene.set(sceneKey, []);
      }
      performersByScene.get(sceneKey)?.push(perfKey);
    }

    // Build scene -> group mapping (using composite keys)
    const groupsByScene = new Map<string, string[]>();
    for (const sg of sceneGroups) {
      const sceneKey = compositeKey(sg.sceneId, sg.sceneInstanceId);
      const grpKey = compositeKey(sg.groupId, sg.groupInstanceId);
      if (!groupsByScene.has(sceneKey)) {
        groupsByScene.set(sceneKey, []);
      }
      groupsByScene.get(sceneKey)?.push(grpKey);
    }

    // Compute inherited tags for each scene
    const updates: {
      id: string;
      instanceId: string;
      inheritedTagIds: string;
    }[] = [];

    for (const scene of scenes) {
      const sceneKey = compositeKey(scene.id, scene.stashInstanceId);
      const inheritedTags = new Set<string>();
      const directTagsForScene = directTagsByScene.get(sceneKey) ?? new Set();

      // Collect performer tags (using composite performer keys)
      const performers = performersByScene.get(sceneKey) ?? [];
      for (const performerKey of performers) {
        const tags = tagsByPerformer.get(performerKey) ?? [];
        for (const tagId of tags) {
          if (!directTagsForScene.has(tagId)) {
            inheritedTags.add(tagId);
          }
        }
      }

      // Collect studio tags (studio is on the same instance as the scene)
      if (scene.studioId) {
        const studioKey = compositeKey(scene.studioId, scene.stashInstanceId);
        const tags = tagsByStudio.get(studioKey) ?? [];
        for (const tagId of tags) {
          if (!directTagsForScene.has(tagId)) {
            inheritedTags.add(tagId);
          }
        }
      }

      // Collect group tags (using composite group keys)
      const groups = groupsByScene.get(sceneKey) ?? [];
      for (const groupKey of groups) {
        const tags = tagsByGroup.get(groupKey) ?? [];
        for (const tagId of tags) {
          if (!directTagsForScene.has(tagId)) {
            inheritedTags.add(tagId);
          }
        }
      }

      updates.push({
        id: scene.id,
        instanceId: scene.stashInstanceId,
        inheritedTagIds: JSON.stringify(Array.from(inheritedTags)),
      });
    }

    // Bulk update using raw SQL for performance
    // SQLite doesn't support UPDATE FROM, so we use CASE expressions
    // Each CASE arm and the WHERE match the (id, stashInstanceId) pair, so two
    // instances sharing a scene id keep their own tags. Every value is bound.
    if (updates.length > 0) {
      const cases = updates
        .map(() => "WHEN id = ? AND stashInstanceId = ? THEN ?")
        .join(" ");
      const pairs = updates.map(() => "(?, ?)").join(", ");
      await dbWrite("inheritance.sceneTags", () =>
        prisma.$executeRawUnsafe(
          `UPDATE StashScene
         SET inheritedTagIds = CASE ${cases} END
         WHERE (id, stashInstanceId) IN (VALUES ${pairs})`,
          ...updates.flatMap((u) => [u.id, u.instanceId, u.inheritedTagIds]),
          ...updates.flatMap((u) => [u.id, u.instanceId])
        )
      );
    }
  }
}

export const sceneTagInheritanceService = new SceneTagInheritanceService();
