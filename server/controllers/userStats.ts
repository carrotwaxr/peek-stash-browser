import rankingComputeService from "../services/RankingComputeService.js";
import { getUserAllowedInstanceIds } from "../services/UserInstanceService.js";
import {
  type TopListSortBy,
  userStatsAggregationService,
} from "../services/UserStatsAggregationService.js";
import type {
  ApiErrorResponse,
  TypedAuthRequest,
  TypedResponse,
  UserStatsResponse,
} from "../types/api/index.js";

/**
 * Validate sortBy query parameter
 */
function isValidSortBy(value: unknown): value is TopListSortBy {
  return value === "engagement" || value === "oCount" || value === "playCount";
}

/**
 * Get aggregated user stats
 *
 * Query parameters:
 * - sortBy: "engagement" | "oCount" | "playCount" (default: "engagement")
 */
export async function getUserStats(
  req: TypedAuthRequest,
  res: TypedResponse<UserStatsResponse | ApiErrorResponse>
) {
  const userId = req.user.id;

  // Parse sortBy query parameter
  const sortByParam = req.query.sortBy;
  const sortBy: TopListSortBy = isValidSortBy(sortByParam)
    ? sortByParam
    : "engagement";

  // Rankings over an hour old are recomputed before the top lists are read
  await rankingComputeService.ensureFresh(userId, { wait: true });

  // Everything counted is on an instance the viewer sees
  const stats = await userStatsAggregationService.getUserStats(userId, {
    sortBy,
    allowedInstanceIds: await getUserAllowedInstanceIds(userId),
  });

  res.json(stats);
}
