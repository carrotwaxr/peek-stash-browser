import type { Prisma } from "@prisma/client";
import prisma from "../prisma/singleton.js";
import { sceneQueryBuilder } from "../services/SceneQueryBuilder.js";
import { getUserAllowedInstanceIds } from "../services/UserInstanceService.js";
import type {
  ApiErrorResponse,
  CarouselPreference,
  CreateCarouselRequest,
  CreateCarouselResponse,
  DeleteCarouselParams,
  DeleteCarouselResponse,
  ExecuteCarouselByIdParams,
  ExecuteCarouselByIdResponse,
  GetCarouselParams,
  GetCarouselResponse,
  GetUserCarouselsResponse,
  PreviewCarouselRequest,
  PreviewCarouselResponse,
  TypedAuthRequest,
  TypedResponse,
  UpdateCarouselParams,
  UpdateCarouselRequest,
  UpdateCarouselResponse,
  WithStashUrl,
} from "../types/api/index.js";
import type { NormalizedScene } from "../types/index.js";
import type { ParsedListRequest } from "../types/parsedFilters.js";
import {
  logDropped,
  parseCarouselRequest,
  parseStoredSceneQuery,
} from "../utils/listRequest.js";
import { logger } from "../utils/logger.js";
import { addStreamabilityInfo } from "./library/scenes.js";

// Maximum number of custom carousels per user
const MAX_CAROUSELS_PER_USER = 15;

// Number of scenes to return for carousel preview/display
const CAROUSEL_SCENE_LIMIT = 12;

// What a new carousel sorts by when the request names nothing
const DEFAULT_CAROUSEL_SORT = "random";
const DEFAULT_CAROUSEL_DIRECTION = "DESC";

/** A new seed each load, so a random carousel varies from visit to visit */
const perLoadSeed = (userId: number) => userId + Date.now();

/**
 * Get all custom carousels for the current user
 */
export const getUserCarousels = async (
  req: TypedAuthRequest,
  res: TypedResponse<GetUserCarouselsResponse | ApiErrorResponse>
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const carousels = await prisma.userCarousel.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });

    res.json({ carousels });
  } catch (error) {
    logger.error("Error getting user carousels", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({ error: "Failed to get carousels" });
  }
};

/**
 * Get a single carousel by ID
 */
export const getCarousel = async (
  req: TypedAuthRequest<unknown, GetCarouselParams>,
  res: TypedResponse<GetCarouselResponse | ApiErrorResponse>
) => {
  try {
    const userId = req.user?.id;
    const carouselId = req.params.id;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const carousel = await prisma.userCarousel.findFirst({
      where: {
        id: carouselId,
        userId,
      },
    });

    if (!carousel) {
      res.status(404).json({ error: "Carousel not found" });
      return;
    }

    res.json({ carousel });
  } catch (error) {
    logger.error("Error getting carousel", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({ error: "Failed to get carousel" });
  }
};

/**
 * Create a new custom carousel
 */
export const createCarousel = async (
  req: TypedAuthRequest<CreateCarouselRequest>,
  res: TypedResponse<CreateCarouselResponse | ApiErrorResponse>
) => {
  const userId = req.user?.id;

  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { title, icon, rules, sort, direction } = req.body;

  if (!rules || typeof rules !== "object") {
    res.status(400).json({ error: "Rules are required" });
    return;
  }

  // The rules, sort and direction against the scene contract; a
  // ValidationError (400) reaches the central error handler
  const request = parseCarouselRequest(
    {
      rules,
      sort: sort ?? DEFAULT_CAROUSEL_SORT,
      direction: direction ?? DEFAULT_CAROUSEL_DIRECTION,
    },
    { userId }
  );
  logDropped("POST /carousels", request.dropped);

  try {
    // Validate required fields
    if (!title || title.trim() === "") {
      res.status(400).json({ error: "Title is required" });
      return;
    }

    // Check carousel limit
    const count = await prisma.userCarousel.count({
      where: { userId },
    });

    if (count >= MAX_CAROUSELS_PER_USER) {
      res.status(400).json({
        error: `Maximum ${MAX_CAROUSELS_PER_USER} custom carousels allowed`,
      });
      return;
    }

    const carousel = await prisma.userCarousel.create({
      data: {
        userId,
        title: title.trim(),
        icon: icon || "Film",
        rules: rules as unknown as Prisma.InputJsonValue,
        // As the parser read them: a contract sort, direction upper-case
        sort: request.sort.field,
        direction: request.sort.direction,
      },
    });

    // Add the new carousel to the user's carouselPreferences so it shows on homepage immediately
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { carouselPreferences: true },
    });

    const existingPrefs =
      (user?.carouselPreferences as CarouselPreference[] | null) ?? [];
    const customCarouselId = `custom-${carousel.id}`;

    // Only add if not already present
    if (!existingPrefs.find((p) => p.id === customCarouselId)) {
      const maxOrder = existingPrefs.reduce(
        (max, p) => Math.max(max, p.order),
        -1
      );
      const newPrefs = [
        ...existingPrefs,
        { id: customCarouselId, enabled: true, order: maxOrder + 1 },
      ];

      await prisma.user.update({
        where: { id: userId },
        data: {
          carouselPreferences: newPrefs as unknown as Prisma.InputJsonValue,
        },
      });
    }

    res.status(201).json({ carousel });
  } catch (error) {
    logger.error("Error creating carousel", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({ error: "Failed to create carousel" });
  }
};

/**
 * Update an existing carousel
 */
export const updateCarousel = async (
  req: TypedAuthRequest<UpdateCarouselRequest, UpdateCarouselParams>,
  res: TypedResponse<UpdateCarouselResponse | ApiErrorResponse>
) => {
  const userId = req.user?.id;
  const carouselId = req.params.id;

  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { title, icon, rules, sort, direction } = req.body;

  // The parts sent, against the scene contract; a ValidationError (400)
  // reaches the central error handler
  const request = parseCarouselRequest({ rules, sort, direction }, { userId });
  logDropped("PUT /carousels/:id", request.dropped);

  try {
    // Check ownership
    const existing = await prisma.userCarousel.findFirst({
      where: {
        id: carouselId,
        userId,
      },
    });

    if (!existing) {
      res.status(404).json({ error: "Carousel not found" });
      return;
    }

    // Validate title if provided
    if (title !== undefined && title.trim() === "") {
      res.status(400).json({ error: "Title cannot be empty" });
      return;
    }

    const carousel = await prisma.userCarousel.update({
      where: { id: carouselId },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(icon !== undefined && { icon }),
        ...(rules !== undefined && {
          rules: rules as unknown as Prisma.InputJsonValue,
        }),
        ...(sort !== undefined && { sort: request.sort.field }),
        ...(direction !== undefined && { direction: request.sort.direction }),
      },
    });

    res.json({ carousel });
  } catch (error) {
    logger.error("Error updating carousel", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({ error: "Failed to update carousel" });
  }
};

/**
 * Delete a carousel
 */
export const deleteCarousel = async (
  req: TypedAuthRequest<unknown, DeleteCarouselParams>,
  res: TypedResponse<DeleteCarouselResponse | ApiErrorResponse>
) => {
  try {
    const userId = req.user?.id;
    const carouselId = req.params.id;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Check ownership
    const existing = await prisma.userCarousel.findFirst({
      where: {
        id: carouselId,
        userId,
      },
    });

    if (!existing) {
      res.status(404).json({ error: "Carousel not found" });
      return;
    }

    await prisma.userCarousel.delete({
      where: { id: carouselId },
    });

    res.json({ success: true, message: "Carousel deleted" });
  } catch (error) {
    logger.error("Error deleting carousel", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({ error: "Failed to delete carousel" });
  }
};

/**
 * Preview carousel results without saving
 * Executes the carousel query and returns matching scenes
 */
export const previewCarousel = async (
  req: TypedAuthRequest<PreviewCarouselRequest>,
  res: TypedResponse<PreviewCarouselResponse | ApiErrorResponse>
) => {
  const userId = req.user?.id;

  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { rules, sort, direction } = req.body;

  if (!rules || typeof rules !== "object") {
    res.status(400).json({ error: "Rules are required" });
    return;
  }

  // A ValidationError (400) reaches the central error handler
  const query = parseCarouselRequest(
    {
      rules,
      sort: sort ?? DEFAULT_CAROUSEL_SORT,
      direction: direction ?? DEFAULT_CAROUSEL_DIRECTION,
    },
    { userId, perPage: CAROUSEL_SCENE_LIMIT, randomSeed: perLoadSeed(userId) }
  );
  logDropped("POST /carousels/preview", query.dropped);

  try {
    // Execute the carousel query
    const scenes = await executeCarouselQuery(userId, query, req.user);

    res.json({ scenes });
  } catch (error) {
    logger.error("Error previewing carousel", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({ error: "Failed to preview carousel" });
  }
};

/**
 * Runs a carousel's parsed scene query for the user: their exclusions
 * (applyExclusions defaults to true) and only their instances (enabled,
 * selected and past their first sync; invariant 11). The routes answer 503
 * before this when the user has none, since an empty list filters nothing.
 *
 * `viewer` is the requesting user: only an admin's scenes carry stashUrl.
 */
export async function executeCarouselQuery(
  userId: number,
  query: ParsedListRequest<"scene">,
  viewer: { role: string } | undefined
): Promise<WithStashUrl<NormalizedScene>[]> {
  const startTime = Date.now();

  const allowedInstanceIds = await getUserAllowedInstanceIds(userId);

  const result = await sceneQueryBuilder.execute({
    userId,
    allowedInstanceIds,
    request: query,
  });

  const scenes = addStreamabilityInfo(result.items, viewer);

  logger.debug("executeCarouselQuery complete (SQL path)", {
    totalTimeMs: Date.now() - startTime,
    resultCount: scenes.length,
  });

  return scenes;
}

/**
 * Execute a carousel by ID and return its scenes
 * Used by the homepage to render a specific carousel
 */
export const executeCarouselById = async (
  req: TypedAuthRequest<unknown, ExecuteCarouselByIdParams>,
  res: TypedResponse<ExecuteCarouselByIdResponse | ApiErrorResponse>
) => {
  try {
    const userId = req.user?.id;
    const carouselId = req.params.id;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Get the carousel
    const carousel = await prisma.userCarousel.findFirst({
      where: {
        id: carouselId,
        userId,
      },
    });

    if (!carousel) {
      res.status(404).json({ error: "Carousel not found" });
      return;
    }

    // Stored rules parse leniently: what the contract no longer takes is
    // left out and logged, and a bad sort or direction takes the default
    const query = parseStoredSceneQuery(
      carousel.rules,
      carousel.sort,
      carousel.direction,
      {
        userId,
        perPage: CAROUSEL_SCENE_LIMIT,
        randomSeed: perLoadSeed(userId),
      }
    );
    logDropped("GET /carousels/:id/execute", query.dropped);

    const scenes = await executeCarouselQuery(userId, query, req.user);

    res.json({
      carousel: {
        id: carousel.id,
        title: carousel.title,
        icon: carousel.icon,
      },
      scenes,
    });
  } catch (error) {
    logger.error("Error executing carousel", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({ error: "Failed to execute carousel query" });
  }
};
