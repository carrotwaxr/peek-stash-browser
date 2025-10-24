import { Request, Response } from 'express';
import prisma from '../prisma/singleton.js';
import { logger } from '../utils/logger.js';

interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    username: string;
    role: string;
  };
}

/**
 * Update rating and/or favorite for a scene
 */
export async function updateSceneRating(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.id;
    const { sceneId } = req.params;
    const { rating, favorite } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!sceneId) {
      return res.status(400).json({ error: 'Missing sceneId' });
    }

    // Validate rating if provided
    if (rating !== undefined && rating !== null) {
      if (typeof rating !== 'number' || rating < 0 || rating > 100) {
        return res.status(400).json({ error: 'Rating must be a number between 0 and 100' });
      }
    }

    // Validate favorite if provided
    if (favorite !== undefined && typeof favorite !== 'boolean') {
      return res.status(400).json({ error: 'Favorite must be a boolean' });
    }

    //  Upsert rating record
    const sceneRating = await prisma.sceneRating.upsert({
      where: {
        userId_sceneId: { userId, sceneId },
      },
      update: {
        ...(rating !== undefined && { rating }),
        ...(favorite !== undefined && { favorite }),
      },
      create: {
        userId,
        sceneId,
        rating: rating ?? null,
        favorite: favorite ?? false,
      },
    });

    logger.info('Scene rating updated', { userId, sceneId, rating, favorite });

    res.json({
      success: true,
      rating: sceneRating,
    });
  } catch (error) {
    logger.error('Error updating scene rating', { error });
    res.status(500).json({ error: 'Failed to update scene rating' });
  }
}

/**
 * Update rating and/or favorite for a performer
 */
export async function updatePerformerRating(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.id;
    const { performerId } = req.params;
    const { rating, favorite } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!performerId) {
      return res.status(400).json({ error: 'Missing performerId' });
    }

    // Validate rating if provided
    if (rating !== undefined && rating !== null) {
      if (typeof rating !== 'number' || rating < 0 || rating > 100) {
        return res.status(400).json({ error: 'Rating must be a number between 0 and 100' });
      }
    }

    // Validate favorite if provided
    if (favorite !== undefined && typeof favorite !== 'boolean') {
      return res.status(400).json({ error: 'Favorite must be a boolean' });
    }

    // Upsert rating record
    const performerRating = await prisma.performerRating.upsert({
      where: {
        userId_performerId: { userId, performerId },
      },
      update: {
        ...(rating !== undefined && { rating }),
        ...(favorite !== undefined && { favorite }),
      },
      create: {
        userId,
        performerId,
        rating: rating ?? null,
        favorite: favorite ?? false,
      },
    });

    logger.info('Performer rating updated', { userId, performerId, rating, favorite });

    res.json({
      success: true,
      rating: performerRating,
    });
  } catch (error) {
    logger.error('Error updating performer rating', { error });
    res.status(500).json({ error: 'Failed to update performer rating' });
  }
}

/**
 * Update rating and/or favorite for a studio
 */
export async function updateStudioRating(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.id;
    const { studioId } = req.params;
    const { rating, favorite } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!studioId) {
      return res.status(400).json({ error: 'Missing studioId' });
    }

    // Validate rating if provided
    if (rating !== undefined && rating !== null) {
      if (typeof rating !== 'number' || rating < 0 || rating > 100) {
        return res.status(400).json({ error: 'Rating must be a number between 0 and 100' });
      }
    }

    // Validate favorite if provided
    if (favorite !== undefined && typeof favorite !== 'boolean') {
      return res.status(400).json({ error: 'Favorite must be a boolean' });
    }

    // Upsert rating record
    const studioRating = await prisma.studioRating.upsert({
      where: {
        userId_studioId: { userId, studioId },
      },
      update: {
        ...(rating !== undefined && { rating }),
        ...(favorite !== undefined && { favorite }),
      },
      create: {
        userId,
        studioId,
        rating: rating ?? null,
        favorite: favorite ?? false,
      },
    });

    logger.info('Studio rating updated', { userId, studioId, rating, favorite });

    res.json({
      success: true,
      rating: studioRating,
    });
  } catch (error) {
    logger.error('Error updating studio rating', { error });
    res.status(500).json({ error: 'Failed to update studio rating' });
  }
}

/**
 * Update rating and/or favorite for a tag
 */
export async function updateTagRating(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.id;
    const { tagId } = req.params;
    const { rating, favorite } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!tagId) {
      return res.status(400).json({ error: 'Missing tagId' });
    }

    // Validate rating if provided
    if (rating !== undefined && rating !== null) {
      if (typeof rating !== 'number' || rating < 0 || rating > 100) {
        return res.status(400).json({ error: 'Rating must be a number between 0 and 100' });
      }
    }

    // Validate favorite if provided
    if (favorite !== undefined && typeof favorite !== 'boolean') {
      return res.status(400).json({ error: 'Favorite must be a boolean' });
    }

    // Upsert rating record
    const tagRating = await prisma.tagRating.upsert({
      where: {
        userId_tagId: { userId, tagId },
      },
      update: {
        ...(rating !== undefined && { rating }),
        ...(favorite !== undefined && { favorite }),
      },
      create: {
        userId,
        tagId,
        rating: rating ?? null,
        favorite: favorite ?? false,
      },
    });

    logger.info('Tag rating updated', { userId, tagId, rating, favorite });

    res.json({
      success: true,
      rating: tagRating,
    });
  } catch (error) {
    logger.error('Error updating tag rating', { error });
    res.status(500).json({ error: 'Failed to update tag rating' });
  }
}
