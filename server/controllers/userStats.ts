import type {
  TypedAuthRequest,
  TypedResponse,
  ApiErrorResponse,
  UserStatsResponse,
} from "../types/api/index.js";
import { userStatsAggregationService, type TopListSortBy } from "../services/UserStatsAggregationService.js";
import rankingComputeService from "../services/RankingComputeService.js";
import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Validate sortBy query parameter
 */
function isValidSortBy(value: unknown): value is TopListSortBy {
  return value === "engagement" || value === "oCount" || value === "playCount";
}

/**
 * Ensure rankings are fresh for the given user.
 * If rankings are stale (>1 hour) or missing, awaits a full recompute.
 */
async function ensureFreshRankings(userId: number): Promise<void> {
  const lastRanking = await prisma.userEntityRanking.findFirst({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true },
  });

  const isStale =
    !lastRanking ||
    Date.now() - lastRanking.updatedAt.getTime() > ONE_HOUR_MS;

  if (isStale) {
    logger.info("Rankings stale for user stats, recomputing", { userId });
    await rankingComputeService.recomputeAllRankings(userId);
  }
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

    // Ensure rankings are fresh before returning stats
    await ensureFreshRankings(userId);

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
