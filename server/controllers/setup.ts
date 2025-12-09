import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { Request, Response } from "express";
import { StashApp } from "stashapp-api";
import { stashSyncService } from "../services/StashSyncService.js";
import { stashInstanceManager } from "../services/StashInstanceManager.js";
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
 * Checks for both user existence and Stash instance configuration
 */
export const getSetupStatus = async (req: Request, res: Response) => {
  try {
    // Check if at least one user exists
    const userCount = await prisma.user.count();
    const hasUsers = userCount > 0;

    // Check if at least one Stash instance is configured
    const stashInstanceCount = await prisma.stashInstance.count({
      where: { enabled: true },
    });
    const hasStashInstance = stashInstanceCount > 0;

    // Setup is complete if both users and Stash instance exist
    const setupComplete = hasUsers && hasStashInstance;

    res.json({
      setupComplete,
      hasUsers,
      hasStashInstance,
      userCount,
      stashInstanceCount,
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

/**
 * Test connection to a Stash server
 * POST /api/setup/test-stash-connection
 */
export const testStashConnection = async (req: Request, res: Response) => {
  try {
    const { url, apiKey } = req.body;

    if (!url || !apiKey) {
      return res.status(400).json({
        error: "URL and API key are required",
      });
    }

    // Validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return res.status(400).json({
        error: "Invalid URL format. Expected: http://hostname:port/graphql",
      });
    }

    logger.info("Testing Stash connection", {
      url,
      urlLength: url?.length,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      apiKeyLength: apiKey?.length,
      apiKeyPreview: apiKey ? `${apiKey.substring(0, 20)}...` : "NOT SET",
    });

    // Try to connect to Stash
    logger.debug("Initializing StashApp with provided credentials");
    const testStash = StashApp.init({ url, apiKey });
    logger.debug("StashApp initialized, calling configuration()");

    try {
      const result = await testStash.configuration();

      if (result && result.configuration) {
        logger.info("Stash connection test successful");
        res.json({
          success: true,
          message: "Connection successful",
        });
      } else {
        res.status(500).json({
          success: false,
          error: "Connected but received empty configuration",
        });
      }
    } catch (error) {
      // Get the full error details including cause
      const errorMessage = error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errorCause = error instanceof Error && (error as any).cause ? String((error as any).cause) : "";
      const fullError = errorCause ? `${errorMessage}: ${errorCause}` : errorMessage;

      logger.error("Stash connection test failed", {
        error: errorMessage,
        cause: errorCause,
        fullError
      });

      // Provide user-friendly error messages
      let friendlyMessage = "Connection failed";
      const checkString = fullError.toLowerCase();

      if (checkString.includes("econnrefused")) {
        friendlyMessage = "Connection refused. Is Stash running?";
      } else if (checkString.includes("enotfound") || checkString.includes("getaddrinfo")) {
        friendlyMessage = "Host not found. Check the hostname.";
      } else if (checkString.includes("401") || checkString.includes("unauthorized")) {
        friendlyMessage = "Authentication failed. Check your API key.";
      } else if (checkString.includes("404")) {
        friendlyMessage = "Endpoint not found. Make sure URL ends with /graphql";
      } else if (checkString.includes("etimedout")) {
        friendlyMessage = "Connection timed out. Check network connectivity.";
      } else if (checkString.includes("fetch failed")) {
        // Generic fetch error - try to give more context
        friendlyMessage = "Network error connecting to Stash. Check the URL and ensure Stash is accessible from the server.";
      }

      res.status(400).json({
        success: false,
        error: friendlyMessage,
        details: fullError,
      });
    }
  } catch (error) {
    logger.error("Error testing Stash connection", { error });
    res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Create first Stash instance (public endpoint for setup wizard)
 * Only works if NO Stash instances exist yet
 * POST /api/setup/create-stash-instance
 */
export const createFirstStashInstance = async (req: Request, res: Response) => {
  try {
    // Check if any Stash instances already exist
    const instanceCount = await prisma.stashInstance.count();

    if (instanceCount > 0) {
      return res.status(403).json({
        error:
          "A Stash instance already exists. Use Server Settings to manage instances.",
      });
    }

    const { name, url, apiKey } = req.body;

    if (!url || !apiKey) {
      return res.status(400).json({
        error: "URL and API key are required",
      });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return res.status(400).json({
        error: "Invalid URL format. Expected: http://hostname:port/graphql",
      });
    }

    // Test connection before saving
    const testStash = StashApp.init({ url, apiKey });
    try {
      await testStash.configuration();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Stash connection validation failed", { error: errorMessage });
      return res.status(400).json({
        error: "Could not connect to Stash server",
        details: errorMessage,
      });
    }

    // Create Stash instance
    const instance = await prisma.stashInstance.create({
      data: {
        name: name || "Default",
        url,
        apiKey,
        enabled: true,
        priority: 0,
      },
      select: {
        id: true,
        name: true,
        url: true,
        enabled: true,
        createdAt: true,
      },
    });

    logger.info("First Stash instance created via setup wizard", {
      instanceId: instance.id,
      instanceName: instance.name,
    });

    // Reload the StashInstanceManager to pick up the new instance
    await stashInstanceManager.reload();

    // Initialize the Stash cache now that we have an instance
    // This runs in the background - we don't want to block the response
    logger.info("Triggering Stash cache initialization...");
    stashSyncService.fullSync().catch((err) => {
      logger.error("Failed to initialize Stash cache after instance creation", {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    res.status(201).json({
      success: true,
      instance,
    });
  } catch (error) {
    logger.error("Failed to create Stash instance", { error });
    res.status(500).json({
      error: "Failed to create Stash instance",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Get current Stash instance info (for Server Settings display)
 * GET /api/setup/stash-instance
 * Requires authentication
 */
export const getStashInstance = async (req: Request, res: Response) => {
  try {
    const instances = await prisma.stashInstance.findMany({
      select: {
        id: true,
        name: true,
        url: true,
        enabled: true,
        priority: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { priority: "asc" },
    });

    // For commit 1, we only support one instance
    const instance = instances[0] || null;

    res.json({
      instance,
      instanceCount: instances.length,
    });
  } catch (error) {
    logger.error("Failed to get Stash instance", { error });
    res.status(500).json({
      error: "Failed to get Stash instance",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Reset setup state for recovery from partial setup
 * Deletes all users and Stash instances to allow fresh setup
 * POST /api/setup/reset
 *
 * SECURITY: Only works if setup is incomplete AND there's at most 1 user.
 * This prevents accidental data loss on systems with multiple users.
 */
export const resetSetup = async (req: Request, res: Response) => {
  try {
    // Check current setup state
    const userCount = await prisma.user.count();
    const stashInstanceCount = await prisma.stashInstance.count();
    const setupComplete = userCount > 0 && stashInstanceCount > 0;

    // Strict guard: multiple users means the system is in use
    if (userCount > 1) {
      return res.status(403).json({
        error: "Cannot reset: multiple users exist. This system appears to be in use.",
      });
    }

    // Only allow reset if setup is incomplete
    if (setupComplete) {
      return res.status(403).json({
        error: "Cannot reset a fully configured system. Use Server Settings to manage configuration.",
      });
    }

    // Log BEFORE deleting for audit trail
    logger.warn("Setup reset initiated - deleting all data", {
      userCount,
      stashInstanceCount,
    });

    // Delete all users and stash instances
    await prisma.user.deleteMany({});
    await prisma.stashInstance.deleteMany({});

    logger.info("Setup state reset complete", {
      deletedUsers: userCount,
      deletedInstances: stashInstanceCount,
    });

    res.json({
      success: true,
      message: "Setup state has been reset. You can now start fresh.",
      deleted: {
        users: userCount,
        stashInstances: stashInstanceCount,
      },
    });
  } catch (error) {
    logger.error("Failed to reset setup state", { error });
    res.status(500).json({
      error: "Failed to reset setup state",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
