import type { Response } from "express";
import type { Prisma } from "@prisma/client";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import prisma from "../prisma/singleton.js";
import { stashEntityService } from "../services/StashEntityService.js";
import { entityExclusionHelper } from "../services/EntityExclusionHelper.js";
import { sceneQueryBuilder } from "../services/SceneQueryBuilder.js";
import type { NormalizedScene, PeekSceneFilter } from "../types/index.js";
import { logger } from "../utils/logger.js";
import {
  mergeScenesWithUserData,
  applyQuickSceneFilters,
  applyExpensiveSceneFilters,
  sortScenes,
  addStreamabilityInfo,
} from "./library/scenes.js";

// Maximum number of custom carousels per user
const MAX_CAROUSELS_PER_USER = 15;

// Number of scenes to return for carousel preview/display
const CAROUSEL_SCENE_LIMIT = 12;

// Feature flag for SQL query builder
const USE_SQL_QUERY_BUILDER = process.env.USE_SQL_QUERY_BUILDER !== "false";

/**
 * Get all custom carousels for the current user
 */
export const getUserCarousels = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const carousels = await prisma.userCarousel.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });

    res.json({ carousels });
  } catch (error) {
    console.error("Error getting user carousels:", error);
    res.status(500).json({ error: "Failed to get carousels" });
  }
};

/**
 * Get a single carousel by ID
 */
export const getCarousel = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const carouselId = req.params.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const carousel = await prisma.userCarousel.findFirst({
      where: {
        id: carouselId,
        userId,
      },
    });

    if (!carousel) {
      return res.status(404).json({ error: "Carousel not found" });
    }

    res.json({ carousel });
  } catch (error) {
    console.error("Error getting carousel:", error);
    res.status(500).json({ error: "Failed to get carousel" });
  }
};

interface CarouselPreference {
  id: string;
  enabled: boolean;
  order: number;
}

/**
 * Create a new custom carousel
 */
export const createCarousel = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { title, icon, rules, sort, direction } = req.body;

    // Validate required fields
    if (!title || title.trim() === "") {
      return res.status(400).json({ error: "Title is required" });
    }

    if (!rules || typeof rules !== "object") {
      return res.status(400).json({ error: "Rules are required" });
    }

    // Check carousel limit
    const count = await prisma.userCarousel.count({
      where: { userId },
    });

    if (count >= MAX_CAROUSELS_PER_USER) {
      return res.status(400).json({
        error: `Maximum ${MAX_CAROUSELS_PER_USER} custom carousels allowed`,
      });
    }

    const carousel = await prisma.userCarousel.create({
      data: {
        userId,
        title: title.trim(),
        icon: icon || "Film",
        rules,
        sort: sort || "random",
        direction: direction || "DESC",
      },
    });

    // Add the new carousel to the user's carouselPreferences so it shows on homepage immediately
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { carouselPreferences: true },
    });

    const existingPrefs = (user?.carouselPreferences as CarouselPreference[] | null) || [];
    const customCarouselId = `custom-${carousel.id}`;

    // Only add if not already present
    if (!existingPrefs.find((p) => p.id === customCarouselId)) {
      const maxOrder = existingPrefs.reduce((max, p) => Math.max(max, p.order), -1);
      const newPrefs = [
        ...existingPrefs,
        { id: customCarouselId, enabled: true, order: maxOrder + 1 },
      ];

      await prisma.user.update({
        where: { id: userId },
        data: { carouselPreferences: newPrefs as unknown as Prisma.InputJsonValue },
      });
    }

    res.status(201).json({ carousel });
  } catch (error) {
    console.error("Error creating carousel:", error);
    res.status(500).json({ error: "Failed to create carousel" });
  }
};

/**
 * Update an existing carousel
 */
export const updateCarousel = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const carouselId = req.params.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { title, icon, rules, sort, direction } = req.body;

    // Check ownership
    const existing = await prisma.userCarousel.findFirst({
      where: {
        id: carouselId,
        userId,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: "Carousel not found" });
    }

    // Validate title if provided
    if (title !== undefined && title.trim() === "") {
      return res.status(400).json({ error: "Title cannot be empty" });
    }

    const carousel = await prisma.userCarousel.update({
      where: { id: carouselId },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(icon !== undefined && { icon }),
        ...(rules !== undefined && { rules }),
        ...(sort !== undefined && { sort }),
        ...(direction !== undefined && { direction }),
      },
    });

    res.json({ carousel });
  } catch (error) {
    console.error("Error updating carousel:", error);
    res.status(500).json({ error: "Failed to update carousel" });
  }
};

/**
 * Delete a carousel
 */
export const deleteCarousel = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const carouselId = req.params.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Check ownership
    const existing = await prisma.userCarousel.findFirst({
      where: {
        id: carouselId,
        userId,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: "Carousel not found" });
    }

    await prisma.userCarousel.delete({
      where: { id: carouselId },
    });

    res.json({ success: true, message: "Carousel deleted" });
  } catch (error) {
    console.error("Error deleting carousel:", error);
    res.status(500).json({ error: "Failed to delete carousel" });
  }
};

/**
 * Preview carousel results without saving
 * Executes the carousel query and returns matching scenes
 */
export const previewCarousel = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { rules, sort, direction } = req.body;

    if (!rules || typeof rules !== "object") {
      return res.status(400).json({ error: "Rules are required" });
    }

    // Execute the carousel query
    const scenes = await executeCarouselQuery(
      userId,
      rules as PeekSceneFilter,
      sort || "random",
      direction || "DESC"
    );

    res.json({ scenes });
  } catch (error) {
    console.error("Error previewing carousel:", error);
    res.status(500).json({ error: "Failed to preview carousel" });
  }
};

/**
 * Execute a carousel's scene query
 * This is also exported for use by the homepage to render carousel scenes
 *
 * OPTIMIZED: For carousels without filters, uses DB pagination with pre-computed exclusions
 * For carousels with filters, still needs to load scenes but uses optimized exclusion checking
 */
export async function executeCarouselQuery(
  userId: number,
  rules: PeekSceneFilter,
  sort: string,
  direction: string
): Promise<NormalizedScene[]> {
  const startTime = Date.now();

  // NEW: Use SQL query builder if enabled
  if (USE_SQL_QUERY_BUILDER) {
    logger.info("executeCarouselQuery: using SQL query builder path");

    // Execute query (applyExclusions defaults to true)
    const result = await sceneQueryBuilder.execute({
      userId,
      filters: rules,
      sort,
      sortDirection: direction.toUpperCase() as "ASC" | "DESC",
      page: 1,
      perPage: CAROUSEL_SCENE_LIMIT,
      // Use different seed per carousel load for variety
      randomSeed: sort === 'random' ? userId + Date.now() : userId,
    });

    const scenes = addStreamabilityInfo(result.scenes);

    logger.info("executeCarouselQuery complete (SQL path)", {
      totalTimeMs: Date.now() - startTime,
      resultCount: scenes.length,
    });

    return scenes;
  }

  // Check if carousel has any actual filters
  const hasFilters = rules && Object.keys(rules).length > 0;

  // Check for expensive filters that need user data
  const hasExpensiveFilters =
    rules?.favorite !== undefined ||
    rules?.rating100 !== undefined ||
    rules?.o_counter !== undefined ||
    rules?.play_count !== undefined ||
    rules?.play_duration !== undefined ||
    rules?.last_played_at !== undefined ||
    rules?.last_o_at !== undefined ||
    rules?.performer_favorite !== undefined ||
    rules?.studio_favorite !== undefined ||
    rules?.tag_favorite !== undefined;

  // Check if sort field is supported by DB
  const dbSortFields = new Set(['created_at', 'updated_at', 'date', 'title', 'duration', 'random']);
  const canUseDbSort = dbSortFields.has(sort);

  // FAST PATH: No filters, DB-supported sort
  if (!hasFilters && canUseDbSort) {
    logger.info('executeCarouselQuery: using FAST PATH (no filters)');

    // Get pre-computed scene exclusions
    const exclusionStart = Date.now();
    const excludeIds = await entityExclusionHelper.getExcludedIds(userId, 'scene');
    logger.info(`executeCarouselQuery: getExcludedIds took ${Date.now() - exclusionStart}ms (${excludeIds.size} exclusions)`);

    // Get scenes with DB pagination (only need CAROUSEL_SCENE_LIMIT scenes)
    const dbStart = Date.now();
    const { scenes } = await stashEntityService.getScenesPaginated({
      page: 1,
      perPage: CAROUSEL_SCENE_LIMIT,
      sortField: sort,
      sortDirection: direction.toUpperCase() as 'ASC' | 'DESC',
      excludeIds,
    });
    logger.info(`executeCarouselQuery: DB pagination took ${Date.now() - dbStart}ms`);

    // Merge with user data
    const mergeStart = Date.now();
    const scenesWithUserData = await mergeScenesWithUserData(scenes, userId);
    logger.info(`executeCarouselQuery: mergeScenesWithUserData took ${Date.now() - mergeStart}ms`);

    // Add streamability info
    const finalScenes = addStreamabilityInfo(scenesWithUserData);

    logger.info(`executeCarouselQuery: TOTAL took ${Date.now() - startTime}ms (FAST PATH)`);
    return finalScenes;
  }

  // STANDARD PATH: Has filters, need to load more scenes
  logger.info(`executeCarouselQuery: using STANDARD PATH (hasFilters=${hasFilters}, hasExpensiveFilters=${hasExpensiveFilters})`);

  // Get pre-computed scene exclusions
  const exclusionStart = Date.now();
  const excludeIds = await entityExclusionHelper.getExcludedIds(userId, 'scene');
  logger.info(`executeCarouselQuery: getExcludedIds took ${Date.now() - exclusionStart}ms (${excludeIds.size} exclusions)`);

  // Get scenes from cache (lightweight browse query)
  const cacheStart = Date.now();
  let scenes = await stashEntityService.getAllScenes();
  logger.info(`executeCarouselQuery: getAllScenes took ${Date.now() - cacheStart}ms`);

  // Apply pre-computed exclusions (fast Set lookup instead of nested entity checks)
  const filterStart = Date.now();
  scenes = scenes.filter(s => !excludeIds.has(s.id));
  logger.info(`executeCarouselQuery: applied ${excludeIds.size} exclusions in ${Date.now() - filterStart}ms, ${scenes.length} scenes remaining`);

  // Apply the carousel's filter rules (quick filters that don't need user data)
  const quickFilterStart = Date.now();
  scenes = await applyQuickSceneFilters(scenes, rules);
  logger.info(`executeCarouselQuery: applyQuickSceneFilters took ${Date.now() - quickFilterStart}ms`);

  // Merge with user-specific data (ratings, watch history, favorites)
  const mergeStart = Date.now();
  scenes = await mergeScenesWithUserData(scenes, userId);
  logger.info(`executeCarouselQuery: mergeScenesWithUserData took ${Date.now() - mergeStart}ms`);

  // Apply filters that require user data (favorite, rating, play_count, etc.)
  const expensiveFilterStart = Date.now();
  scenes = applyExpensiveSceneFilters(scenes, rules);
  logger.info(`executeCarouselQuery: applyExpensiveSceneFilters took ${Date.now() - expensiveFilterStart}ms`);

  // Add streamability info
  scenes = addStreamabilityInfo(scenes);

  // Sort the results
  scenes = sortScenes(scenes, sort, direction);

  // Limit to carousel size
  logger.info(`executeCarouselQuery: TOTAL took ${Date.now() - startTime}ms (STANDARD PATH)`);
  return scenes.slice(0, CAROUSEL_SCENE_LIMIT);
}

/**
 * Execute a carousel by ID and return its scenes
 * Used by the homepage to render a specific carousel
 */
export const executeCarouselById = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const carouselId = req.params.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Get the carousel
    const carousel = await prisma.userCarousel.findFirst({
      where: {
        id: carouselId,
        userId,
      },
    });

    if (!carousel) {
      return res.status(404).json({ error: "Carousel not found" });
    }

    // Execute the query
    const scenes = await executeCarouselQuery(
      userId,
      carousel.rules as PeekSceneFilter,
      carousel.sort,
      carousel.direction
    );

    res.json({
      carousel: {
        id: carousel.id,
        title: carousel.title,
        icon: carousel.icon,
      },
      scenes,
    });
  } catch (error) {
    console.error("Error executing carousel:", error);
    res.status(500).json({ error: "Failed to execute carousel query" });
  }
};
