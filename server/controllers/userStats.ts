import rankingComputeService from "../services/RankingComputeService.js";
import {
  type TopListSortBy,
  userStatsAggregationService,
} from "../services/UserStatsAggregationService.js";
import type {
  ApiErrorResponse,
  TypedLibraryRequest,
  TypedResponse,
  UserStatsResponse,
} from "../types/api/index.js";

/**
 * Validate sortBy query parameter
 */
function isValidSortBy(value: unknown): value is TopListSortBy {
  return value === "engagement" || value === "oCount" || value === "playCount";
}

/** A user's forced refresh recomputes at most once in this long */
const FORCED_REFRESH_INTERVAL_MS = 60_000;

/** When each user last forced a recompute (user id to ms); old entries are dropped on each call */
const lastForcedRefresh = new Map<number, number>();

/**
 * Whether this forced refresh may forget the user's rankings: not when the
 * user's last forced one was under a minute ago. Records the time when it may.
 */
function takeForcedRefresh(userId: number): boolean {
  const now = Date.now();
  for (const [id, at] of lastForcedRefresh) {
    if (now - at >= FORCED_REFRESH_INTERVAL_MS) lastForcedRefresh.delete(id);
  }
  if (lastForcedRefresh.has(userId)) return false;
  lastForcedRefresh.set(userId, now);
  return true;
}

/**
 * Get aggregated user stats
 *
 * Query parameters:
 * - sortBy: "engagement" | "oCount" | "playCount" (default: "engagement")
 * - refresh: "1" recomputes the user's rankings now instead of when they are
 *   an hour old (at most once a minute per user)
 */
export async function getUserStats(
  req: TypedLibraryRequest,
  res: TypedResponse<UserStatsResponse | ApiErrorResponse>
) {
  const userId = req.user.id;

  // Parse sortBy query parameter
  const sortByParam = req.query.sortBy;
  const sortBy: TopListSortBy = isValidSortBy(sortByParam)
    ? sortByParam
    : "engagement";

  // A forced refresh makes the rankings stale, so the wait below recomputes
  if (req.query.refresh === "1" && takeForcedRefresh(userId)) {
    rankingComputeService.forget(userId);
  }

  // Rankings over an hour old are recomputed before the top lists are read
  await rankingComputeService.ensureFresh(userId, { wait: true });

  // Everything counted is on an instance the viewer sees
  const stats = await userStatsAggregationService.getUserStats(userId, {
    sortBy,
    allowedInstanceIds: req.allowedInstanceIds,
  });

  res.json(stats);
}
