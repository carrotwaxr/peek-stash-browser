import { resolveAccessibleInstanceId } from "../../services/EntityAccessService.js";
import rankingComputeService from "../../services/RankingComputeService.js";
import { hasAnyCriteria } from "../../services/RecommendationScoringService.js";
import { recommendationService } from "../../services/RecommendationService.js";
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
  TypedAuthRequest,
  TypedResponse,
  WithStashUrl,
} from "../../types/api/index.js";
import type { NormalizedScene } from "../../types/index.js";
import { isSceneStreamable } from "../../utils/codecDetection.js";
import { type EntityRef, entityKey } from "../../utils/entityRef.js";
import {
  logDropped,
  parseListRequest,
  parseRecommendedRequest,
  parseSimilarScenesRequest,
  singleIdRef,
} from "../../utils/listRequest.js";
import { logger } from "../../utils/logger.js";
import { buildStashEntityUrl } from "../../utils/stashUrl.js";

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
  const userId = req.user.id;
  // A ValidationError (400) reaches the central error handler
  const request = parseListRequest("scene", req.body, { userId });
  logDropped("POST /library/scenes", request.dropped);

  try {
    const { specificInstanceId } = request;
    // A detail page asks for its scene by id
    const lookup = singleIdRef(request.filter.ids);

    // Get user's allowed instance IDs for multi-instance filtering
    const allowedInstanceIds = await getUserAllowedInstanceIds(userId);

    // Execute query (applyExclusions defaults to true)
    const result = await sceneQueryBuilder.execute({
      userId,
      allowedInstanceIds,
      request,
    });

    // Check for ambiguous results on single-ID lookups
    // This happens when the same ID exists in multiple Stash instances
    if (lookup && !specificInstanceId && result.items.length > 1) {
      logger.warn("Ambiguous scene lookup", {
        id: lookup.id,
        matchCount: result.items.length,
        instances: result.items.map((s) => s.instanceId),
      });
      res.status(400).json({
        error: "Ambiguous lookup",
        message: `Multiple scenes found with ID ${lookup.id}. Specify instance_id parameter.`,
        matches: result.items.map((s) => ({
          id: s.id,
          title: s.title,
          instanceId: s.instanceId,
        })),
      });
      return;
    }

    // Add streamability info
    let scenes = addStreamabilityInfo(result.items, req.user);

    // The Scene page loads one scene by id: only then build its stream
    // list. Lists keep sceneStreams empty.
    if (lookup) {
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
  const userId = req.user.id;
  // A ValidationError (400) reaches the central error handler
  const request = parseSimilarScenesRequest(req.params.id, req.query, {
    userId,
  });
  logDropped("GET /library/scenes/:id/similar", request.dropped);

  try {
    const { sceneId: id, page } = request;
    const perPage = 12;

    const instanceId = await resolveAccessibleInstanceId(
      userId,
      "scene",
      id,
      request.specificInstanceId
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
    const scenes = await sceneQueryBuilder.getByRefs({
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
 * Recommended scenes: the user's ranked list (`RecommendationService`,
 * scored once per change to their ratings, plays, hidden items or rankings
 * or to the library), one page of it fetched through the scene builder by
 * (id, instance) and put back in ranked order. The list already honours the
 * user's exclusions and instances, so every page is full and the count is
 * what the user can see.
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
  const userId = req.user.id;
  // page >= 1 and per_page 1..250 (24 when absent); a ValidationError (400)
  // reaches the central error handler
  const request = parseRecommendedRequest(req.query, { userId });
  logDropped("GET /library/scenes/recommended", request.dropped);

  try {
    const { page, perPage } = request;

    // Rankings over an hour old are recomputed in the background; this
    // request scores with the ones stored
    void rankingComputeService.ensureFresh(userId);

    const allowedInstanceIds = await getUserAllowedInstanceIds(userId);
    const { refs, criteria } = await recommendationService.getRankedRefs(
      userId,
      allowedInstanceIds
    );

    if (!hasAnyCriteria(criteria)) {
      res.json({
        scenes: [],
        count: 0,
        page,
        perPage,
        message: "No recommendations yet",
        criteria,
      });
      return;
    }

    if (refs.length === 0) {
      res.json({
        scenes: [],
        count: 0,
        page,
        perPage,
        message: "No matching recommendations found",
        criteria,
      });
      return;
    }

    const startIndex = (page - 1) * perPage;
    const pageRefs = refs.slice(startIndex, startIndex + perPage);

    const scenes = await sceneQueryBuilder.getByRefs({
      userId,
      refs: pageRefs,
      allowedInstanceIds,
    });

    // Back in ranked order: getByRefs returns the page in no particular order
    const sceneByKey = new Map(
      scenes.map((s) => [entityKey(s.id, s.instanceId), s])
    );
    const orderedScenes = pageRefs
      .map((ref) => sceneByKey.get(entityKey(ref.id, ref.instanceId)))
      .filter((s): s is NormalizedScene => s !== undefined);

    logger.debug("getRecommendedScenes completed", {
      totalTime: `${Date.now() - startTime}ms`,
      userId,
      candidateCount: refs.length,
      resultCount: orderedScenes.length,
      page,
    });

    res.json({
      scenes: orderedScenes,
      count: refs.length,
      page,
      perPage,
    });
  } catch (error) {
    const err = error as Error;
    logger.error("Error getting recommended scenes:", {
      message: err.message,
      name: err.name,
      stack: err.stack,
      userId,
    });

    const errorType = err.name || "Unknown error";
    res.status(500).json({
      error: "Failed to get recommended scenes",
      errorType,
    });
  }
};
