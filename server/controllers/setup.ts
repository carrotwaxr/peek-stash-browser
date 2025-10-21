import { Request, Response } from "express";
import { pathMapper } from "../utils/pathMapping.js";
import getStash from "../stash.js";
import fs from "fs";
import { logger } from "../utils/logger.js";

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

    const libraryPaths = libraries.map((s: any) => s.path);

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
    } catch (error) {
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
    } catch (error) {
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

    res.json({
      setupComplete: hasMapping,
      mappingCount: mappings.length,
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
