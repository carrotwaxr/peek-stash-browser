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
 */
class SceneTagInheritanceService {
  async computeInheritedTags(): Promise<void> {
    const startTime = Date.now();

    try {
      const scenes = await prisma.stashScene.findMany({
        where: { deletedAt: null },
        select: { id: true, studioId: true },
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

  private async processBatch(scenes: { id: string; studioId: string | null }[]): Promise<void> {
    const sceneIds = scenes.map((s) => s.id);

    // Get direct tags for all scenes in batch
    const directTags = await prisma.sceneTag.findMany({
      where: { sceneId: { in: sceneIds } },
      select: { sceneId: true, tagId: true },
    });
    const directTagsByScene = new Map<string, Set<string>>();
    for (const dt of directTags) {
      if (!directTagsByScene.has(dt.sceneId)) {
        directTagsByScene.set(dt.sceneId, new Set());
      }
      directTagsByScene.get(dt.sceneId)!.add(dt.tagId);
    }

    // Get performer tags for all scenes in batch
    const scenePerformers = await prisma.scenePerformer.findMany({
      where: { sceneId: { in: sceneIds } },
      select: { sceneId: true, performerId: true },
    });
    const performerIds = [...new Set(scenePerformers.map((sp) => sp.performerId))];
    const performerTags = await prisma.performerTag.findMany({
      where: { performerId: { in: performerIds } },
      select: { performerId: true, tagId: true },
    });
    const tagsByPerformer = new Map<string, string[]>();
    for (const pt of performerTags) {
      if (!tagsByPerformer.has(pt.performerId)) {
        tagsByPerformer.set(pt.performerId, []);
      }
      tagsByPerformer.get(pt.performerId)!.push(pt.tagId);
    }

    // Get studio tags
    const studioIds = [...new Set(scenes.filter((s) => s.studioId).map((s) => s.studioId!))];
    const studioTags = await prisma.studioTag.findMany({
      where: { studioId: { in: studioIds } },
      select: { studioId: true, tagId: true },
    });
    const tagsByStudio = new Map<string, string[]>();
    for (const st of studioTags) {
      if (!tagsByStudio.has(st.studioId)) {
        tagsByStudio.set(st.studioId, []);
      }
      tagsByStudio.get(st.studioId)!.push(st.tagId);
    }

    // Get group tags for all scenes in batch
    const sceneGroups = await prisma.sceneGroup.findMany({
      where: { sceneId: { in: sceneIds } },
      select: { sceneId: true, groupId: true },
    });
    const groupIds = [...new Set(sceneGroups.map((sg) => sg.groupId))];
    const groupTags = await prisma.groupTag.findMany({
      where: { groupId: { in: groupIds } },
      select: { groupId: true, tagId: true },
    });
    const tagsByGroup = new Map<string, string[]>();
    for (const gt of groupTags) {
      if (!tagsByGroup.has(gt.groupId)) {
        tagsByGroup.set(gt.groupId, []);
      }
      tagsByGroup.get(gt.groupId)!.push(gt.tagId);
    }

    // Build scene -> performer mapping
    const performersByScene = new Map<string, string[]>();
    for (const sp of scenePerformers) {
      if (!performersByScene.has(sp.sceneId)) {
        performersByScene.set(sp.sceneId, []);
      }
      performersByScene.get(sp.sceneId)!.push(sp.performerId);
    }

    // Build scene -> group mapping
    const groupsByScene = new Map<string, string[]>();
    for (const sg of sceneGroups) {
      if (!groupsByScene.has(sg.sceneId)) {
        groupsByScene.set(sg.sceneId, []);
      }
      groupsByScene.get(sg.sceneId)!.push(sg.groupId);
    }

    // Compute inherited tags for each scene
    const updates: { id: string; inheritedTagIds: string }[] = [];

    for (const scene of scenes) {
      const inheritedTags = new Set<string>();
      const directTagsForScene = directTagsByScene.get(scene.id) || new Set();

      // Collect performer tags
      const performers = performersByScene.get(scene.id) || [];
      for (const performerId of performers) {
        const tags = tagsByPerformer.get(performerId) || [];
        for (const tagId of tags) {
          if (!directTagsForScene.has(tagId)) {
            inheritedTags.add(tagId);
          }
        }
      }

      // Collect studio tags
      if (scene.studioId) {
        const tags = tagsByStudio.get(scene.studioId) || [];
        for (const tagId of tags) {
          if (!directTagsForScene.has(tagId)) {
            inheritedTags.add(tagId);
          }
        }
      }

      // Collect group tags
      const groups = groupsByScene.get(scene.id) || [];
      for (const groupId of groups) {
        const tags = tagsByGroup.get(groupId) || [];
        for (const tagId of tags) {
          if (!directTagsForScene.has(tagId)) {
            inheritedTags.add(tagId);
          }
        }
      }

      updates.push({
        id: scene.id,
        inheritedTagIds: JSON.stringify(Array.from(inheritedTags)),
      });
    }

    // Bulk update using raw SQL for performance
    // SQLite doesn't support UPDATE FROM, so we use CASE expressions
    // Note: IDs come from our database (Stash UUIDs), not user input
    if (updates.length > 0) {
      const cases = updates
        .map((u) => `WHEN '${u.id}' THEN '${u.inheritedTagIds.replace(/'/g, "''")}'`)
        .join(" ");
      const ids = updates.map((u) => `'${u.id}'`).join(",");

      await prisma.$executeRawUnsafe(`
        UPDATE StashScene
        SET inheritedTagIds = CASE id ${cases} END
        WHERE id IN (${ids})
      `);
    }
  }
}

export const sceneTagInheritanceService = new SceneTagInheritanceService();
