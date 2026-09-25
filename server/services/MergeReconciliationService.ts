/**
 * MergeReconciliationService
 *
 * Handles detection of merged scenes and transfer of user activity data
 * from orphaned scenes to their merge targets.
 *
 * Everything works on (id, instance): a scene id means nothing without its
 * Stash instance, and a merge never crosses instances. A merged scene's
 * target is a live scene of the same instance with the same phash.
 */
import type { Prisma } from "@prisma/client";
import prisma from "../prisma/singleton.js";
import { dbWriteBatch, dbWriteTransaction } from "../utils/dbWrite.js";
import { logger } from "../utils/logger.js";
import { stashInstanceManager } from "./StashInstanceManager.js";

/**
 * Merge two JSON arrays (for oHistory and playHistory).
 * Deduplicates by stringified value and sorts. Returns the array itself, for
 * the Json column; either input may be a JSON-encoded string.
 */
function mergeJsonArrays(arr1: unknown, arr2: unknown): Prisma.InputJsonValue {
  const list1 = parseJsonArray(arr1);
  const list2 = parseJsonArray(arr2);
  const merged = [...list1, ...list2];
  // Deduplicate by stringified value
  const seen = new Set<string>();
  const deduped = merged.filter((item) => {
    const key = JSON.stringify(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Sort by timestamp/startTime if present
  deduped.sort((a, b) => {
    const aRec =
      typeof a === "string" ? null : (a as Record<string, string | undefined>);
    const bRec =
      typeof b === "string" ? null : (b as Record<string, string | undefined>);
    const aTime =
      typeof a === "string" ? a : (aRec?.startTime ?? aRec?.time ?? "");
    const bTime =
      typeof b === "string" ? b : (bRec?.startTime ?? bRec?.time ?? "");
    return aTime.localeCompare(bTime);
  });
  return deduped as Prisma.InputJsonValue;
}

function parseJsonArray(value: unknown): unknown[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as unknown[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function laterDate(d1: Date | null, d2: Date | null): Date | null {
  if (!d1) return d2;
  if (!d2) return d1;
  return d1 > d2 ? d1 : d2;
}

/** A scene on one Stash instance */
export interface SceneRef {
  id: string;
  instanceId: string;
}

/**
 * A reconcile target that is not a live scene on the source's instance (or
 * is the source itself). The routes answer it with 400.
 */
export class MergeTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MergeTargetError";
  }
}

/** How far back each scene cleanup looks for deletions left unreconciled */
export const MERGE_CATCH_UP_MS = 24 * 60 * 60 * 1000;

/** The instance's name for the admin's Merge Recovery tab (no URL) */
function instanceName(instanceId: string): string {
  return stashInstanceManager.getConfig(instanceId)?.name ?? instanceId;
}

/** "5:default", for log lines */
function refLabel(scene: SceneRef): string {
  return `${scene.id}:${scene.instanceId}`;
}

export interface OrphanedSceneInfo {
  id: string;
  instanceId: string;
  instanceName: string;
  title: string | null;
  phash: string | null;
  deletedAt: Date;
  userActivityCount: number;
  totalPlayCount: number;
  hasRatings: boolean;
  hasFavorites: boolean;
}

export interface PhashMatch {
  sceneId: string;
  instanceId: string;
  instanceName: string;
  title: string | null;
  similarity: "exact" | "similar";
  recommended: boolean;
}

export interface ReconcileResult {
  sourceSceneId: string;
  targetSceneId: string;
  usersReconciled: number;
  mergeRecordsCreated: number;
}

class MergeReconciliationService {
  /**
   * Find all soft-deleted scenes that have orphaned user activity data: a
   * play history or a rating on that scene of that instance.
   */
  async findOrphanedScenesWithActivity(): Promise<OrphanedSceneInfo[]> {
    const orphans = await prisma.$queryRaw<
      Array<{
        id: string;
        stashInstanceId: string;
        title: string | null;
        phash: string | null;
        deletedAt: Date;
        // COUNT and SUM of integers come back as bigint
        watchHistoryCount: bigint;
        totalPlayCount: bigint;
        ratingCount: bigint;
        favoriteCount: bigint;
      }>
    >`
      SELECT
        s.id,
        s.stashInstanceId,
        s.title,
        s.phash,
        s.deletedAt,
        COALESCE(wh.watchHistoryCount, 0) as watchHistoryCount,
        COALESCE(wh.totalPlayCount, 0) as totalPlayCount,
        COALESCE(r.ratingCount, 0) as ratingCount,
        COALESCE(r.favoriteCount, 0) as favoriteCount
      FROM StashScene s
      LEFT JOIN (
        SELECT sceneId, instanceId, COUNT(*) as watchHistoryCount, SUM(playCount) as totalPlayCount
        FROM WatchHistory
        GROUP BY sceneId, instanceId
      ) wh ON wh.sceneId = s.id AND wh.instanceId = s.stashInstanceId
      LEFT JOIN (
        SELECT sceneId, instanceId, COUNT(*) as ratingCount, SUM(CASE WHEN favorite = 1 THEN 1 ELSE 0 END) as favoriteCount
        FROM SceneRating
        GROUP BY sceneId, instanceId
      ) r ON r.sceneId = s.id AND r.instanceId = s.stashInstanceId
      WHERE s.deletedAt IS NOT NULL
        AND (wh.watchHistoryCount > 0 OR r.ratingCount > 0)
      ORDER BY s.deletedAt DESC
    `;

    return orphans.map((o) => ({
      id: o.id,
      instanceId: o.stashInstanceId,
      instanceName: instanceName(o.stashInstanceId),
      title: o.title,
      phash: o.phash,
      deletedAt: o.deletedAt,
      userActivityCount: Number(o.watchHistoryCount) + Number(o.ratingCount),
      totalPlayCount: Number(o.totalPlayCount),
      hasRatings: Number(o.ratingCount) > 0,
      hasFavorites: Number(o.favoriteCount) > 0,
    }));
  }

  /**
   * Live scenes of the same instance sharing a phash with the scene, the
   * most recently updated first. Deleted scenes are never candidates, so
   * scenes that left Stash together (soft-deleted before this runs) are
   * never each other's target.
   */
  async findPhashMatches(scene: SceneRef): Promise<PhashMatch[]> {
    const source = await prisma.stashScene.findUnique({
      where: {
        id_stashInstanceId: { id: scene.id, stashInstanceId: scene.instanceId },
      },
      select: { phash: true, phashes: true },
    });

    if (!source?.phash) {
      return [];
    }

    // Get all phashes for this scene
    const scenePhashes: string[] = [source.phash];
    if (source.phashes) {
      try {
        const parsed: unknown = JSON.parse(source.phashes);
        if (Array.isArray(parsed)) {
          scenePhashes.push(
            ...(parsed as string[]).filter((p: string) => p !== source.phash)
          );
        }
      } catch {
        // Invalid JSON, ignore
      }
    }

    const matches = await prisma.stashScene.findMany({
      where: {
        stashInstanceId: scene.instanceId,
        deletedAt: null,
        NOT: { id: scene.id },
        OR: [
          { phash: { in: scenePhashes } },
          // Also check if any of our phashes appear in their phashes array
          // This is a simple string contains check for SQLite
          ...scenePhashes.map((ph) => ({ phashes: { contains: ph } })),
        ],
      },
      select: {
        id: true,
        title: true,
      },
      orderBy: { stashUpdatedAt: "desc" },
    });

    const name = instanceName(scene.instanceId);
    return matches.map((m, index) => ({
      sceneId: m.id,
      instanceId: scene.instanceId,
      instanceName: name,
      title: m.title,
      similarity: "exact" as const,
      recommended: index === 0, // Recommend the most recently updated
    }));
  }

  /**
   * Transfer one user's activity from source scene to target scene (both on
   * one instance): play history, rating and favorite, and the user's
   * playlist entries. Creates a MergeRecord for audit. All of it is one
   * transaction, so a write to the target that arrives meanwhile waits for
   * the merge and is not overwritten by it, and a crash leaves the user's
   * data either all on the source or all on the target.
   */
  async transferUserData(
    source: SceneRef,
    target: SceneRef,
    userId: number,
    matchedByPhash: string | null,
    reconciledBy: number | null
  ): Promise<{ success: boolean; mergeRecordId?: string }> {
    const sourceKey = {
      userId_instanceId_sceneId: {
        userId,
        instanceId: source.instanceId,
        sceneId: source.id,
      },
    };
    const targetKey = {
      userId_instanceId_sceneId: {
        userId,
        instanceId: target.instanceId,
        sceneId: target.id,
      },
    };

    const result = await dbWriteTransaction(
      "history.merge",
      async (
        tx
      ): Promise<
        | { success: false }
        | { success: true; mergeRecordId: string; playlistItems: number }
      > => {
        const sourceHistory = await tx.watchHistory.findUnique({
          where: sourceKey,
        });
        const sourceRating = await tx.sceneRating.findUnique({
          where: sourceKey,
        });
        const playlistItems = await tx.playlistItem.findMany({
          where: {
            sceneId: source.id,
            instanceId: source.instanceId,
            playlist: { userId },
          },
          select: { id: true, playlistId: true },
        });

        if (!sourceHistory && !sourceRating && playlistItems.length === 0) {
          return { success: false }; // Nothing to transfer
        }

        if (sourceHistory) {
          const targetHistory = await tx.watchHistory.findUnique({
            where: targetKey,
          });

          if (targetHistory) {
            // Merge with existing
            await tx.watchHistory.update({
              where: targetKey,
              data: {
                playCount: targetHistory.playCount + sourceHistory.playCount,
                playDuration:
                  targetHistory.playDuration + sourceHistory.playDuration,
                oCount: targetHistory.oCount + sourceHistory.oCount,
                oHistory: mergeJsonArrays(
                  targetHistory.oHistory,
                  sourceHistory.oHistory
                ),
                playHistory: mergeJsonArrays(
                  targetHistory.playHistory,
                  sourceHistory.playHistory
                ),
                lastPlayedAt: laterDate(
                  targetHistory.lastPlayedAt,
                  sourceHistory.lastPlayedAt
                ),
                // resumeTime: keep target's (survivor wins)
              },
            });
          } else {
            // Create new record for target; a JSON-encoded source history
            // lands as an array
            await tx.watchHistory.create({
              data: {
                userId,
                instanceId: target.instanceId,
                sceneId: target.id,
                playCount: sourceHistory.playCount,
                playDuration: sourceHistory.playDuration,
                resumeTime: sourceHistory.resumeTime,
                lastPlayedAt: sourceHistory.lastPlayedAt,
                oCount: sourceHistory.oCount,
                oHistory: parseJsonArray(
                  sourceHistory.oHistory
                ) as Prisma.InputJsonValue,
                playHistory: parseJsonArray(
                  sourceHistory.playHistory
                ) as Prisma.InputJsonValue,
              },
            });
          }
        }

        if (sourceRating) {
          const targetRating = await tx.sceneRating.findUnique({
            where: targetKey,
          });

          if (targetRating) {
            // Merge: survivor wins for rating, OR for favorite
            await tx.sceneRating.update({
              where: targetKey,
              data: {
                rating: targetRating.rating ?? sourceRating.rating,
                favorite: targetRating.favorite || sourceRating.favorite,
              },
            });
          } else {
            await tx.sceneRating.create({
              data: {
                userId,
                instanceId: target.instanceId,
                sceneId: target.id,
                rating: sourceRating.rating,
                favorite: sourceRating.favorite,
              },
            });
          }
        }

        for (const item of playlistItems) {
          // Check if target scene already exists in this playlist
          const existing = await tx.playlistItem.findFirst({
            where: {
              playlistId: item.playlistId,
              sceneId: target.id,
              instanceId: target.instanceId,
            },
            select: { id: true },
          });

          if (existing) {
            // The target is already in the playlist: drop the orphaned entry
            await tx.playlistItem.delete({ where: { id: item.id } });
            logger.debug(
              `Deleted duplicate playlist item ${item.id} (target scene ${refLabel(target)} already in playlist ${item.playlistId})`
            );
          } else {
            await tx.playlistItem.update({
              where: { id: item.id },
              data: { sceneId: target.id, instanceId: target.instanceId },
            });
            logger.debug(
              `Updated playlist item ${item.id} to point to target scene ${refLabel(target)}`
            );
          }
        }

        // Create audit record
        const mergeRecord = await tx.mergeRecord.create({
          data: {
            sourceSceneId: source.id,
            sourceInstanceId: source.instanceId,
            targetSceneId: target.id,
            targetInstanceId: target.instanceId,
            matchedByPhash,
            userId,
            playCountTransferred: sourceHistory?.playCount ?? 0,
            playDurationTransferred: sourceHistory?.playDuration ?? 0,
            oCountTransferred: sourceHistory?.oCount ?? 0,
            ratingTransferred: sourceRating?.rating,
            favoriteTransferred: sourceRating?.favorite ?? false,
            reconciledBy,
            automatic: reconciledBy === null,
          },
        });

        // Delete source records after the transfer
        if (sourceHistory) {
          await tx.watchHistory.delete({ where: sourceKey });
        }
        if (sourceRating) {
          await tx.sceneRating.delete({ where: sourceKey });
        }

        return {
          success: true,
          mergeRecordId: mergeRecord.id,
          playlistItems: playlistItems.length,
        };
      }
    );

    if (!result.success) return { success: false };
    logger.info(
      `Transferred user data from scene ${refLabel(source)} to ${refLabel(target)} for user ${userId}` +
        (result.playlistItems
          ? ` (${result.playlistItems} playlist items)`
          : "")
    );
    return { success: true, mergeRecordId: result.mergeRecordId };
  }

  /**
   * Reconcile all user data for a source scene to a target scene on the
   * same instance: every user with a play history, a rating or a playlist
   * entry on the source. Throws MergeTargetError unless the target is a
   * live scene of the source's instance other than the source.
   */
  async reconcileScene(
    source: SceneRef,
    target: SceneRef,
    matchedByPhash: string | null,
    reconciledBy: number | null
  ): Promise<ReconcileResult> {
    if (source.instanceId !== target.instanceId) {
      throw new MergeTargetError(
        `Scene ${target.id} is on another instance than scene ${source.id}`
      );
    }
    if (source.id === target.id) {
      throw new MergeTargetError(`Scene ${source.id} cannot merge into itself`);
    }
    const targetRow = await prisma.stashScene.findUnique({
      where: {
        id_stashInstanceId: {
          id: target.id,
          stashInstanceId: target.instanceId,
        },
      },
      select: { deletedAt: true },
    });
    if (!targetRow || targetRow.deletedAt !== null) {
      throw new MergeTargetError(
        `Scene ${target.id} is not a live scene on ${instanceName(target.instanceId)}`
      );
    }

    const onSource = { sceneId: source.id, instanceId: source.instanceId };
    const [histories, ratings, playlistItems] = await Promise.all([
      prisma.watchHistory.findMany({
        where: onSource,
        select: { userId: true },
      }),
      prisma.sceneRating.findMany({
        where: onSource,
        select: { userId: true },
      }),
      prisma.playlistItem.findMany({
        where: onSource,
        select: { playlist: { select: { userId: true } } },
      }),
    ]);

    const userIds = [
      ...new Set([
        ...histories.map((h) => h.userId),
        ...ratings.map((r) => r.userId),
        ...playlistItems.map((i) => i.playlist.userId),
      ]),
    ];

    let mergeRecordsCreated = 0;

    for (const userId of userIds) {
      const result = await this.transferUserData(
        source,
        target,
        userId,
        matchedByPhash,
        reconciledBy
      );
      if (result.success) {
        mergeRecordsCreated++;
      }
    }

    logger.info(
      `Reconciled ${mergeRecordsCreated} users from scene ${refLabel(source)} to ${refLabel(target)}`
    );

    return {
      sourceSceneId: source.id,
      targetSceneId: target.id,
      usersReconciled: userIds.length,
      mergeRecordsCreated,
    };
  }

  /**
   * The automatic merge, after sync's cleanup soft-deleted `scenes` of the
   * instance. Only scenes with a phash and some user's activity there (a
   * play history, a rating or a playlist entry, found in one query) are
   * looked at; each merges when exactly one live scene of the instance
   * shares its phash. With several, it waits in Merge Recovery for an
   * admin. A scene that fails is logged and the rest go on; the next
   * cleanup's catch-up retries it.
   */
  async reconcileDeletedScenes(
    instanceId: string,
    scenes: Array<{ id: string; phash: string | null }>
  ): Promise<{ merged: number; ambiguous: number }> {
    const phashById = new Map<string, string>();
    for (const scene of scenes) {
      if (scene.phash) phashById.set(scene.id, scene.phash);
    }
    if (phashById.size === 0) return { merged: 0, ambiguous: 0 };

    const withActivity = await prisma.$queryRawUnsafe<
      Array<{ sceneId: string }>
    >(
      `WITH ids(id) AS (SELECT value FROM json_each(?))
       SELECT sceneId FROM WatchHistory
         WHERE instanceId = ? AND sceneId IN (SELECT id FROM ids)
       UNION
       SELECT sceneId FROM SceneRating
         WHERE instanceId = ? AND sceneId IN (SELECT id FROM ids)
       UNION
       SELECT sceneId FROM PlaylistItem
         WHERE instanceId = ? AND sceneId IN (SELECT id FROM ids)`,
      JSON.stringify([...phashById.keys()]),
      instanceId,
      instanceId,
      instanceId
    );

    let merged = 0;
    let ambiguous = 0;
    for (const { sceneId } of withActivity) {
      const source = { id: sceneId, instanceId };
      try {
        const matches = await this.findPhashMatches(source);
        const [only] = matches;
        if (matches.length === 1 && only) {
          const target = { id: only.sceneId, instanceId };
          logger.info(
            `Detected merge: scene ${refLabel(source)} -> ${refLabel(target)}`
          );
          await this.reconcileScene(
            source,
            target,
            phashById.get(sceneId) ?? null,
            null
          );
          merged++;
        } else if (matches.length > 1) {
          logger.info(
            `Scene ${refLabel(source)} has ${matches.length} phash matches: ambiguous, left for Merge Recovery`
          );
          ambiguous++;
        }
      } catch (error) {
        logger.error(
          `Merge reconciliation failed for scene ${refLabel(source)}`,
          {
            error: error instanceof Error ? error.message : String(error),
          }
        );
      }
    }

    return { merged, ambiguous };
  }

  /**
   * The catch-up for a cleanup that stopped between its soft-delete and its
   * reconcile: runs `reconcileDeletedScenes` over the instance's scenes
   * soft-deleted in the last MERGE_CATCH_UP_MS that no merge record names
   * as source. Idempotent: a merged scene has a record, and an ambiguous
   * one is only looked at again.
   */
  async reconcileRecentDeletions(
    instanceId: string
  ): Promise<{ merged: number; ambiguous: number }> {
    const scenes = await prisma.$queryRawUnsafe<
      Array<{ id: string; phash: string | null }>
    >(
      `SELECT s.id, s.phash FROM StashScene s
       WHERE s.stashInstanceId = ?
         AND s.deletedAt >= ?
         AND s.phash IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM MergeRecord m
           WHERE m.sourceSceneId = s.id AND m.sourceInstanceId = s.stashInstanceId
         )`,
      instanceId,
      // Prisma stores DateTime in SQLite as epoch milliseconds
      Date.now() - MERGE_CATCH_UP_MS
    );
    return this.reconcileDeletedScenes(instanceId, scenes);
  }

  /**
   * Discard orphaned user data for a scene of one instance (delete its
   * WatchHistory and SceneRating rows).
   */
  async discardOrphanedData(
    scene: SceneRef
  ): Promise<{ watchHistoryDeleted: number; ratingsDeleted: number }> {
    const where = { sceneId: scene.id, instanceId: scene.instanceId };
    const [watchHistoryResult, ratingsResult] = await dbWriteBatch(
      "history.discard",
      [
        prisma.watchHistory.deleteMany({ where }),
        prisma.sceneRating.deleteMany({ where }),
      ]
    );

    logger.info(
      `Discarded orphaned data for scene ${refLabel(scene)}: ${watchHistoryResult.count} watch history, ${ratingsResult.count} ratings`
    );

    return {
      watchHistoryDeleted: watchHistoryResult.count,
      ratingsDeleted: ratingsResult.count,
    };
  }
}

export const mergeReconciliationService = new MergeReconciliationService();
