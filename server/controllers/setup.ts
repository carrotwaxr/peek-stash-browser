import { Request, Response } from "express";
import { pathMapper } from "../utils/pathMapping.js";
import getStash from "../stash.js";
import fs from "fs";
import { logger } from "../utils/logger.js";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/**
 * Stash library configuration from Stash GraphQL API
 */
interface StashLibrary {
  path: string;
}

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
 * Get all configured path mappings
 */
export const getPathMappings = async (req: Request, res: Response) => {
  try {
    const mappings = pathMapper.getMappings();
    res.json({ mappings });
  } catch (error) {
    logger.error("Failed to get path mappings", { error });
    res.status(500).json({
      error: "Failed to get path mappings",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Add a new path mapping
 */
export const addPathMapping = async (req: Request, res: Response) => {
  try {
    const { stashPath, peekPath } = req.body;

    if (!stashPath || !peekPath) {
      return res.status(400).json({
        error: "Missing required fields: stashPath, peekPath",
      });
    }

    const mapping = await pathMapper.addMapping({ stashPath, peekPath });

    res.json({
      success: true,
      mapping,
    });
  } catch (error) {
    logger.error("Failed to add path mapping", { error });
    res.status(500).json({
      error: "Failed to add path mapping",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Update an existing path mapping
 */
export const updatePathMapping = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { stashPath, peekPath } = req.body;

    if (!stashPath || !peekPath) {
      return res.status(400).json({
        error: "Missing required fields: stashPath, peekPath",
      });
    }

    const mapping = await pathMapper.updateMapping(parseInt(id), {
      stashPath,
      peekPath,
    });

    res.json({
      success: true,
      mapping,
    });
  } catch (error) {
    logger.error("Failed to update path mapping", { error });
    res.status(500).json({
      error: "Failed to update path mapping",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Delete a path mapping
 */
export const deletePathMapping = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pathMapper.deleteMapping(parseInt(id));

    res.json({
      success: true,
    });
  } catch (error) {
    logger.error("Failed to delete path mapping", { error });
    res.status(500).json({
      error: "Failed to delete path mapping",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Discover Stash library paths via GraphQL Configuration API
 */
export const discoverStashLibraries = async (req: Request, res: Response) => {
  try {
    const stash = getStash();

    const response = await stash.configuration();

    const stashes = response?.configuration?.general?.stashes || [];

    // Return all libraries (both video and image)
    // Peek needs access to all Stash content (videos, images, screenshots, etc.)
    const libraries = stashes;

    const libraryPaths = libraries.map((s: StashLibrary) => s.path);

    logger.info("Discovered Stash library paths", { paths: libraryPaths });

    res.json({
      success: true,
      libraries: libraries,
      paths: libraryPaths,
    });
  } catch (error) {
    logger.error("Failed to discover Stash libraries", { error });
    res.status(500).json({
      error: "Failed to discover Stash libraries",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Test if a path exists and is readable
 */
export const testPath = async (req: Request, res: Response) => {
  try {
    const { path: testPath } = req.body;

    if (!testPath) {
      return res.status(400).json({
        error: "Missing required field: path",
      });
    }

    // Check if path exists
    const exists = fs.existsSync(testPath);

    if (!exists) {
      return res.json({
        success: true,
        exists: false,
        readable: false,
        message: "Path does not exist",
      });
    }

    // Check if path is readable
    let readable = false;
    try {
      fs.accessSync(testPath, fs.constants.R_OK);
      readable = true;
    } catch {
      readable = false;
    }

    // Try to list directory contents (additional validation)
    let isDirectory = false;
    let fileCount = 0;
    try {
      const stats = fs.statSync(testPath);
      isDirectory = stats.isDirectory();

      if (isDirectory) {
        const files = fs.readdirSync(testPath);
        fileCount = files.length;
      }
    } catch {
      // Not a directory or can't read
    }

    res.json({
      success: true,
      exists: true,
      readable,
      isDirectory,
      fileCount: isDirectory ? fileCount : null,
      message: readable
        ? isDirectory
          ? `Directory exists and is readable (${fileCount} items)`
          : "File exists and is readable"
        : "Path exists but is not readable (check permissions)",
    });
  } catch (error) {
    logger.error("Failed to test path", { error });
    res.status(500).json({
      error: "Failed to test path",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Check setup status (for determining if wizard is needed)
 */
export const getSetupStatus = async (req: Request, res: Response) => {
  try {
    const hasMapping = pathMapper.hasMapping();
    const mappings = pathMapper.getMappings();

    // Check if at least one user exists
    const userCount = await prisma.user.count();
    const hasUser = userCount > 0;

    // Setup is complete only if BOTH path mappings AND users exist
    const setupComplete = hasMapping && hasUser;

    res.json({
      setupComplete,
      hasPathMappings: hasMapping,
      hasUsers: hasUser,
      mappingCount: mappings.length,
      userCount,
      mappings,
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
