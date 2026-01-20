// server/controllers/timelineController.ts
import type { Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { timelineService, type Granularity, type TimelineEntityType, type TimelineFilters } from "../services/TimelineService.js";
import { logger } from "../utils/logger.js";

const VALID_ENTITY_TYPES: TimelineEntityType[] = ["scene", "gallery", "image"];
const VALID_GRANULARITIES: Granularity[] = ["years", "months", "weeks", "days"];

export async function getDateDistribution(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const { entityType } = req.params;
  const granularity = (req.query.granularity as string) || "months";
  const userId = req.user!.id;

  // Parse optional filter params
  const filters: TimelineFilters = {};
  if (req.query.performerId) filters.performerId = req.query.performerId as string;
  if (req.query.tagId) filters.tagId = req.query.tagId as string;
  if (req.query.studioId) filters.studioId = req.query.studioId as string;
  if (req.query.groupId) filters.groupId = req.query.groupId as string;

  if (!VALID_ENTITY_TYPES.includes(entityType as TimelineEntityType)) {
    res.status(400).json({ error: "Invalid entity type" });
    return;
  }

  if (!VALID_GRANULARITIES.includes(granularity as Granularity)) {
    res.status(400).json({ error: "Invalid granularity" });
    return;
  }

  try {
    const distribution = await timelineService.getDistribution(
      entityType as TimelineEntityType,
      userId,
      granularity as Granularity,
      Object.keys(filters).length > 0 ? filters : undefined
    );
    res.json({ distribution });
  } catch (error) {
    logger.error("Error fetching date distribution", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ error: "Failed to fetch date distribution" });
  }
}
