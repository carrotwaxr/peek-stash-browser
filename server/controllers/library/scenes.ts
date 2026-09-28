import { coerceEntityRefs } from "@peek/shared-types/instanceAwareId.js";
import prisma from "../../prisma/singleton.js";
import { resolveAccessibleInstanceId } from "../../services/EntityAccessService.js";
import { entityExclusionHelper } from "../../services/EntityExclusionHelper.js";
import rankingComputeService from "../../services/RankingComputeService.js";
import {
  type EntityRankingData,
  type LightweightEntityPreferences,
  type SceneRatingInput,
  buildDerivedWeightsFromScoringData,
  buildImplicitWeightsFromRankings,
  countUserCriteria,
  diversifyByScoreTier,
  hasAnyCriteria,
  scoreScoringDataByPreferences,
} from "../../services/RecommendationScoringService.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import { stashEntityService } from "../../services/StashEntityService.js";
import { getUserAllowedInstanceIds } from "../../services/UserInstanceService.js";
import type {
  AmbiguousLookupResponse,
  ApiErrorResponse,
  FindScenesRequest,
  FindScenesResponse,
  FindSimilarScenesParams,
  FindSimilarScenesQuery,
  FindSimilarScenesResponse,
  GetRecommendedScenesQuery,
  GetRecommendedScenesResponse,
  ScoredSceneId,
  TypedAuthRequest,
  TypedResponse,
  WithStashUrl,
} from "../../types/api/index.js";
import type { NormalizedScene, PeekSceneFilter } from "../../types/index.js";
import { isSceneStreamable } from "../../utils/codecDetection.js";
import { type EntityRef, entityKey } from "../../utils/entityRef.js";
import { readHistory } from "../../utils/historyJson.js";
import { logger } from "../../utils/logger.js";
import {
  SeededRandom,
  generateDailySeed,
  parseRandomSort,
} from "../../utils/seededRandom.js";
import { emptyToNull } from "../../utils/sqlHelpers.js";
import { buildStashEntityUrl } from "../../utils/stashUrl.js";

/**
 * Merge user-specific data into scenes
 *
 * PERFORMANCE: When fetching data for a small number of scenes (< 100),
 * we filter by sceneId to avoid loading entire watch history tables.
 * For larger sets, we load all data and use Map lookups for efficiency.
 */
export async function mergeScenesWithUserData(
  scenes: NormalizedScene[],
  userId: number
): Promise<NormalizedScene[]> {
  // Extract scene IDs for targeted queries when dealing with small sets
  const sceneIds = scenes.map((s) => s.id);
  const useTargetedQuery = sceneIds.length < 100;

  // Fetch user data in parallel
  // For small scene sets, filter by sceneId to avoid loading full tables
  const [
    watchHistory,
    sceneRatings,
    performerRatings,
    studioRatings,
    tagRatings,
  ] = await Promise.all([
    prisma.watchHistory.findMany({
      where: useTargetedQuery
        ? { userId, sceneId: { in: sceneIds } }
        : { userId },
    }),
    prisma.sceneRating.findMany({
      where: useTargetedQuery
        ? { userId, sceneId: { in: sceneIds } }
        : { userId },
    }),
    // Performer/studio/tag ratings are kept as full loads since they're
    // used for nested entity favorites across all scenes
    prisma.performerRating.findMany({ where: { userId } }),
    prisma.studioRating.findMany({ where: { userId } }),
    prisma.tagRating.findMany({ where: { userId } }),
  ]);

  // Keys carry the instance (entityKey) for multi-instance correctness
  // Create lookup maps for O(1) access
  const watchMap = new Map(
    watchHistory.map((wh) => {
      const oHistory = readHistory(wh.oHistory);
      const playHistory = readHistory(wh.playHistory);

      return [
        entityKey(wh.sceneId, wh.instanceId ?? ""),
        {
          o_counter: wh.oCount || 0,
          play_count: wh.playCount || 0,
          play_duration: wh.playDuration || 0,
          resume_time: wh.resumeTime || 0,
          play_history: playHistory,
          // The stored ISO strings, which the response has always carried
          o_history: oHistory,
          last_played_at:
            playHistory.length > 0
              ? (playHistory[playHistory.length - 1] ?? null)
              : null,
          last_o_at:
            oHistory.length > 0
              ? (oHistory[oHistory.length - 1] ?? null)
              : null,
        },
      ];
    })
  );

  const ratingMap = new Map(
    sceneRatings.map((r) => [
      entityKey(r.sceneId, r.instanceId ?? ""),
      {
        rating: r.rating,
        rating100: r.rating, // Alias for consistency with Stash API
        favorite: r.favorite,
      },
    ])
  );

  // Create favorite lookup sets for nested entities (composite key: entityId + instanceId)
  const performerFavorites = new Set(
    performerRatings
      .filter((r) => r.favorite)
      .map((r) => entityKey(r.performerId, r.instanceId ?? ""))
  );
  const studioFavorites = new Set(
    studioRatings
      .filter((r) => r.favorite)
      .map((r) => entityKey(r.studioId, r.instanceId ?? ""))
  );
  const tagFavorites = new Set(
    tagRatings
      .filter((r) => r.favorite)
      .map((r) => entityKey(r.tagId, r.instanceId ?? ""))
  );

  // Merge data and update nested entity favorites
  return scenes.map((scene) => {
    const sceneKey = entityKey(scene.id, scene.instanceId);
    const mergedScene = {
      ...scene,
      ...watchMap.get(sceneKey),
      ...ratingMap.get(sceneKey),
    };

    // Update favorite status for nested performers
    if (mergedScene.performers && Array.isArray(mergedScene.performers)) {
      mergedScene.performers = mergedScene.performers.map((p) => ({
        ...p,
        favorite: performerFavorites.has(entityKey(p.id, p.instanceId)),
      }));
    }

    // Update favorite status for studio
    if (mergedScene.studio) {
      mergedScene.studio = {
        ...mergedScene.studio,
        favorite: studioFavorites.has(
          entityKey(mergedScene.studio.id, mergedScene.studio.instanceId ?? "")
        ),
      };
    }

    // Update favorite status for nested tags
    if (mergedScene.tags && Array.isArray(mergedScene.tags)) {
      mergedScene.tags = mergedScene.tags.map((t) => ({
        ...t,
        favorite: tagFavorites.has(entityKey(t.id, t.instanceId)),
      }));
    }

    return mergedScene;
  });
}

/**
 * Add streamability information to scenes
 * This adds codec detection metadata to determine if scenes can be directly played
 * in browsers without transcoding, and the View in Stash link, which only an
 * admin viewer gets
 */
export function addStreamabilityInfo(
  scenes: NormalizedScene[],
  viewer: { role: string } | undefined
): WithStashUrl<NormalizedScene>[] {
  return scenes.map((scene) => {
    const streamabilityInfo = isSceneStreamable(scene);
    const stashUrl = buildStashEntityUrl(
      "scene",
      scene.id,
      scene.instanceId,
      viewer
    );

    return {
      ...scene,
      isStreamable: streamabilityInfo.isStreamable,
      streamabilityReasons: streamabilityInfo.reasons,
      stashUrl,
    };
  });
}

/**
 * Lists scenes through SceneQueryBuilder: filters, sort and paging run in SQL
 */
export const findScenes = async (
  req: TypedAuthRequest<FindScenesRequest>,
  res: TypedResponse<
    FindScenesResponse | ApiErrorResponse | AmbiguousLookupResponse
  >
) => {
  const requestStart = Date.now();
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { filter, scene_filter, ids } = req.body;

    const sortFieldRaw = filter?.sort || "created_at";
    const sortDirection = filter?.direction || "DESC";
    const page = filter?.page || 1;
    const perPage = filter?.per_page || 40;
    const searchQuery = filter?.q || "";

    // Parse random sort with seed
    const { sortField, randomSeed } = parseRandomSort(sortFieldRaw, userId);

    // Get user's allowed instance IDs for multi-instance filtering
    const allowedInstanceIds = await getUserAllowedInstanceIds(userId);

    // Build filters object. The builder reads the filter as sent, as before:
    // PeekSceneFilter types its criteria as Stash's, which always name a
    // modifier, where a request may omit it
    const filters = { ...scene_filter } as PeekSceneFilter;
    if (ids && ids.length > 0) {
      filters.ids = { value: coerceEntityRefs(ids), modifier: "INCLUDES" };
    }

    // Extract specific instance ID for disambiguation (from scene_filter.instance_id)
    const specificInstanceId = scene_filter?.instance_id;

    // Execute query (applyExclusions defaults to true)
    const result = await sceneQueryBuilder.execute({
      userId,
      filters,
      allowedInstanceIds,
      specificInstanceId,
      sort: sortField,
      sortDirection: sortDirection.toUpperCase() as "ASC" | "DESC",
      page,
      perPage,
      randomSeed: sortField === "random" ? randomSeed : userId,
      searchQuery: searchQuery || undefined,
    });

    // Check for ambiguous results on single-ID lookups
    // This happens when the same ID exists in multiple Stash instances
    if (
      ids &&
      ids.length === 1 &&
      !specificInstanceId &&
      result.scenes.length > 1
    ) {
      logger.warn("Ambiguous scene lookup", {
        id: ids[0],
        matchCount: result.scenes.length,
        instances: result.scenes.map((s) => s.instanceId),
      });
      res.status(400).json({
        error: "Ambiguous lookup",
        message: `Multiple scenes found with ID ${ids[0]}. Specify instance_id parameter.`,
        matches: result.scenes.map((s) => ({
          id: s.id,
          title: s.title,
          instanceId: s.instanceId,
        })),
      });
      return;
    }

    // Add streamability info
    let scenes = addStreamabilityInfo(result.scenes, req.user);

    // The Scene page loads one scene by id: only then build its stream
    // list. Lists keep sceneStreams empty.
    if (ids?.length === 1) {
      scenes = await Promise.all(
        scenes.map(async (s) => ({
          ...s,
          sceneStreams: await stashEntityService.getPlaybackStreams(
            s.id,
            s.instanceId
          ),
        }))
      );
    }

    logger.debug("findScenes complete (SQL path)", {
      totalTimeMs: Date.now() - requestStart,
      resultCount: scenes.length,
      total: result.total,
    });

    res.json({
      findScenes: {
        count: result.total,
        scenes,
      },
    });
  } catch (error) {
    logger.error("Error in findScenes", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      error: "Failed to find scenes",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * "Scenes like this": scenes on the seed's instance sharing its performers
 * (3 points each), studio (2) or tags (1 each), most shared first.
 *
 * The seed is resolved through the user's own access check (404 when it is
 * hidden, restricted, deleted or on an instance the user doesn't see), the
 * candidates come from one SQL query with the exclusion anti-join (at most
 * 500), and the requested page is fetched by (id, instance) refs through the
 * scene builder, which applies the exclusions and allowed instances again.
 */
export const findSimilarScenes = async (
  req: TypedAuthRequest<
    unknown,
    FindSimilarScenesParams,
    FindSimilarScenesQuery
  >,
  res: TypedResponse<FindSimilarScenesResponse | ApiErrorResponse>
) => {
  const startTime = Date.now();
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page ?? "") || 1;
    const perPage = 12;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: "User not authenticated" });
      return;
    }

    const instanceId = await resolveAccessibleInstanceId(
      userId,
      "scene",
      id,
      emptyToNull(req.query.instanceId) ?? undefined
    );
    if (!instanceId) {
      res.status(404).json({ error: "Scene not found" });
      return;
    }

    const candidates = await stashEntityService.getSimilarSceneCandidates(
      { id, instanceId },
      userId,
      500
    );

    // The page's refs, in candidate order (weight desc, date desc from SQL)
    const startIndex = (page - 1) * perPage;
    const pageRefs: EntityRef[] = candidates
      .slice(startIndex, startIndex + perPage)
      .map((c) => ({ id: c.sceneId, instanceId: c.instanceId }));

    if (pageRefs.length === 0) {
      res.json({ scenes: [], count: candidates.length, page, perPage });
      return;
    }

    const allowedInstanceIds = await getUserAllowedInstanceIds(userId);
    const { scenes } = await sceneQueryBuilder.getByRefs({
      userId,
      refs: pageRefs,
      allowedInstanceIds,
    });

    // Back into candidate order, each scene by its (id, instance)
    const sceneByKey = new Map(
      scenes.map((s) => [entityKey(s.id, s.instanceId), s])
    );
    const orderedScenes = pageRefs
      .map((ref) => sceneByKey.get(entityKey(ref.id, ref.instanceId)))
      .filter((s): s is NormalizedScene => s !== undefined);

    logger.debug("findSimilarScenes completed", {
      totalTime: `${Date.now() - startTime}ms`,
      sceneId: id,
      instanceId,
      candidateCount: candidates.length,
      resultCount: orderedScenes.length,
      page,
    });

    res.json({
      scenes: orderedScenes,
      count: candidates.length,
      page,
      perPage,
    });
  } catch (error) {
    logger.error("Error finding similar scenes:", { error: error as Error });
    res.status(500).json({ error: "Failed to find similar scenes" });
  }
};

/**
 * Get recommended scenes based on user preferences and watch history
 * Uses favorites, ratings (80+), watch status, and engagement quality
 *
 * Two-phase query architecture:
 * 1. Lightweight scoring: Score all scenes using IDs only (SceneScoringData)
 * 2. Full fetch: Get complete scene data for paginated results via SceneQueryBuilder
 */
export const getRecommendedScenes = async (
  req: TypedAuthRequest<
    unknown,
    Record<string, string>,
    GetRecommendedScenesQuery
  >,
  res: TypedResponse<GetRecommendedScenesResponse | ApiErrorResponse>
) => {
  const startTime = Date.now();
  try {
    const page = parseInt(req.query.page as string) || 1;
    const perPage = parseInt(req.query.per_page as string) || 24;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: "User not authenticated" });
      return;
    }

    // Fetch user ratings, watch history, engagement rankings, and lightweight scoring data in parallel
    const [
      performerRatings,
      studioRatings,
      tagRatings,
      sceneRatings,
      watchHistory,
      allScoringData,
      exclusionData,
      engagementRankings,
    ] = await Promise.all([
      prisma.performerRating.findMany({ where: { userId } }),
      prisma.studioRating.findMany({ where: { userId } }),
      prisma.tagRating.findMany({ where: { userId } }),
      prisma.sceneRating.findMany({ where: { userId } }),
      prisma.watchHistory.findMany({ where: { userId } }),
      stashEntityService.getScenesForScoring(),
      entityExclusionHelper.getExclusionData(userId, "scene"),
      // Fetch implicit engagement signals from pre-computed rankings
      prisma.userEntityRanking.findMany({
        where: { userId, entityType: { in: ["performer", "studio", "tag"] } },
        select: {
          entityId: true,
          entityType: true,
          engagementRate: true,
          percentileRank: true,
        },
      }),
    ]);

    // Rankings over an hour old are recomputed in the background; this
    // request scores with the ones stored
    void rankingComputeService.ensureFresh(userId);

    // Build sets of favorite and highly-rated entities using composite keys (id + instanceId)
    // to prevent cross-instance favorites from influencing recommendations for the wrong instance
    const favoritePerformers = new Set(
      performerRatings
        .filter((r) => r.favorite)
        .map((r) => entityKey(r.performerId, r.instanceId ?? ""))
    );
    const highlyRatedPerformers = new Set(
      performerRatings
        .filter((r) => r.rating !== null && r.rating >= 80)
        .map((r) => entityKey(r.performerId, r.instanceId ?? ""))
    );
    const favoriteStudios = new Set(
      studioRatings
        .filter((r) => r.favorite)
        .map((r) => entityKey(r.studioId, r.instanceId ?? ""))
    );
    const highlyRatedStudios = new Set(
      studioRatings
        .filter((r) => r.rating !== null && r.rating >= 80)
        .map((r) => entityKey(r.studioId, r.instanceId ?? ""))
    );
    const favoriteTags = new Set(
      tagRatings
        .filter((r) => r.favorite)
        .map((r) => entityKey(r.tagId, r.instanceId ?? ""))
    );
    const highlyRatedTags = new Set(
      tagRatings
        .filter((r) => r.rating !== null && r.rating >= 80)
        .map((r) => entityKey(r.tagId, r.instanceId ?? ""))
    );

    // Count user criteria for feedback
    const criteriaCounts = countUserCriteria(
      performerRatings,
      studioRatings,
      tagRatings,
      sceneRatings
    );

    // Check if user has any criteria (now includes scenes)
    if (!hasAnyCriteria(criteriaCounts)) {
      res.json({
        scenes: [],
        count: 0,
        page,
        perPage,
        message: "No recommendations yet",
        criteria: criteriaCounts,
      });
      return;
    }

    // Build watch history map
    const watchMap = new Map(
      watchHistory.map((wh) => {
        const playHistory = readHistory(wh.playHistory);
        const lastEntry = playHistory[playHistory.length - 1];
        const lastPlayedAt = lastEntry != null ? new Date(lastEntry) : null;

        return [
          wh.sceneId,
          {
            playCount: wh.playCount || 0,
            lastPlayedAt,
          },
        ];
      })
    );

    // Filter excluded scenes from scoring data (instance-aware)
    const scoringData = allScoringData.filter(
      (s) =>
        !entityExclusionHelper.isExcluded(s.id, s.instanceId, exclusionData)
    );

    // Build derived weights from rated/favorited scenes using lightweight data
    const sceneRatingsForDerived: SceneRatingInput[] = sceneRatings.map(
      (r) => ({
        sceneId: r.sceneId,
        rating: r.rating,
        favorite: r.favorite,
      })
    );

    const scoringDataMap = new Map(scoringData.map((s) => [s.id, s]));
    const getScoringDataById = (id: string) => scoringDataMap.get(id);

    const { derivedPerformerWeights, derivedStudioWeights, derivedTagWeights } =
      buildDerivedWeightsFromScoringData(
        sceneRatingsForDerived,
        getScoringDataById
      );

    // Build implicit weights from engagement rankings (top 50% by percentile)
    const rankingData: EntityRankingData[] = engagementRankings.map((r) => ({
      entityId: r.entityId,
      entityType: r.entityType,
      engagementRate: r.engagementRate,
      percentileRank: r.percentileRank,
    }));

    const {
      implicitPerformerWeights,
      implicitStudioWeights,
      implicitTagWeights,
    } = buildImplicitWeightsFromRankings(rankingData, 50);

    // Build entity preferences object
    const prefs: LightweightEntityPreferences = {
      favoritePerformers,
      highlyRatedPerformers,
      favoriteStudios,
      highlyRatedStudios,
      favoriteTags,
      highlyRatedTags,
      derivedPerformerWeights,
      derivedStudioWeights,
      derivedTagWeights,
      implicitPerformerWeights,
      implicitStudioWeights,
      implicitTagWeights,
    };

    // Phase 1: Score all scenes using lightweight data
    const scoredScenes: ScoredSceneId[] = [];
    const now = new Date();

    for (const data of scoringData) {
      const baseScore = scoreScoringDataByPreferences(data, prefs);

      // Skip if no base score (doesn't match any criteria)
      if (baseScore === 0) continue;

      // Watch status modifier (reduced dominance: was +100/-100, now +30/-30)
      let adjustedScore = baseScore;
      const watchData = watchMap.get(data.id);
      if (!watchData || watchData.playCount === 0) {
        // Never watched
        adjustedScore += 30;
      } else if (watchData.lastPlayedAt) {
        const daysSinceWatched =
          (now.getTime() - watchData.lastPlayedAt.getTime()) /
          (24 * 60 * 60 * 1000);

        if (daysSinceWatched > 14) {
          // Not recently watched
          adjustedScore += 20;
        } else if (daysSinceWatched >= 1) {
          // Recently watched (1-14 days)
          adjustedScore -= 10;
        } else {
          // Very recently watched (<24 hours)
          adjustedScore -= 30;
        }
      }

      // Engagement quality multiplier
      const engagementMultiplier = 1.0 + Math.min(data.oCounter, 10) * 0.03;
      const finalScore = adjustedScore * engagementMultiplier;

      // Only include scenes with positive final scores
      if (finalScore > 0) {
        scoredScenes.push({
          id: data.id,
          score: finalScore,
          oCounter: data.oCounter,
        });
      }
    }

    // Sort by score descending
    scoredScenes.sort((a, b) => b.score - a.score);

    // Add diversity through score tier randomization: 10% bands, shuffled
    // within each. The seed is per user and changes daily, so the order holds
    // across pages (no duplicates) and refreshes each day.
    const diversifiedScenes = diversifyByScoreTier(
      scoredScenes,
      new SeededRandom(generateDailySeed(userId))
    );

    // Cap at top 500 recommendations
    const cappedScenes = diversifiedScenes.slice(0, 500);

    // If no recommendations after scoring, include criteria for feedback
    if (cappedScenes.length === 0) {
      res.json({
        scenes: [],
        count: 0,
        page,
        perPage,
        message: "No matching recommendations found",
        criteria: criteriaCounts,
      });
      return;
    }

    // Paginate scene IDs
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    const paginatedIds = cappedScenes
      .slice(startIndex, endIndex)
      .map((s) => s.id);

    // Get user's allowed instance IDs for multi-instance filtering
    const allowedInstanceIds = await getUserAllowedInstanceIds(userId);

    // Fetch full scene data via SceneQueryBuilder
    const { scenes } = await sceneQueryBuilder.getByIds({
      userId,
      ids: paginatedIds,
      allowedInstanceIds,
    });

    // Preserve score order (getByIds returns in arbitrary order)
    const sceneMap = new Map(scenes.map((s) => [s.id, s]));
    const orderedScenes = paginatedIds
      .map((id) => sceneMap.get(id))
      .filter((s): s is NormalizedScene => s !== undefined);

    logger.debug("getRecommendedScenes completed", {
      totalTime: `${Date.now() - startTime}ms`,
      userId,
      candidateCount: cappedScenes.length,
      resultCount: orderedScenes.length,
      page,
    });

    res.json({
      scenes: orderedScenes,
      count: cappedScenes.length,
      page,
      perPage,
    });
  } catch (error) {
    const err = error as Error;
    logger.error("Error getting recommended scenes:", {
      message: err.message,
      name: err.name,
      stack: err.stack,
      userId: req.user?.id,
    });

    const errorType = err.name || "Unknown error";
    res.status(500).json({
      error: "Failed to get recommended scenes",
      errorType,
    });
  }
};
