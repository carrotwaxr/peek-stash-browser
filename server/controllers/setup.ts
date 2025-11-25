import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { Request, Response } from "express";
import { logger } from "../utils/logger.js";

const prisma = new PrismaClient();

/**
 * Carousel preference configuration for user home page
 */
interface CarouselPreference {
  id: string;
  enabled: boolean;
  order: number;
}

// Default carousel preferences for new users
const getDefaultCarouselPreferences = (): CarouselPreference[] => [
  { id: "highRatedScenes", enabled: true, order: 0 },
  { id: "recentlyAddedScenes", enabled: true, order: 1 },
  { id: "longScenes", enabled: true, order: 2 },
  { id: "highBitrateScenes", enabled: true, order: 3 },
  { id: "barelyLegalScenes", enabled: true, order: 4 },
  { id: "favoritePerformerScenes", enabled: true, order: 5 },
  { id: "favoriteStudioScenes", enabled: true, order: 6 },
  { id: "favoriteTagScenes", enabled: true, order: 7 },
];

/**
 * Check setup status (for determining if wizard is needed)
 * Currently just checks if at least one user exists
 */
export const getSetupStatus = async (req: Request, res: Response) => {
  try {
    // Check if at least one user exists
    const userCount = await prisma.user.count();
    const hasUser = userCount > 0;

    // Setup is complete if users exist
    // Future: Will also check for Stash instance configuration
    const setupComplete = hasUser;

    res.json({
      setupComplete,
      hasUsers: hasUser,
      userCount,
    });
  } catch (error) {
    logger.error("Failed to get setup status", { error });
    res.status(500).json({
      error: "Failed to get setup status",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Create first admin user (public endpoint for setup wizard)
 * Only works if NO users exist yet
 */
export const createFirstAdmin = async (req: Request, res: Response) => {
  try {
    // Check if any users already exist
    const userCount = await prisma.user.count();

    if (userCount > 0) {
      return res.status(403).json({
        error:
          "Users already exist. Use the regular user management to create additional users.",
      });
    }

    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        error: "Username and password are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: "Password must be at least 6 characters",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create first admin user with default carousel preferences
    const newUser = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        role: "ADMIN",
        carouselPreferences: getDefaultCarouselPreferences() as never,
      },
      select: {
        id: true,
        username: true,
        role: true,
        createdAt: true,
      },
    });

    logger.info("First admin user created via setup wizard", {
      username: newUser.username,
    });

    res.status(201).json({
      success: true,
      user: newUser,
    });
  } catch (error) {
    logger.error("Failed to create first admin user", { error });
    res.status(500).json({
      error: "Failed to create admin user",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
