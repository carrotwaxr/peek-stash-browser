import type {
  TypedAuthRequest,
  TypedResponse,
  UpdateRatingRequest,
  UpdateRatingResponse,
  UpdateSceneRatingParams,
  UpdatePerformerRatingParams,
  UpdateStudioRatingParams,
  UpdateTagRatingParams,
  UpdateGalleryRatingParams,
  UpdateGroupRatingParams,
  UpdateImageRatingParams,
  ApiErrorResponse,
} from "../types/api/index.js";
import prisma from "../prisma/singleton.js";
import { stashInstanceManager } from "../services/StashInstanceManager.js";
import { logger } from "../utils/logger.js";
import { getEntityInstanceId } from "../utils/entityInstanceId.js";

/**
 * IMPORTANT: Rating and Favorite Sync Policy
 *
 * When user.syncToStash is enabled:
 * - RATINGS: Will sync to Stash (OVERWRITES - last write wins)
 * - FAVORITES: Will sync to Stash for entities that support it
 *   (Scene, Performer, Studio, Gallery, Group support favorite in Stash)
 *   (Tags support favorite, Images do NOT support favorite in Stash)
 *
 * WARNING for multi-user setups:
 * - O Counters AGGREGATE (multiple users increment the same counter)
 * - Ratings OVERWRITE (last user to rate wins, no aggregation)
 * - Be cautious enabling syncToStash for multiple users
 *
 * Entity Support Matrix:
 * - Scene: rating100 ✓, favorite ✓ (not synced - use o_counter instead)
 * - Performer: rating100 ✓, favorite ✓
 * - Studio: rating100 ✓, favorite ✓
 * - Tag: NO rating100 ✗, favorite ✓
 * - Gallery: rating100 ✓, favorite ✗ (Stash doesn't support)
 * - Group: rating100 ✓, favorite ✗ (Stash doesn't support)
 * - Image: rating100 ✓, favorite ✗ (Stash doesn't support)
 */

/**
 * Update rating and/or favorite for a scene
 * Syncs rating to Stash if user.syncToStash is enabled (favorite NOT synced for scenes)
 */
export async function updateSceneRating(
  req: TypedAuthRequest<UpdateRatingRequest, UpdateSceneRatingParams>,
  res: TypedResponse<UpdateRatingResponse | ApiErrorResponse>
) {
  try {
    const userId = req.user?.id;
    const { sceneId } = req.params;
    const { rating, favorite } = req.body;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!sceneId) {
      return res.status(400).json({ error: "Missing sceneId" });
    }

    // Validate rating if provided
    if (rating !== undefined && rating !== null) {
      if (typeof rating !== "number" || rating < 0 || rating > 100) {
        return res
          .status(400)
          .json({ error: "Rating must be a number between 0 and 100" });
      }
    }

    // Validate favorite if provided
    if (favorite !== undefined && typeof favorite !== "boolean") {
      return res.status(400).json({ error: "Favorite must be a boolean" });
    }

    // Get user sync settings and scene instanceId
    const [user, instanceId] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { syncToStash: true },
      }),
      getEntityInstanceId('scene', sceneId),
    ]);

    // Upsert rating record in Peek DB
    const sceneRating = await prisma.sceneRating.upsert({
      where: {
        userId_instanceId_sceneId: { userId, instanceId, sceneId },
      },
      update: {
        ...(rating !== undefined && { rating }),
        ...(favorite !== undefined && { favorite }),
      },
      create: {
        userId,
        instanceId,
        sceneId,
        rating: rating ?? null,
        favorite: favorite ?? false,
      },
    });

    logger.info("Scene rating updated", { userId, sceneId, rating, favorite });


    // Sync rating to Stash if enabled (only rating, NOT favorite for scenes)
    if (user?.syncToStash && rating !== undefined) {
      try {
        const stash = stashInstanceManager.getDefault();
        await stash.sceneUpdate({
          input: {
            id: sceneId,
            rating100: rating,
          },
        });
        logger.info("Successfully synced scene rating to Stash", {
          sceneId,
          rating,
        });
      } catch (stashError) {
        logger.error("Failed to sync scene rating to Stash", {
          sceneId,
          error: stashError,
        });
        // Don't fail the request - Peek DB is source of truth
      }
    }

    res.json({
      success: true,
      rating: sceneRating,
    });
  } catch (error) {
    logger.error("Error updating scene rating", { error });
    res.status(500).json({ error: "Failed to update scene rating" });
  }
}

/**
 * Update rating and/or favorite for a performer
 * Syncs both rating and favorite to Stash if user.syncToStash is enabled
 */
export async function updatePerformerRating(
  req: TypedAuthRequest<UpdateRatingRequest, UpdatePerformerRatingParams>,
  res: TypedResponse<UpdateRatingResponse | ApiErrorResponse>
) {
  try {
    const userId = req.user?.id;
    const { performerId } = req.params;
    const { rating, favorite } = req.body;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!performerId) {
      return res.status(400).json({ error: "Missing performerId" });
    }

    // Validate rating if provided
    if (rating !== undefined && rating !== null) {
      if (typeof rating !== "number" || rating < 0 || rating > 100) {
        return res
          .status(400)
          .json({ error: "Rating must be a number between 0 and 100" });
      }
    }

    // Validate favorite if provided
    if (favorite !== undefined && typeof favorite !== "boolean") {
      return res.status(400).json({ error: "Favorite must be a boolean" });
    }

    // Get user sync settings and performer instanceId
    const [user, instanceId] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { syncToStash: true },
      }),
      getEntityInstanceId('performer', performerId),
    ]);

    // Upsert rating record in Peek DB
    const performerRating = await prisma.performerRating.upsert({
      where: {
        userId_instanceId_performerId: { userId, instanceId, performerId },
      },
      update: {
        ...(rating !== undefined && { rating }),
        ...(favorite !== undefined && { favorite }),
      },
      create: {
        userId,
        instanceId,
        performerId,
        rating: rating ?? null,
        favorite: favorite ?? false,
      },
    });

    logger.info("Performer rating updated", {
      userId,
      performerId,
      rating,
      favorite,
    });


    // Sync to Stash if enabled (performer supports both rating and favorite)
    if (user?.syncToStash && (rating !== undefined || favorite !== undefined)) {
      try {
        const stash = stashInstanceManager.getDefault();
        await stash.performerUpdate({
          input: {
            id: performerId,
            ...(rating !== undefined && { rating100: rating }),
            ...(favorite !== undefined && { favorite }),
          },
        });
        logger.info("Successfully synced performer rating to Stash", {
          performerId,
          rating,
          favorite,
        });
      } catch (stashError) {
        logger.error("Failed to sync performer rating to Stash", {
          performerId,
          error: stashError,
        });
      }
    }

    res.json({
      success: true,
      rating: performerRating,
    });
  } catch (error) {
    logger.error("Error updating performer rating", { error });
    res.status(500).json({ error: "Failed to update performer rating" });
  }
}

/**
 * Update rating and/or favorite for a studio
 * Syncs both rating and favorite to Stash if user.syncToStash is enabled
 */
export async function updateStudioRating(
  req: TypedAuthRequest<UpdateRatingRequest, UpdateStudioRatingParams>,
  res: TypedResponse<UpdateRatingResponse | ApiErrorResponse>
) {
  try {
    const userId = req.user?.id;
    const { studioId } = req.params;
    const { rating, favorite } = req.body;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!studioId) {
      return res.status(400).json({ error: "Missing studioId" });
    }

    // Validate rating if provided
    if (rating !== undefined && rating !== null) {
      if (typeof rating !== "number" || rating < 0 || rating > 100) {
        return res
          .status(400)
          .json({ error: "Rating must be a number between 0 and 100" });
      }
    }

    // Validate favorite if provided
    if (favorite !== undefined && typeof favorite !== "boolean") {
      return res.status(400).json({ error: "Favorite must be a boolean" });
    }

    // Get user sync settings and studio instanceId
    const [user, instanceId] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { syncToStash: true },
      }),
      getEntityInstanceId('studio', studioId),
    ]);

    // Upsert rating record in Peek DB
    const studioRating = await prisma.studioRating.upsert({
      where: {
        userId_instanceId_studioId: { userId, instanceId, studioId },
      },
      update: {
        ...(rating !== undefined && { rating }),
        ...(favorite !== undefined && { favorite }),
      },
      create: {
        userId,
        instanceId,
        studioId,
        rating: rating ?? null,
        favorite: favorite ?? false,
      },
    });

    logger.info("Studio rating updated", {
      userId,
      studioId,
      rating,
      favorite,
    });


    // Sync to Stash if enabled (studio supports both rating and favorite)
    if (user?.syncToStash && (rating !== undefined || favorite !== undefined)) {
      try {
        const stash = stashInstanceManager.getDefault();
        await stash.studioUpdate({
          input: {
            id: studioId,
            ...(rating !== undefined && { rating100: rating }),
            ...(favorite !== undefined && { favorite }),
          },
        });
        logger.info("Successfully synced studio rating to Stash", {
          studioId,
          rating,
          favorite,
        });
      } catch (stashError) {
        logger.error("Failed to sync studio rating to Stash", {
          studioId,
          error: stashError,
        });
      }
    }

    res.json({
      success: true,
      rating: studioRating,
    });
  } catch (error) {
    logger.error("Error updating studio rating", { error });
    res.status(500).json({ error: "Failed to update studio rating" });
  }
}

/**
 * Update rating and/or favorite for a tag
 * Syncs favorite only to Stash if user.syncToStash is enabled (tags don't support rating in Stash)
 */
export async function updateTagRating(
  req: TypedAuthRequest<UpdateRatingRequest, UpdateTagRatingParams>,
  res: TypedResponse<UpdateRatingResponse | ApiErrorResponse>
) {
  try {
    const userId = req.user?.id;
    const { tagId } = req.params;
    const { rating, favorite } = req.body;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!tagId) {
      return res.status(400).json({ error: "Missing tagId" });
    }

    // Validate rating if provided
    if (rating !== undefined && rating !== null) {
      if (typeof rating !== "number" || rating < 0 || rating > 100) {
        return res
          .status(400)
          .json({ error: "Rating must be a number between 0 and 100" });
      }
    }

    // Validate favorite if provided
    if (favorite !== undefined && typeof favorite !== "boolean") {
      return res.status(400).json({ error: "Favorite must be a boolean" });
    }

    // Get user sync settings and tag instanceId
    const [user, instanceId] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { syncToStash: true },
      }),
      getEntityInstanceId('tag', tagId),
    ]);

    // Upsert rating record in Peek DB
    const tagRating = await prisma.tagRating.upsert({
      where: {
        userId_instanceId_tagId: { userId, instanceId, tagId },
      },
      update: {
        ...(rating !== undefined && { rating }),
        ...(favorite !== undefined && { favorite }),
      },
      create: {
        userId,
        instanceId,
        tagId,
        rating: rating ?? null,
        favorite: favorite ?? false,
      },
    });

    logger.info("Tag rating updated", { userId, tagId, rating, favorite });


    // Sync favorite only to Stash if enabled (tags don't have rating100 in Stash)
    if (user?.syncToStash && favorite !== undefined) {
      try {
        const stash = stashInstanceManager.getDefault();
        await stash.tagUpdate({
          input: {
            id: tagId,
            favorite,
          },
        });
        logger.info("Successfully synced tag favorite to Stash", {
          tagId,
          favorite,
        });
      } catch (stashError) {
        logger.error("Failed to sync tag favorite to Stash", {
          tagId,
          error: stashError,
        });
      }
    }

    res.json({
      success: true,
      rating: tagRating,
    });
  } catch (error) {
    logger.error("Error updating tag rating", { error });
    res.status(500).json({ error: "Failed to update tag rating" });
  }
}

/**
 * Update rating and/or favorite for a gallery
 * Syncs rating only to Stash if user.syncToStash is enabled (galleries don't support favorite in Stash)
 */
export async function updateGalleryRating(
  req: TypedAuthRequest<UpdateRatingRequest, UpdateGalleryRatingParams>,
  res: TypedResponse<UpdateRatingResponse | ApiErrorResponse>
) {
  try {
    const userId = req.user?.id;
    const { galleryId } = req.params;
    const { rating, favorite } = req.body;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!galleryId) {
      return res.status(400).json({ error: "Missing galleryId" });
    }

    // Validate rating if provided
    if (rating !== undefined && rating !== null) {
      if (typeof rating !== "number" || rating < 0 || rating > 100) {
        return res
          .status(400)
          .json({ error: "Rating must be a number between 0 and 100" });
      }
    }

    // Validate favorite if provided
    if (favorite !== undefined && typeof favorite !== "boolean") {
      return res.status(400).json({ error: "Favorite must be a boolean" });
    }

    // Get user sync settings and gallery instanceId
    const [user, instanceId] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { syncToStash: true },
      }),
      getEntityInstanceId('gallery', galleryId),
    ]);

    // Upsert rating record in Peek DB
    const galleryRating = await prisma.galleryRating.upsert({
      where: {
        userId_instanceId_galleryId: { userId, instanceId, galleryId },
      },
      update: {
        ...(rating !== undefined && { rating }),
        ...(favorite !== undefined && { favorite }),
      },
      create: {
        userId,
        instanceId,
        galleryId,
        rating: rating ?? null,
        favorite: favorite ?? false,
      },
    });

    logger.info("Gallery rating updated", {
      userId,
      galleryId,
      rating,
      favorite,
    });


    // Sync rating only to Stash if enabled (galleries don't have favorite in Stash)
    if (user?.syncToStash && rating !== undefined) {
      try {
        const stash = stashInstanceManager.getDefault();
        await stash.galleryUpdate({
          input: {
            id: galleryId,
            rating100: rating,
          },
        });
        logger.info("Successfully synced gallery rating to Stash", {
          galleryId,
          rating,
        });
      } catch (stashError) {
        logger.error("Failed to sync gallery rating to Stash", {
          galleryId,
          error: stashError,
        });
      }
    }

    res.json({
      success: true,
      rating: galleryRating,
    });
  } catch (error) {
    logger.error("Error updating gallery rating", { error });
    res.status(500).json({ error: "Failed to update gallery rating" });
  }
}

/**
 * Update rating and/or favorite for a group
 * Syncs rating only to Stash if user.syncToStash is enabled (groups don't support favorite in Stash)
 */
export async function updateGroupRating(
  req: TypedAuthRequest<UpdateRatingRequest, UpdateGroupRatingParams>,
  res: TypedResponse<UpdateRatingResponse | ApiErrorResponse>
) {
  try {
    const userId = req.user?.id;
    const { groupId } = req.params;
    const { rating, favorite } = req.body;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!groupId) {
      return res.status(400).json({ error: "Missing groupId" });
    }

    // Validate rating if provided
    if (rating !== undefined && rating !== null) {
      if (typeof rating !== "number" || rating < 0 || rating > 100) {
        return res
          .status(400)
          .json({ error: "Rating must be a number between 0 and 100" });
      }
    }

    // Validate favorite if provided
    if (favorite !== undefined && typeof favorite !== "boolean") {
      return res.status(400).json({ error: "Favorite must be a boolean" });
    }

    // Get user sync settings and group instanceId
    const [user, instanceId] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { syncToStash: true },
      }),
      getEntityInstanceId('group', groupId),
    ]);

    // Upsert rating record in Peek DB
    const groupRating = await prisma.groupRating.upsert({
      where: {
        userId_instanceId_groupId: { userId, instanceId, groupId },
      },
      update: {
        ...(rating !== undefined && { rating }),
        ...(favorite !== undefined && { favorite }),
      },
      create: {
        userId,
        instanceId,
        groupId,
        rating: rating ?? null,
        favorite: favorite ?? false,
      },
    });

    logger.info("Group rating updated", { userId, groupId, rating, favorite });


    // Sync rating only to Stash if enabled (groups don't have favorite in Stash)
    if (user?.syncToStash && rating !== undefined) {
      try {
        const stash = stashInstanceManager.getDefault();
        await stash.groupUpdate({
          input: {
            id: groupId,
            rating100: rating,
          },
        });
        logger.info("Successfully synced group rating to Stash", {
          groupId,
          rating,
        });
      } catch (stashError) {
        logger.error("Failed to sync group rating to Stash", {
          groupId,
          error: stashError,
        });
      }
    }

    res.json({
      success: true,
      rating: groupRating,
    });
  } catch (error) {
    logger.error("Error updating group rating", { error });
    res.status(500).json({ error: "Failed to update group rating" });
  }
}

/**
 * Update rating and/or favorite for an image
 * Syncs rating only to Stash if user.syncToStash is enabled (images don't support favorite in Stash)
 */
export async function updateImageRating(
  req: TypedAuthRequest<UpdateRatingRequest, UpdateImageRatingParams>,
  res: TypedResponse<UpdateRatingResponse | ApiErrorResponse>
) {
  try {
    const userId = req.user?.id;
    const { imageId } = req.params;
    const { rating, favorite } = req.body;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!imageId) {
      return res.status(400).json({ error: "Missing imageId" });
    }

    // Validate rating if provided
    if (rating !== undefined && rating !== null) {
      if (typeof rating !== "number" || rating < 0 || rating > 100) {
        return res
          .status(400)
          .json({ error: "Rating must be a number between 0 and 100" });
      }
    }

    // Validate favorite if provided
    if (favorite !== undefined && typeof favorite !== "boolean") {
      return res.status(400).json({ error: "Favorite must be a boolean" });
    }

    // Get user sync settings and image instanceId
    const [user, instanceId] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { syncToStash: true },
      }),
      getEntityInstanceId('image', imageId),
    ]);

    // Upsert rating record in Peek DB
    const imageRating = await prisma.imageRating.upsert({
      where: {
        userId_instanceId_imageId: { userId, instanceId, imageId },
      },
      update: {
        ...(rating !== undefined && { rating }),
        ...(favorite !== undefined && { favorite }),
      },
      create: {
        userId,
        instanceId,
        imageId,
        rating: rating ?? null,
        favorite: favorite ?? false,
      },
    });

    logger.info("Image rating updated", { userId, imageId, rating, favorite });


    // Sync rating only to Stash if enabled (images don't have favorite in Stash)
    if (user?.syncToStash && rating !== undefined) {
      try {
        const stash = stashInstanceManager.getDefault();
        await stash.imageUpdate({
          input: {
            id: imageId,
            rating100: rating,
          },
        });
        logger.info("Successfully synced image rating to Stash", {
          imageId,
          rating,
        });
      } catch (stashError) {
        logger.error("Failed to sync image rating to Stash", {
          imageId,
          error: stashError,
        });
      }
    }

    res.json({
      success: true,
      rating: imageRating,
    });
  } catch (error) {
    logger.error("Error updating image rating", { error });
    res.status(500).json({ error: "Failed to update image rating" });
  }
}
