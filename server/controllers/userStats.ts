import type {
  TypedAuthRequest,
  TypedResponse,
  ApiErrorResponse,
  UserStatsResponse,
} from "../types/api/index.js";
import { userStatsAggregationService, type TopListSortBy } from "../services/UserStatsAggregationService.js";
import { logger } from "../utils/logger.js";

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
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    // Parse sortBy query parameter
    const sortByParam = req.query.sortBy;
    const sortBy: TopListSortBy = isValidSortBy(sortByParam) ? sortByParam : "engagement";

    const stats = await userStatsAggregationService.getUserStats(userId, { sortBy });

    res.json(stats);
  } catch (error) {
    logger.error("Error fetching user stats", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ error: "Failed to fetch user stats" });
  }
}
