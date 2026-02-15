import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";

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
 */
class SceneTagInheritanceService {
  async computeInheritedTags(): Promise<void> {
    const startTime = Date.now();

    try {
      const scenes = await prisma.stashScene.findMany({
        where: { deletedAt: null },
        select: { id: true, stashInstanceId: true, studioId: true },
      });

      const BATCH_SIZE = 500;
      let processedCount = 0;

      for (let i = 0; i < scenes.length; i += BATCH_SIZE) {
        const batch = scenes.slice(i, i + BATCH_SIZE);
        await this.processBatch(batch);
        processedCount += batch.length;

        if (processedCount % 1000 === 0) {
          logger.info(`Processed ${processedCount}/${scenes.length} scenes`);
        }
      }

      const duration = Date.now() - startTime;
      logger.info(`Scene tag inheritance computed in ${duration}ms for ${scenes.length} scenes`);
    } catch (error) {
      logger.error("Failed to compute scene tag inheritance", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  private async processBatch(scenes: { id: string; stashInstanceId: string; studioId: string | null }[]): Promise<void> {
    const sceneIds = scenes.map((s) => s.id);
    const sceneInstanceIds = [...new Set(scenes.map((s) => s.stashInstanceId))];

    // Composite key helper
    const KEY_SEP = "\0";
    const compositeKey = (id: string, instanceId: string) => `${id}${KEY_SEP}${instanceId}`;

    // Get direct tags for all scenes in batch (scoped by instance)
    const directTags = await prisma.sceneTag.findMany({
      where: { sceneId: { in: sceneIds }, sceneInstanceId: { in: sceneInstanceIds } },
      select: { sceneId: true, sceneInstanceId: true, tagId: true },
    });
    const directTagsByScene = new Map<string, Set<string>>();
    for (const dt of directTags) {
      const key = compositeKey(dt.sceneId, dt.sceneInstanceId);
      if (!directTagsByScene.has(key)) {
        directTagsByScene.set(key, new Set());
      }
      directTagsByScene.get(key)!.add(dt.tagId);
    }

    // Get performer tags for all scenes in batch (scoped by instance)
    const scenePerformers = await prisma.scenePerformer.findMany({
      where: { sceneId: { in: sceneIds }, sceneInstanceId: { in: sceneInstanceIds } },
      select: { sceneId: true, sceneInstanceId: true, performerId: true, performerInstanceId: true },
    });
    const performerIds = [...new Set(scenePerformers.map((sp) => sp.performerId))];
    const performerInstanceIds = [...new Set(scenePerformers.map((sp) => sp.performerInstanceId))];
    const performerTags = await prisma.performerTag.findMany({
      where: { performerId: { in: performerIds }, performerInstanceId: { in: performerInstanceIds } },
      select: { performerId: true, performerInstanceId: true, tagId: true },
    });
    const tagsByPerformer = new Map<string, string[]>();
    for (const pt of performerTags) {
      const key = compositeKey(pt.performerId, pt.performerInstanceId);
      if (!tagsByPerformer.has(key)) {
        tagsByPerformer.set(key, []);
      }
      tagsByPerformer.get(key)!.push(pt.tagId);
    }

    // Get studio tags (scoped by instance)
    const studioIds = [...new Set(scenes.filter((s) => s.studioId).map((s) => s.studioId!))];
    const studioTags = await prisma.studioTag.findMany({
      where: { studioId: { in: studioIds }, studioInstanceId: { in: sceneInstanceIds } },
      select: { studioId: true, studioInstanceId: true, tagId: true },
    });
    const tagsByStudio = new Map<string, string[]>();
    for (const st of studioTags) {
      const key = compositeKey(st.studioId, st.studioInstanceId);
      if (!tagsByStudio.has(key)) {
        tagsByStudio.set(key, []);
      }
      tagsByStudio.get(key)!.push(st.tagId);
    }

    // Get group tags for all scenes in batch (scoped by instance)
    const sceneGroups = await prisma.sceneGroup.findMany({
      where: { sceneId: { in: sceneIds }, sceneInstanceId: { in: sceneInstanceIds } },
      select: { sceneId: true, sceneInstanceId: true, groupId: true, groupInstanceId: true },
    });
    const groupIds = [...new Set(sceneGroups.map((sg) => sg.groupId))];
    const groupInstanceIds = [...new Set(sceneGroups.map((sg) => sg.groupInstanceId))];
    const groupTags = await prisma.groupTag.findMany({
      where: { groupId: { in: groupIds }, groupInstanceId: { in: groupInstanceIds } },
      select: { groupId: true, groupInstanceId: true, tagId: true },
    });
    const tagsByGroup = new Map<string, string[]>();
    for (const gt of groupTags) {
      const key = compositeKey(gt.groupId, gt.groupInstanceId);
      if (!tagsByGroup.has(key)) {
        tagsByGroup.set(key, []);
      }
      tagsByGroup.get(key)!.push(gt.tagId);
    }

    // Build scene -> performer mapping (using composite keys)
    const performersByScene = new Map<string, string[]>();
    for (const sp of scenePerformers) {
      const sceneKey = compositeKey(sp.sceneId, sp.sceneInstanceId);
      const perfKey = compositeKey(sp.performerId, sp.performerInstanceId);
      if (!performersByScene.has(sceneKey)) {
        performersByScene.set(sceneKey, []);
      }
      performersByScene.get(sceneKey)!.push(perfKey);
    }

    // Build scene -> group mapping (using composite keys)
    const groupsByScene = new Map<string, string[]>();
    for (const sg of sceneGroups) {
      const sceneKey = compositeKey(sg.sceneId, sg.sceneInstanceId);
      const grpKey = compositeKey(sg.groupId, sg.groupInstanceId);
      if (!groupsByScene.has(sceneKey)) {
        groupsByScene.set(sceneKey, []);
      }
      groupsByScene.get(sceneKey)!.push(grpKey);
    }

    // Compute inherited tags for each scene
    const updates: { id: string; instanceId: string; inheritedTagIds: string }[] = [];

    for (const scene of scenes) {
      const sceneKey = compositeKey(scene.id, scene.stashInstanceId);
      const inheritedTags = new Set<string>();
      const directTagsForScene = directTagsByScene.get(sceneKey) || new Set();

      // Collect performer tags (using composite performer keys)
      const performers = performersByScene.get(sceneKey) || [];
      for (const performerKey of performers) {
        const tags = tagsByPerformer.get(performerKey) || [];
        for (const tagId of tags) {
          if (!directTagsForScene.has(tagId)) {
            inheritedTags.add(tagId);
          }
        }
      }

      // Collect studio tags (studio is on the same instance as the scene)
      if (scene.studioId) {
        const studioKey = compositeKey(scene.studioId, scene.stashInstanceId);
        const tags = tagsByStudio.get(studioKey) || [];
        for (const tagId of tags) {
          if (!directTagsForScene.has(tagId)) {
            inheritedTags.add(tagId);
          }
        }
      }

      // Collect group tags (using composite group keys)
      const groups = groupsByScene.get(sceneKey) || [];
      for (const groupKey of groups) {
        const tags = tagsByGroup.get(groupKey) || [];
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
    // Use composite key (id, stashInstanceId) for multi-instance correctness
    // Note: IDs come from our database (Stash UUIDs), not user input
    if (updates.length > 0) {
      const cases = updates
        .map((u) => `WHEN '${u.id}' THEN '${u.inheritedTagIds.replace(/'/g, "''")}'`)
        .join(" ");
      const idInstancePairs = updates
        .map((u) => `('${u.id}', '${u.instanceId}')`)
        .join(",");

      await prisma.$executeRawUnsafe(`
        UPDATE StashScene
        SET inheritedTagIds = CASE id ${cases} END
        WHERE (id, stashInstanceId) IN (${idInstancePairs})
      `);
    }
  }
}

export const sceneTagInheritanceService = new SceneTagInheritanceService();
