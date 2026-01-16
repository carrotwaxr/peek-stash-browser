import type {
  TypedAuthRequest,
  TypedResponse,
  ApiErrorResponse,
  UserStatsResponse,
} from "../types/api/index.js";
import { userStatsAggregationService } from "../services/UserStatsAggregationService.js";
import { logger } from "../utils/logger.js";

/**
 * Get aggregated user stats
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

    const stats = await userStatsAggregationService.getUserStats(userId);

    res.json(stats);
  } catch (error) {
    logger.error("Error fetching user stats", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ error: "Failed to fetch user stats" });
  }
}
