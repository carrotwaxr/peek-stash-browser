import { resolveAccessibleInstanceId } from "../../services/EntityAccessService.js";
import { findMinimalEntities } from "../../services/MinimalEntityQuery.js";
import rankingComputeService from "../../services/RankingComputeService.js";
import { hasAnyCriteria } from "../../services/RecommendationScoringService.js";
import { recommendationService } from "../../services/RecommendationService.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import { stashEntityService } from "../../services/StashEntityService.js";
import type {
  AmbiguousLookupResponse,
  ApiErrorResponse,
  FindRecommendedScenesRequest,
  FindScenesMinimalRequest,
  FindScenesMinimalResponse,
  FindScenesRequest,
  FindScenesResponse,
  FindSimilarScenesParams,
  FindSimilarScenesQuery,
  FindSimilarScenesResponse,
  GetRecommendedScenesQuery,
  GetRecommendedScenesResponse,
  ListCount,
  ListCountResponse,
  TypedLibraryRequest,
  TypedResponse,
  WithStashUrl,
} from "../../types/api/index.js";
import type { NormalizedScene } from "../../types/index.js";
import type { ParsedListRequest } from "../../types/parsedFilters.js";
import { type EntityRef, entityKey } from "../../utils/entityRef.js";
import {
  parseListRequest,
  parseMinimalRequest,
  parseRecommendedListRequest,
  parseRecommendedRequest,
  parseSimilarScenesRequest,
  singleIdRef,
} from "../../utils/listRequest.js";
import { logger } from "../../utils/logger.js";
import { buildStashEntityUrl } from "../../utils/stashUrl.js";

/**
 * Add the View in Stash link to scenes; only an admin viewer gets it
 */
export function addStashUrl(
  scenes: NormalizedScene[],
  viewer: { role: string } | undefined
): WithStashUrl<NormalizedScene>[] {
  return scenes.map((scene) => ({
    ...scene,
    stashUrl: buildStashEntityUrl("scene", scene.id, scene.instanceId, viewer),
  }));
}

/**
 * Lists scenes through SceneQueryBuilder: filters, sort and paging run in SQL
 */
export const findScenes = async (
  req: TypedLibraryRequest<FindScenesRequest>,
  res: TypedResponse<
    FindScenesResponse<ListCount> | ApiErrorResponse | AmbiguousLookupResponse
  >
) => {
  const requestStart = Date.now();
  const userId = req.user.id;
  // A ValidationError (400) reaches the central error handler
  const request = parseListRequest("scene", req.body, { userId });

  const { specificInstanceId } = request;
  // A detail page asks for its scene by id
  const lookup = singleIdRef(request.filter.ids);

  const { allowedInstanceIds, timeZone } = req;

  // Execute query (applyExclusions defaults to true)
  const result = await sceneQueryBuilder.execute({
    userId,
    allowedInstanceIds,
    timeZone,
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
  let scenes = addStashUrl(result.items, req.user);

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
  req: TypedLibraryRequest<
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

  const { sceneId: id, page } = request;
  const perPage = 12;

  const instanceId = await resolveAccessibleInstanceId(
    userId,
    "scene",
    id,
    request.instanceId
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

  const { allowedInstanceIds } = req;
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
};

/** The counts Recommended's empty answers carry */
type RecommendedCriteria = NonNullable<
  GetRecommendedScenesResponse["criteria"]
>;

/**
 * What a Recommended request runs within: the user's ranked refs (scored
 * once per change to their ratings, plays, hidden items or rankings or to
 * the library, over their allowed instances), or the empty answer to send
 */
type RankedWithin =
  | { readonly refs: readonly EntityRef[] }
  | { readonly empty: string };

async function rankedWithin(
  userId: number,
  allowedInstanceIds: readonly string[]
): Promise<{
  within: RankedWithin;
  criteria: RecommendedCriteria;
}> {
  const { refs, criteria } = await recommendationService.getRankedRefs(
    userId,
    allowedInstanceIds
  );
  if (!hasAnyCriteria(criteria)) {
    return { within: { empty: "No recommendations yet" }, criteria };
  }
  if (refs.length === 0) {
    return { within: { empty: "No matching recommendations found" }, criteria };
  }
  return { within: { refs }, criteria };
}

/** Rankings over an hour old are recomputed, awaited; a failed recompute is logged by the service and the request scores with the stored rankings */
async function freshRankings(userId: number): Promise<void> {
  await rankingComputeService
    .ensureFresh(userId, { wait: true })
    .catch(() => undefined);
}

/**
 * Recommended scenes for a parsed scene list request: the scene builder lists
 * the user's ranked scenes with the request's filter, `where`, search, sort
 * and paging, in SQL, so every page is full and the count is what the user
 * can see (their exclusions and instances apply to the ranked refs again).
 * Rankings are refreshed on page 1 only, so the pages that follow are scored
 * with the rankings page 1 used.
 */
async function listRecommended(
  req: Pick<TypedLibraryRequest, "user" | "allowedInstanceIds" | "timeZone">,
  res: TypedResponse<GetRecommendedScenesResponse | ApiErrorResponse>,
  request: ParsedListRequest<"scene">
): Promise<void> {
  const startTime = Date.now();
  const userId = req.user.id;
  const { page, perPage } = request;

  if (page === 1) await freshRankings(userId);

  const { allowedInstanceIds, timeZone } = req;
  const { within, criteria } = await rankedWithin(userId, allowedInstanceIds);

  if ("empty" in within) {
    res.json({
      scenes: [],
      count: 0,
      page,
      perPage,
      message: within.empty,
      criteria,
    });
    return;
  }

  const result = await sceneQueryBuilder.execute({
    userId,
    allowedInstanceIds,
    timeZone,
    request,
    ranked: within.refs,
  });

  logger.debug("findRecommendedScenes completed", {
    totalTime: `${Date.now() - startTime}ms`,
    userId,
    candidateCount: within.refs.length,
    resultCount: result.items.length,
    total: result.total,
    page,
  });

  res.json({
    scenes: addStashUrl(result.items, req.user),
    count: result.total,
    page,
    perPage,
  });
}

/**
 * `POST /api/library/scenes/recommended`: the scene list request within the
 * user's ranked list. A ValidationError (400) reaches the central error
 * handler.
 */
export const findRecommendedScenes = async (
  req: TypedLibraryRequest<FindRecommendedScenesRequest>,
  res: TypedResponse<GetRecommendedScenesResponse | ApiErrorResponse>
) => {
  const request = parseRecommendedListRequest(req.body, {
    userId: req.user.id,
  });
  await listRecommended(req, res, request);
};

/**
 * `POST /api/library/scenes/recommended/count`: how many scenes the
 * request matches within the ranked list, the number `findRecommendedScenes`
 * answers as `count`. It reads the stored rankings (no recompute, so a count
 * made while the filter sheet is open never waits on one); no ranked scenes
 * answer 0.
 */
export const countRecommendedScenes = async (
  req: TypedLibraryRequest<FindRecommendedScenesRequest>,
  res: TypedResponse<ListCountResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;
  const request = parseRecommendedListRequest(req.body, { userId });
  const { allowedInstanceIds, timeZone } = req;

  const { within } = await rankedWithin(userId, allowedInstanceIds);
  if ("empty" in within) {
    res.json({ count: 0 });
    return;
  }

  res.json({
    count: await sceneQueryBuilder.count({
      userId,
      allowedInstanceIds,
      timeZone,
      request,
      ranked: within.refs,
    }),
  });
};

/**
 * `GET /api/library/scenes/recommended`: kept for a browser tab still on the
 * 3.4.0-beta.8 bundle, which pages the ranked list with `page` and
 * `per_page`. It runs the POST's path with no filter and the Recommended
 * sort. Remove it in the release after 3.4.0-beta.9, with the beta.8 tabs.
 */
export const getRecommendedScenes = async (
  req: TypedLibraryRequest<
    unknown,
    Record<string, string>,
    GetRecommendedScenesQuery
  >,
  res: TypedResponse<GetRecommendedScenesResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;
  // page >= 1 and per_page 1..250 (24 when absent); a ValidationError (400)
  // reaches the central error handler
  const { page, perPage } = parseRecommendedRequest(req.query, { userId });
  const request = parseRecommendedListRequest(
    { filter: { page, per_page: perPage } },
    { userId }
  );
  await listRecommended(req, res, request);
};

/**
 * One page of scenes for the scene picker (a clip filter's scenes), by
 * displayed title: the title or file name matched in SQL, or the ids a
 * picker has selected, only scenes the viewer can see. No scope: the
 * Content Restrictions editor restricts no scenes (a 400). A
 * ValidationError (400) reaches the central error handler.
 */
export const findScenesMinimal = async (
  req: TypedLibraryRequest<FindScenesMinimalRequest>,
  res: TypedResponse<FindScenesMinimalResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;
  const request = parseMinimalRequest("scene", req.body, { userId });

  const scenes = await findMinimalEntities(
    req.user,
    request,
    req.allowedInstanceIds
  );
  res.json({ scenes });
};
