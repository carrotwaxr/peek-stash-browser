import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth.js";
import prisma from "../prisma/singleton.js";
import { exclusionComputationService } from "../services/ExclusionComputationService.js";
import { logger } from "../utils/logger.js";

/**
 * Carousel preference configuration
 */
interface CarouselPreference {
  id: string;
  enabled: boolean;
  order: number;
}

/**
 * Filter preset for scene/performer/studio/tag filtering
 */
interface FilterPreset {
  id: string;
  name: string;
  filters: unknown;
  sort?: string;
  direction?: string;
  createdAt?: string;
  [key: string]: unknown;
}

/**
 * User filter presets collection
 */
interface FilterPresets {
  scene?: FilterPreset[];
  performer?: FilterPreset[];
  studio?: FilterPreset[];
  tag?: FilterPreset[];
  group?: FilterPreset[];
  gallery?: FilterPreset[];
  [key: string]: FilterPreset[] | undefined;
}

/**
 * Default filter presets (preset IDs for each artifact type)
 */
interface DefaultFilterPresets {
  scene?: string;
  performer?: string;
  studio?: string;
  tag?: string;
  group?: string;
  gallery?: string;
  [key: string]: string | undefined;
}

/**
 * Sync updates for entity ratings/favorites
 */
interface SyncUpdates {
  rating?: number | null;
  rating100?: number | null;
  favorite?: boolean;
  [key: string]: unknown;
}

/**
 * User content restriction from database
 */
interface UserRestriction {
  id?: number;
  userId?: string;
  entityType: string;
  mode: string;
  entityIds: string[] | string;
  restrictEmpty?: boolean;
  [key: string]: unknown;
}

// Inline the default carousel preferences to avoid ESM loading issues
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
 * Get user settings
 */
export const getUserSettings = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        role: true,
        preferredQuality: true,
        preferredPlaybackMode: true,
        preferredPreviewQuality: true,
        enableCast: true,
        theme: true,
        carouselPreferences: true,
        navPreferences: true,
        filterPresets: true,
        minimumPlayPercent: true,
        syncToStash: true,
        hideConfirmationDisabled: true,
        unitPreference: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      settings: {
        preferredQuality: user.preferredQuality,
        preferredPlaybackMode: user.preferredPlaybackMode,
        preferredPreviewQuality: user.preferredPreviewQuality,
        enableCast: user.enableCast,
        theme: user.theme,
        carouselPreferences:
          user.carouselPreferences || getDefaultCarouselPreferences(),
        navPreferences: user.navPreferences || null,
        minimumPlayPercent: user.minimumPlayPercent,
        syncToStash: user.syncToStash,
        hideConfirmationDisabled: user.hideConfirmationDisabled,
        unitPreference: user.unitPreference || "metric",
      },
    });
  } catch (error) {
    console.error("Error getting user settings:", error);
    res.status(500).json({ error: "Failed to get user settings" });
  }
};

/**
 * Update user settings
 */
export const updateUserSettings = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const currentUserId = req.user?.id;
    const currentUserRole = req.user?.role;

    if (!currentUserId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Determine target user ID
    // If userId param provided (admin updating another user), use that
    // Otherwise, user is updating their own settings
    let targetUserId = currentUserId;
    if (req.params.userId) {
      // Admin updating another user's settings (or admin updating themselves via ServerSettings)
      if (currentUserRole !== "ADMIN") {
        return res
          .status(403)
          .json({ error: "Only admins can update other users' settings" });
      }
      targetUserId = parseInt(req.params.userId);
    }

    const {
      preferredQuality,
      preferredPlaybackMode,
      preferredPreviewQuality,
      enableCast,
      theme,
      carouselPreferences,
      navPreferences,
      minimumPlayPercent,
      syncToStash,
      unitPreference,
    } = req.body;

    // Validate values
    const validQualities = ["auto", "1080p", "720p", "480p", "360p"];
    const validPlaybackModes = ["auto", "direct", "transcode"];
    const validPreviewQualities = ["sprite", "webp", "mp4"];

    if (preferredQuality && !validQualities.includes(preferredQuality)) {
      return res.status(400).json({ error: "Invalid quality setting" });
    }

    if (
      preferredPlaybackMode &&
      !validPlaybackModes.includes(preferredPlaybackMode)
    ) {
      return res.status(400).json({ error: "Invalid playback mode setting" });
    }

    if (
      preferredPreviewQuality &&
      !validPreviewQualities.includes(preferredPreviewQuality)
    ) {
      return res.status(400).json({ error: "Invalid preview quality setting" });
    }

    // Validate minimumPlayPercent if provided
    if (minimumPlayPercent !== undefined) {
      if (
        typeof minimumPlayPercent !== "number" ||
        minimumPlayPercent < 0 ||
        minimumPlayPercent > 100
      ) {
        return res.status(400).json({
          error: "Minimum play percent must be a number between 0 and 100",
        });
      }
    }

    // Validate syncToStash if provided (admin only can change this)
    if (syncToStash !== undefined && typeof syncToStash !== "boolean") {
      return res.status(400).json({ error: "Sync to Stash must be a boolean" });
    }

    // Validate unitPreference if provided
    if (unitPreference !== undefined) {
      const validUnits = ["metric", "imperial"];
      if (!validUnits.includes(unitPreference)) {
        return res
          .status(400)
          .json({ error: "Unit preference must be 'metric' or 'imperial'" });
      }
    }

    // Validate carousel preferences if provided
    if (carouselPreferences !== undefined) {
      if (!Array.isArray(carouselPreferences)) {
        return res
          .status(400)
          .json({ error: "Carousel preferences must be an array" });
      }

      // Validate each carousel preference
      for (const pref of carouselPreferences) {
        if (
          typeof pref.id !== "string" ||
          typeof pref.enabled !== "boolean" ||
          typeof pref.order !== "number"
        ) {
          return res
            .status(400)
            .json({ error: "Invalid carousel preference format" });
        }
      }
    }

    // Validate navigation preferences if provided
    if (navPreferences !== undefined) {
      if (!Array.isArray(navPreferences)) {
        return res
          .status(400)
          .json({ error: "Navigation preferences must be an array" });
      }

      // Validate each navigation preference
      for (const pref of navPreferences) {
        if (
          typeof pref.id !== "string" ||
          typeof pref.enabled !== "boolean" ||
          typeof pref.order !== "number"
        ) {
          return res
            .status(400)
            .json({ error: "Invalid navigation preference format" });
        }
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: {
        ...(preferredQuality !== undefined && { preferredQuality }),
        ...(preferredPlaybackMode !== undefined && { preferredPlaybackMode }),
        ...(preferredPreviewQuality !== undefined && {
          preferredPreviewQuality,
        }),
        ...(enableCast !== undefined && { enableCast }),
        ...(theme !== undefined && { theme }),
        ...(carouselPreferences !== undefined && { carouselPreferences }),
        ...(navPreferences !== undefined && { navPreferences }),
        ...(minimumPlayPercent !== undefined && { minimumPlayPercent }),
        ...(syncToStash !== undefined && { syncToStash }),
        ...(unitPreference !== undefined && { unitPreference }),
      },
      select: {
        id: true,
        username: true,
        role: true,
        preferredQuality: true,
        preferredPlaybackMode: true,
        enableCast: true,
        theme: true,
        carouselPreferences: true,
        navPreferences: true,
        minimumPlayPercent: true,
        syncToStash: true,
      },
    });

    res.json({
      success: true,
      settings: {
        preferredQuality: updatedUser.preferredQuality,
        preferredPlaybackMode: updatedUser.preferredPlaybackMode,
        theme: updatedUser.theme,
        carouselPreferences:
          updatedUser.carouselPreferences || getDefaultCarouselPreferences(),
        navPreferences: updatedUser.navPreferences || null,
        minimumPlayPercent: updatedUser.minimumPlayPercent,
        syncToStash: updatedUser.syncToStash,
      },
    });
  } catch (error) {
    console.error("Error updating user settings:", error);
    res.status(500).json({ error: "Failed to update user settings" });
  }
};

/**
 * Change user password
 */
export const changePassword = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ error: "Current password and new password are required" });
    }

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ error: "New password must be at least 6 characters" });
    }

    // Get current user with password
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    res.json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    console.error("Error changing password:", error);
    res.status(500).json({ error: "Failed to change password" });
  }
};

/**
 * Get all users (admin only)
 */
export const getAllUsers = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Check if user is admin
    if (req.user?.role !== "ADMIN") {
      return res
        .status(403)
        .json({ error: "Forbidden: Admin access required" });
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        syncToStash: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json({ users });
  } catch (error) {
    console.error("Error getting all users:", error);
    res.status(500).json({ error: "Failed to get users" });
  }
};

/**
 * Create new user (admin only)
 */
export const createUser = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Check if user is admin
    if (req.user?.role !== "ADMIN") {
      return res
        .status(403)
        .json({ error: "Forbidden: Admin access required" });
    }

    const { username, password, role } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ error: "Username and password are required" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });
    }

    if (role && role !== "ADMIN" && role !== "USER") {
      return res
        .status(400)
        .json({ error: "Role must be either ADMIN or USER" });
    }

    // Check if username already exists
    const existingUser = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUser) {
      return res.status(409).json({ error: "Username already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user with default carousel preferences
    const newUser = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        role: role || "USER",
        carouselPreferences: getDefaultCarouselPreferences() as never,
      },
      select: {
        id: true,
        username: true,
        role: true,
        createdAt: true,
      },
    });

    res.status(201).json({ success: true, user: newUser });
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({ error: "Failed to create user" });
  }
};

/**
 * Delete user (admin only)
 */
export const deleteUser = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Check if user is admin
    if (req.user?.role !== "ADMIN") {
      return res
        .status(403)
        .json({ error: "Forbidden: Admin access required" });
    }

    const { userId } = req.params;
    const userIdInt = parseInt(userId, 10);

    if (isNaN(userIdInt)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    // Prevent admin from deleting themselves
    if (userIdInt === req.user.id) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userIdInt },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Delete user (cascades will handle related data)
    await prisma.user.delete({
      where: { id: userIdInt },
    });

    res.json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Failed to delete user" });
  }
};

/**
 * Update user role (admin only)
 */
export const updateUserRole = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    // Check if user is admin
    if (req.user?.role !== "ADMIN") {
      return res
        .status(403)
        .json({ error: "Forbidden: Admin access required" });
    }

    const { userId } = req.params;
    const { role } = req.body;
    const userIdInt = parseInt(userId, 10);

    if (isNaN(userIdInt)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    if (!role || (role !== "ADMIN" && role !== "USER")) {
      return res
        .status(400)
        .json({ error: "Role must be either ADMIN or USER" });
    }

    // Prevent admin from changing their own role
    if (userIdInt === req.user.id) {
      return res.status(400).json({ error: "Cannot change your own role" });
    }

    // Update user role
    const updatedUser = await prisma.user.update({
      where: { id: userIdInt },
      data: { role },
      select: {
        id: true,
        username: true,
        role: true,
        updatedAt: true,
      },
    });

    res.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error("Error updating user role:", error);
    res.status(500).json({ error: "Failed to update user role" });
  }
};

/**
 * Get user's filter presets
 */
export const getFilterPresets = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        filterPresets: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Return empty preset structure if none exists
    const presets = user.filterPresets || {
      scene: [],
      performer: [],
      studio: [],
      tag: [],
    };

    res.json({ presets });
  } catch (error) {
    console.error("Error getting filter presets:", error);
    res.status(500).json({ error: "Failed to get filter presets" });
  }
};

/**
 * Save a new filter preset
 */
export const saveFilterPreset = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const {
      artifactType,
      context,
      name,
      filters,
      sort,
      direction,
      setAsDefault,
    } = req.body;

    // Validate required fields
    if (!artifactType || !name || !filters || !sort || !direction) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Validate artifact type
    const validTypes = [
      "scene",
      "performer",
      "studio",
      "tag",
      "group",
      "gallery",
    ];
    if (!validTypes.includes(artifactType)) {
      return res.status(400).json({ error: "Invalid artifact type" });
    }

    // Validate context if provided (used for setAsDefault)
    if (context) {
      const validContexts = [
        "scene",
        "scene_performer",
        "scene_tag",
        "scene_studio",
        "scene_group",
        "performer",
        "studio",
        "tag",
        "group",
        "gallery",
      ];
      if (!validContexts.includes(context)) {
        return res.status(400).json({ error: "Invalid context" });
      }
    }

    // Get current presets and defaults
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { filterPresets: true, defaultFilterPresets: true },
    });

    const currentPresets = (user?.filterPresets as FilterPresets | null) || {};
    const currentDefaults =
      (user?.defaultFilterPresets as DefaultFilterPresets | null) || {};

    // Create new preset
    const newPreset = {
      id: randomUUID(),
      name,
      filters,
      sort,
      direction,
      createdAt: new Date().toISOString(),
    };

    // Add preset to the appropriate artifact type array
    currentPresets[artifactType] = [
      ...(currentPresets[artifactType] || []),
      newPreset,
    ];

    // If setAsDefault is true, set this preset as default for the context
    if (setAsDefault) {
      const defaultContext = context || artifactType;
      currentDefaults[defaultContext] = newPreset.id;
    }

    // Update user
    await prisma.user.update({
      where: { id: userId },
      data: {
        filterPresets: currentPresets as never,
        defaultFilterPresets: currentDefaults as never,
      },
    });

    res.json({ success: true, preset: newPreset });
  } catch (error) {
    console.error("Error saving filter preset:", error);
    res.status(500).json({ error: "Failed to save filter preset" });
  }
};

/**
 * Delete a filter preset
 */
export const deleteFilterPreset = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { artifactType, presetId } = req.params;

    // Validate artifact type
    const validTypes = [
      "scene",
      "performer",
      "studio",
      "tag",
      "group",
      "gallery",
    ];
    if (!validTypes.includes(artifactType)) {
      return res.status(400).json({ error: "Invalid artifact type" });
    }

    // Get current presets and defaults
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { filterPresets: true, defaultFilterPresets: true },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const currentPresets = (user.filterPresets as FilterPresets) || {};
    const currentDefaults =
      (user.defaultFilterPresets as DefaultFilterPresets) || {};

    // Remove preset from the appropriate artifact type array
    currentPresets[artifactType] = (currentPresets[artifactType] || []).filter(
      (preset: FilterPreset) => preset.id !== presetId
    );

    // If this was the default preset, clear the default
    if (currentDefaults[artifactType] === presetId) {
      delete currentDefaults[artifactType];
    }

    // Update user
    await prisma.user.update({
      where: { id: userId },
      data: {
        filterPresets: currentPresets as never,
        defaultFilterPresets: currentDefaults as never,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting filter preset:", error);
    res.status(500).json({ error: "Failed to delete filter preset" });
  }
};

/**
 * Get default filter presets
 */
export const getDefaultFilterPresets = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Get user's default presets
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        defaultFilterPresets: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Return empty object if no defaults set
    const defaults = user.defaultFilterPresets || {};

    res.json({ defaults });
  } catch (error) {
    console.error("Error getting default filter presets:", error);
    res.status(500).json({ error: "Failed to get default filter presets" });
  }
};

/**
 * Set default filter preset for a context
 * Context can be an artifact type (scene, performer, etc.) or a scene grid context
 * (scene_performer, scene_tag, scene_studio, scene_group)
 */
export const setDefaultFilterPreset = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { context, presetId } = req.body;

    // Validate required fields
    if (!context) {
      return res.status(400).json({ error: "Missing context" });
    }

    // Validate context - includes base types and scene grid contexts
    const validContexts = [
      "scene",
      "scene_performer",
      "scene_tag",
      "scene_studio",
      "scene_group",
      "performer",
      "studio",
      "tag",
      "group",
      "gallery",
    ];
    if (!validContexts.includes(context)) {
      return res.status(400).json({ error: "Invalid context" });
    }

    // Get current defaults
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { defaultFilterPresets: true, filterPresets: true },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const currentDefaults =
      (user.defaultFilterPresets as DefaultFilterPresets) || {};
    const currentPresets = (user.filterPresets as FilterPresets) || {};

    // If presetId is provided, validate it exists
    // For scene grid contexts (scene_performer, etc.), validate against "scene" presets
    if (presetId) {
      const artifactType = context.startsWith("scene_") ? "scene" : context;
      const presetExists = (currentPresets[artifactType] || []).some(
        (preset: FilterPreset) => preset.id === presetId
      );

      if (!presetExists) {
        return res.status(400).json({ error: "Preset not found" });
      }

      currentDefaults[context] = presetId;
    } else {
      // If presetId is null/undefined, clear the default
      delete currentDefaults[context];
    }

    // Update user
    await prisma.user.update({
      where: { id: userId },
      data: {
        defaultFilterPresets: currentDefaults as never,
      },
    });

    res.json({ success: true, defaults: currentDefaults });
  } catch (error) {
    console.error("Error setting default filter preset:", error);
    res.status(500).json({ error: "Failed to set default filter preset" });
  }
};

/**
 * Sync ratings and favorites from Stash to Peek (one-way)
 * This is a one-time import operation, not continuous sync
 * Admin only - syncs data for a specific user
 */
export const syncFromStash = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  const startTime = Date.now();
  try {
    const currentUser = req.user;

    // Only admins can sync
    if (!currentUser || currentUser.role !== "ADMIN") {
      return res.status(403).json({ error: "Only admins can sync from Stash" });
    }

    const targetUserId = parseInt(req.params.userId);
    if (isNaN(targetUserId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    // Get sync options from request body
    const { options } = req.body;

    // Default options if not provided
    const syncOptions = options || {
      scenes: { rating: true, favorite: false, oCounter: false },
      performers: { rating: true, favorite: true },
      studios: { rating: true, favorite: true },
      tags: { rating: false, favorite: true },
      galleries: { rating: true }, // Galleries only have rating, no favorite
      groups: { rating: true }, // Groups only have rating, no favorite
    };

    // Get Stash instance from manager
    const { stashInstanceManager } = await import(
      "../services/StashInstanceManager.js"
    );
    const stash = stashInstanceManager.getDefault();

    const stats = {
      scenes: { checked: 0, updated: 0, created: 0 },
      performers: { checked: 0, updated: 0, created: 0 },
      studios: { checked: 0, updated: 0, created: 0 },
      tags: { checked: 0, updated: 0, created: 0 },
      galleries: { checked: 0, updated: 0, created: 0 },
      groups: { checked: 0, updated: 0, created: 0 },
    };

    // Pagination settings - match StashSyncService.PAGE_SIZE
    const PAGE_SIZE = 1000;
    const BATCH_SIZE = 500;

    // Helper to fetch paginated results
    async function fetchPaginated<T>(
      fetchFn: (page: number) => Promise<{ items: T[]; count: number }>,
      filter: (item: T) => boolean = () => true
    ): Promise<T[]> {
      const results: T[] = [];
      let page = 1;
      let fetchedCount = 0;
      let totalCount = 0;

      while (true) {
        const { items, count } = await fetchFn(page);
        totalCount = count;

        const filtered = items.filter(filter);
        results.push(...filtered);
        fetchedCount += items.length;

        // Stop when we've fetched all items OR received an empty page
        if (fetchedCount >= totalCount || items.length === 0) break;
        page++;
      }

      return results;
    }

    logger.info("Syncing from Stash: Fetching entities in paginated batches...");

    // 1. Sync Scenes - Fetch scenes with ratings and/or o_counter
    if (syncOptions.scenes.rating || syncOptions.scenes.oCounter) {
      let sceneFilter: Record<string, unknown> = {};

      // Determine which filter to use
      if (syncOptions.scenes.rating && !syncOptions.scenes.oCounter) {
        sceneFilter = { rating100: { value: 0, modifier: "GREATER_THAN" } };
      } else if (syncOptions.scenes.oCounter && !syncOptions.scenes.rating) {
        sceneFilter = { o_counter: { value: 0, modifier: "GREATER_THAN" } };
      }
      // If both are selected, fetch all scenes (can't do OR in single query)

      // Build filter function for in-code filtering when both options selected
      const sceneFilterFn =
        syncOptions.scenes.rating && syncOptions.scenes.oCounter
          ? (s: { rating100?: number | null; o_counter?: number | null }) =>
              (s.rating100 !== null &&
                s.rating100 !== undefined &&
                s.rating100 > 0) ||
              (s.o_counter !== null &&
                s.o_counter !== undefined &&
                s.o_counter > 0)
          : () => true;

      const filteredScenes = await fetchPaginated(
        async (page) => {
          const result = await stash.findScenes({
            filter: { page, per_page: PAGE_SIZE },
            scene_filter:
              Object.keys(sceneFilter).length > 0 ? sceneFilter : undefined,
          });
          return {
            items: result.findScenes.scenes,
            count: result.findScenes.count,
          };
        },
        sceneFilterFn
      );


      // Track unique scenes to avoid double-counting when syncing both rating and o_counter
      const createdScenes = new Set<string>();
      const updatedScenes = new Set<string>();

      for (let i = 0; i < filteredScenes.length; i += BATCH_SIZE) {
        const batch = filteredScenes.slice(i, i + BATCH_SIZE);
        const sceneIds = batch.map((s) => s.id);

        // Collect all existing records in one query
        const [existingRatings, existingWatchHistory] = await Promise.all([
          syncOptions.scenes.rating
            ? prisma.sceneRating.findMany({
                where: { userId: targetUserId, sceneId: { in: sceneIds } },
              })
            : Promise.resolve([]),
          syncOptions.scenes.oCounter
            ? prisma.watchHistory.findMany({
                where: { userId: targetUserId, sceneId: { in: sceneIds } },
              })
            : Promise.resolve([]),
        ]);

        const existingRatingMap = new Map(
          existingRatings.map((r) => [r.sceneId, r])
        );
        const existingWatchMap = new Map(
          existingWatchHistory.map((w) => [w.sceneId, w])
        );

        // Build bulk operations
        const ratingUpserts: Parameters<typeof prisma.sceneRating.upsert>[0][] =
          [];
        const watchUpserts: Parameters<typeof prisma.watchHistory.upsert>[0][] =
          [];

        for (const scene of batch) {
          let sceneWasCreated = false;
          let sceneWasUpdated = false;

          // Rating sync
          if (
            syncOptions.scenes.rating &&
            scene.rating100 &&
            scene.rating100 > 0
          ) {
            const existing = existingRatingMap.get(scene.id);
            ratingUpserts.push({
              where: {
                userId_sceneId: { userId: targetUserId, sceneId: scene.id },
              },
              update: { rating: scene.rating100 },
              create: {
                userId: targetUserId,
                sceneId: scene.id,
                rating: scene.rating100,
                favorite: false,
              },
            });

            if (!existing) {
              sceneWasCreated = true;
            } else if (existing.rating !== scene.rating100) {
              sceneWasUpdated = true;
            }
          }

          // O-counter sync
          if (
            syncOptions.scenes.oCounter &&
            scene.o_counter &&
            scene.o_counter > 0
          ) {
            const existing = existingWatchMap.get(scene.id);
            watchUpserts.push({
              where: {
                userId_sceneId: { userId: targetUserId, sceneId: scene.id },
              },
              update: { oCount: scene.o_counter },
              create: {
                userId: targetUserId,
                sceneId: scene.id,
                oCount: scene.o_counter,
                oHistory: [],
                playCount: 0,
                playDuration: 0,
                playHistory: [],
              },
            });

            if (!existing) {
              sceneWasCreated = true;
            } else if (existing.oCount !== scene.o_counter) {
              sceneWasUpdated = true;
            }
          }

          // Count each unique scene only once (not once per record type)
          if (sceneWasCreated && !createdScenes.has(scene.id)) {
            stats.scenes.created++;
            createdScenes.add(scene.id);
          }
          if (sceneWasUpdated && !updatedScenes.has(scene.id)) {
            stats.scenes.updated++;
            updatedScenes.add(scene.id);
          }
        }

        // Execute upserts in transaction
        if (ratingUpserts.length > 0 || watchUpserts.length > 0) {
          await prisma.$transaction([
            ...ratingUpserts.map((u) => prisma.sceneRating.upsert(u)),
            ...watchUpserts.map((u) => prisma.watchHistory.upsert(u)),
          ]);
        }

        stats.scenes.checked += batch.length;
      }
    }

    // 2. Sync Performers
    if (syncOptions.performers.rating || syncOptions.performers.favorite) {
      let performerFilter: Record<string, unknown> = {};

      // Use GraphQL filter when only one option is selected
      if (syncOptions.performers.rating && !syncOptions.performers.favorite) {
        performerFilter = { rating100: { value: 0, modifier: "GREATER_THAN" } };
      } else if (
        syncOptions.performers.favorite &&
        !syncOptions.performers.rating
      ) {
        performerFilter = { filter_favorites: true };
      }
      // If both are selected, fetch all and filter in code (can't do OR in single query)

      // Build filter function for in-code filtering when both options selected
      const performerFilterFn =
        syncOptions.performers.rating && syncOptions.performers.favorite
          ? (p: { rating100?: number | null; favorite?: boolean }): boolean =>
              (p.rating100 !== null &&
                p.rating100 !== undefined &&
                p.rating100 > 0) ||
              !!p.favorite
          : (): boolean => true;

      const filteredPerformers = await fetchPaginated(
        async (page) => {
          const result = await stash.findPerformers({
            filter: { page, per_page: PAGE_SIZE },
            performer_filter:
              Object.keys(performerFilter).length > 0
                ? performerFilter
                : undefined,
          });
          return {
            items: result.findPerformers.performers,
            count: result.findPerformers.count,
          };
        },
        performerFilterFn
      );


      for (let i = 0; i < filteredPerformers.length; i += BATCH_SIZE) {
        const batch = filteredPerformers.slice(i, i + BATCH_SIZE);
        const performerIds = batch.map((p) => p.id);

        // Fetch all existing records in one query
        const existingRatings = await prisma.performerRating.findMany({
          where: { userId: targetUserId, performerId: { in: performerIds } },
        });

        const existingRatingMap = new Map(
          existingRatings.map((r) => [r.performerId, r])
        );

        // Build bulk operations
        const upserts: Parameters<typeof prisma.performerRating.upsert>[0][] =
          [];

        for (const performer of batch) {
          const stashRating = syncOptions.performers.rating
            ? performer.rating100
            : null;
          const stashFavorite = syncOptions.performers.favorite
            ? performer.favorite || false
            : false;

          const existing = existingRatingMap.get(performer.id);

          const updates: SyncUpdates = {};
          if (syncOptions.performers.rating) updates.rating = stashRating;
          if (syncOptions.performers.favorite) updates.favorite = stashFavorite;

          upserts.push({
            where: {
              userId_performerId: {
                userId: targetUserId,
                performerId: performer.id,
              },
            },
            update: updates,
            create: {
              userId: targetUserId,
              performerId: performer.id,
              rating: stashRating,
              favorite: stashFavorite,
            },
          });

          if (!existing) {
            stats.performers.created++;
          } else {
            let needsUpdate = false;
            if (
              syncOptions.performers.rating &&
              existing.rating !== stashRating
            )
              needsUpdate = true;
            if (
              syncOptions.performers.favorite &&
              existing.favorite !== stashFavorite
            )
              needsUpdate = true;

            if (needsUpdate) {
              stats.performers.updated++;
            }
          }
        }

        // Execute upserts in transaction
        if (upserts.length > 0) {
          await prisma.$transaction(
            upserts.map((u) => prisma.performerRating.upsert(u))
          );
        }

        stats.performers.checked += batch.length;
      }
    }

    // 3. Sync Studios
    if (syncOptions.studios.rating || syncOptions.studios.favorite) {
      let studioFilter: Record<string, unknown> = {};

      // Use GraphQL filter when only one option is selected
      if (syncOptions.studios.rating && !syncOptions.studios.favorite) {
        studioFilter = { rating100: { value: 0, modifier: "GREATER_THAN" } };
      } else if (syncOptions.studios.favorite && !syncOptions.studios.rating) {
        studioFilter = { favorite: true };
      }
      // If both are selected, fetch all and filter in code (can't do OR in single query)

      // Build filter function for in-code filtering when both options selected
      const studioFilterFn =
        syncOptions.studios.rating && syncOptions.studios.favorite
          ? (s: { rating100?: number | null; favorite?: boolean }): boolean =>
              (s.rating100 !== null &&
                s.rating100 !== undefined &&
                s.rating100 > 0) ||
              !!s.favorite
          : (): boolean => true;

      const filteredStudios = await fetchPaginated(
        async (page) => {
          const result = await stash.findStudios({
            filter: { page, per_page: PAGE_SIZE },
            studio_filter:
              Object.keys(studioFilter).length > 0 ? studioFilter : undefined,
          });
          return {
            items: result.findStudios.studios,
            count: result.findStudios.count,
          };
        },
        studioFilterFn
      );


      for (let i = 0; i < filteredStudios.length; i += BATCH_SIZE) {
        const batch = filteredStudios.slice(i, i + BATCH_SIZE);
        const studioIds = batch.map((s) => s.id);

        // Fetch all existing records in one query
        const existingRatings = await prisma.studioRating.findMany({
          where: { userId: targetUserId, studioId: { in: studioIds } },
        });

        const existingRatingMap = new Map(
          existingRatings.map((r) => [r.studioId, r])
        );

        // Build bulk operations
        const upserts: Parameters<typeof prisma.studioRating.upsert>[0][] = [];

        for (const studio of batch) {
          const stashRating = syncOptions.studios.rating
            ? studio.rating100
            : null;
          const stashFavorite = syncOptions.studios.favorite
            ? studio.favorite || false
            : false;

          const existing = existingRatingMap.get(studio.id);

          const updates: SyncUpdates = {};
          if (syncOptions.studios.rating) updates.rating = stashRating;
          if (syncOptions.studios.favorite) updates.favorite = stashFavorite;

          upserts.push({
            where: {
              userId_studioId: { userId: targetUserId, studioId: studio.id },
            },
            update: updates,
            create: {
              userId: targetUserId,
              studioId: studio.id,
              rating: stashRating,
              favorite: stashFavorite,
            },
          });

          if (!existing) {
            stats.studios.created++;
          } else {
            let needsUpdate = false;
            if (syncOptions.studios.rating && existing.rating !== stashRating)
              needsUpdate = true;
            if (
              syncOptions.studios.favorite &&
              existing.favorite !== stashFavorite
            )
              needsUpdate = true;

            if (needsUpdate) {
              stats.studios.updated++;
            }
          }
        }

        // Execute upserts in transaction
        if (upserts.length > 0) {
          await prisma.$transaction(
            upserts.map((u) => prisma.studioRating.upsert(u))
          );
        }

        stats.studios.checked += batch.length;
      }
    }

    // 4. Sync Tags - Only fetch favorited tags
    if (syncOptions.tags.favorite) {
      const tags = await fetchPaginated(async (page) => {
        const result = await stash.findTags({
          filter: { page, per_page: PAGE_SIZE },
          tag_filter: { favorite: true },
        });
        return { items: result.findTags.tags, count: result.findTags.count };
      });

      for (let i = 0; i < tags.length; i += BATCH_SIZE) {
        const batch = tags.slice(i, i + BATCH_SIZE);
        const tagIds = batch.map((t) => t.id);

        // Fetch all existing records in one query
        const existingRatings = await prisma.tagRating.findMany({
          where: { userId: targetUserId, tagId: { in: tagIds } },
        });

        const existingRatingMap = new Map(
          existingRatings.map((r) => [r.tagId, r])
        );

        // Build bulk operations
        const upserts: Parameters<typeof prisma.tagRating.upsert>[0][] = [];

        for (const tag of batch) {
          const stashFavorite = tag.favorite || false;
          const existing = existingRatingMap.get(tag.id);

          upserts.push({
            where: { userId_tagId: { userId: targetUserId, tagId: tag.id } },
            update: { favorite: stashFavorite },
            create: {
              userId: targetUserId,
              tagId: tag.id,
              rating: null, // Tags don't have ratings in Stash
              favorite: stashFavorite,
            },
          });

          if (!existing) {
            stats.tags.created++;
          } else if (existing.favorite !== stashFavorite) {
            stats.tags.updated++;
          }
        }

        // Execute upserts in transaction
        if (upserts.length > 0) {
          await prisma.$transaction(
            upserts.map((u) => prisma.tagRating.upsert(u))
          );
        }

        stats.tags.checked += batch.length;
      }
    }

    // 5. Sync Galleries (rating only - no favorite in Stash)
    if (syncOptions.galleries && syncOptions.galleries.rating) {
      // Filter for rated galleries in code
      const galleries = await fetchPaginated(
        async (page) => {
          const result = await stash.findGalleries({
            filter: { page, per_page: PAGE_SIZE },
            gallery_filter: undefined, // Fetch all galleries
          });
          return {
            items: result.findGalleries.galleries,
            count: result.findGalleries.count,
          };
        },
        (g: { rating100?: number | null }) =>
          g.rating100 !== null && g.rating100 !== undefined && g.rating100 > 0
      );

      for (let i = 0; i < galleries.length; i += BATCH_SIZE) {
        const batch = galleries.slice(i, i + BATCH_SIZE);
        const galleryIds = batch.map((g) => g.id);

        // Fetch all existing records in one query
        const existingRatings = await prisma.galleryRating.findMany({
          where: { userId: targetUserId, galleryId: { in: galleryIds } },
        });

        const existingRatingMap = new Map(
          existingRatings.map((r) => [r.galleryId, r])
        );

        // Build bulk operations
        const upserts: Parameters<typeof prisma.galleryRating.upsert>[0][] = [];

        for (const gallery of batch) {
          const stashRating = gallery.rating100;
          const existing = existingRatingMap.get(gallery.id);

          upserts.push({
            where: {
              userId_galleryId: { userId: targetUserId, galleryId: gallery.id },
            },
            update: { rating: stashRating },
            create: {
              userId: targetUserId,
              galleryId: gallery.id,
              rating: stashRating,
              favorite: false, // Galleries don't have favorites
            },
          });

          if (!existing) {
            stats.galleries.created++;
          } else if (existing.rating !== stashRating) {
            stats.galleries.updated++;
          }
        }

        // Execute upserts in transaction
        if (upserts.length > 0) {
          await prisma.$transaction(
            upserts.map((u) => prisma.galleryRating.upsert(u))
          );
        }

        stats.galleries.checked += batch.length;
      }
    }

    // 6. Sync Groups/Collections (rating only - no favorite in Stash)
    if (syncOptions.groups && syncOptions.groups.rating) {
      // Filter for rated groups in code
      const groups = await fetchPaginated(
        async (page) => {
          const result = await stash.findGroups({
            filter: { page, per_page: PAGE_SIZE },
            group_filter: undefined, // Fetch all groups
          });
          return {
            items: result.findGroups.groups,
            count: result.findGroups.count,
          };
        },
        (g: { rating100?: number | null }) =>
          g.rating100 !== null && g.rating100 !== undefined && g.rating100 > 0
      );

      for (let i = 0; i < groups.length; i += BATCH_SIZE) {
        const batch = groups.slice(i, i + BATCH_SIZE);
        const groupIds = batch.map((g) => g.id);

        // Fetch all existing records in one query
        const existingRatings = await prisma.groupRating.findMany({
          where: { userId: targetUserId, groupId: { in: groupIds } },
        });

        const existingRatingMap = new Map(
          existingRatings.map((r) => [r.groupId, r])
        );

        // Build bulk operations
        const upserts: Parameters<typeof prisma.groupRating.upsert>[0][] = [];

        for (const group of batch) {
          const stashRating = group.rating100;
          const existing = existingRatingMap.get(group.id);

          upserts.push({
            where: {
              userId_groupId: { userId: targetUserId, groupId: group.id },
            },
            update: { rating: stashRating },
            create: {
              userId: targetUserId,
              groupId: group.id,
              rating: stashRating,
              favorite: false, // Groups don't have favorites
            },
          });

          if (!existing) {
            stats.groups.created++;
          } else if (existing.rating !== stashRating) {
            stats.groups.updated++;
          }
        }

        // Execute upserts in transaction
        if (upserts.length > 0) {
          await prisma.$transaction(
            upserts.map((u) => prisma.groupRating.upsert(u))
          );
        }

        stats.groups.checked += batch.length;
      }
    }

    logger.info("syncFromStash completed", {
      totalTime: `${Date.now() - startTime}ms`,
      targetUserId,
      scenes: stats.scenes,
      performers: stats.performers,
      studios: stats.studios,
      tags: stats.tags,
      galleries: stats.galleries,
      groups: stats.groups,
    });

    res.json({
      success: true,
      message: "Successfully synced ratings and favorites from Stash",
      stats,
    });
  } catch (error) {
    logger.error("Error syncing from Stash:", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: "Failed to sync from Stash" });
  }
};

/**
 * Get content restrictions for a user (Admin only)
 */
export const getUserRestrictions = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { userId } = req.params;
    const requestingUser = req.user;

    if (!requestingUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Only admins can manage restrictions
    if (requestingUser.role !== "ADMIN") {
      return res
        .status(403)
        .json({ error: "Only administrators can manage content restrictions" });
    }

    const restrictions = await prisma.userContentRestriction.findMany({
      where: { userId: parseInt(userId) },
    });

    res.json({ restrictions });
  } catch (error) {
    console.error("Error getting user restrictions:", error);
    res.status(500).json({ error: "Failed to get content restrictions" });
  }
};

/**
 * Update content restrictions for a user (Admin only)
 * Replaces all existing restrictions with new ones
 */
export const updateUserRestrictions = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { userId } = req.params;
    const { restrictions } = req.body; // Array of {entityType, mode, entityIds, restrictEmpty}
    const requestingUser = req.user;

    if (!requestingUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Only admins can manage restrictions
    if (requestingUser.role !== "ADMIN") {
      return res
        .status(403)
        .json({ error: "Only administrators can manage content restrictions" });
    }

    const targetUserId = parseInt(userId);

    // Validate input
    if (!Array.isArray(restrictions)) {
      return res.status(400).json({ error: "Restrictions must be an array" });
    }

    // Validate each restriction
    for (const r of restrictions) {
      if (!["groups", "tags", "studios", "galleries"].includes(r.entityType)) {
        return res
          .status(400)
          .json({ error: `Invalid entity type: ${r.entityType}` });
      }
      if (!["INCLUDE", "EXCLUDE"].includes(r.mode)) {
        return res.status(400).json({ error: `Invalid mode: ${r.mode}` });
      }
      if (!Array.isArray(r.entityIds)) {
        return res.status(400).json({ error: "entityIds must be an array" });
      }
    }

    // Delete existing restrictions
    await prisma.userContentRestriction.deleteMany({
      where: { userId: targetUserId },
    });

    // Create new restrictions
    const created = await Promise.all(
      restrictions.map((r: UserRestriction) =>
        prisma.userContentRestriction.create({
          data: {
            userId: targetUserId,
            entityType: r.entityType,
            mode: r.mode,
            entityIds: JSON.stringify(r.entityIds),
            restrictEmpty: r.restrictEmpty || false,
          },
        })
      )
    );

    // Recompute exclusions for this user after restriction change
    await exclusionComputationService.recomputeForUser(targetUserId);

    res.json({
      success: true,
      message: "Content restrictions updated successfully",
      restrictions: created,
    });
  } catch (error) {
    console.error("Error updating user restrictions:", error);
    res.status(500).json({ error: "Failed to update content restrictions" });
  }
};

/**
 * Delete all content restrictions for a user (Admin only)
 */
export const deleteUserRestrictions = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { userId } = req.params;
    const requestingUser = req.user;

    if (!requestingUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Only admins can manage restrictions
    if (requestingUser.role !== "ADMIN") {
      return res
        .status(403)
        .json({ error: "Only administrators can manage content restrictions" });
    }

    const targetUserId = parseInt(userId);

    await prisma.userContentRestriction.deleteMany({
      where: { userId: targetUserId },
    });

    // Recompute exclusions for this user after restriction removal
    await exclusionComputationService.recomputeForUser(targetUserId);

    res.json({
      success: true,
      message: "All content restrictions removed successfully",
    });
  } catch (error) {
    console.error("Error deleting user restrictions:", error);
    res.status(500).json({ error: "Failed to delete content restrictions" });
  }
};

/**
 * Hide an entity for the current user
 */
export const hideEntity = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { entityType, entityId } = req.body;

    if (!entityType || !entityId) {
      return res
        .status(400)
        .json({ error: "Entity type and entity ID are required" });
    }

    // Validate entity type
    const validTypes = [
      "scene",
      "performer",
      "studio",
      "tag",
      "group",
      "gallery",
      "image",
    ];
    if (!validTypes.includes(entityType)) {
      return res.status(400).json({ error: "Invalid entity type" });
    }

    // Import service
    const { userHiddenEntityService } = await import(
      "../services/UserHiddenEntityService.js"
    );

    await userHiddenEntityService.hideEntity(userId, entityType, entityId);

    res.json({ success: true, message: "Entity hidden successfully" });
  } catch (error) {
    console.error("Error hiding entity:", error);
    res.status(500).json({ error: "Failed to hide entity" });
  }
};

/**
 * Unhide (restore) an entity for the current user
 */
export const unhideEntity = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { entityType, entityId } = req.params;

    if (!entityType || !entityId) {
      return res
        .status(400)
        .json({ error: "Entity type and entity ID are required" });
    }

    // Validate entity type
    const validTypes = [
      "scene",
      "performer",
      "studio",
      "tag",
      "group",
      "gallery",
      "image",
    ];
    if (!validTypes.includes(entityType)) {
      return res.status(400).json({ error: "Invalid entity type" });
    }

    // Import service
    const { userHiddenEntityService } = await import(
      "../services/UserHiddenEntityService.js"
    );

    await userHiddenEntityService.unhideEntity(userId, entityType as any, entityId);

    res.json({ success: true, message: "Entity restored successfully" });
  } catch (error) {
    console.error("Error unhiding entity:", error);
    res.status(500).json({ error: "Failed to restore entity" });
  }
};

/**
 * Unhide all entities for the current user
 * Optionally filter by entity type
 */
export const unhideAllEntities = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { entityType } = req.query;

    // Validate entity type if provided
    if (entityType) {
      const validTypes = [
        "scene",
        "performer",
        "studio",
        "tag",
        "group",
        "gallery",
        "image",
      ];
      if (!validTypes.includes(entityType as string)) {
        return res.status(400).json({ error: "Invalid entity type" });
      }
    }

    // Import service
    const { userHiddenEntityService } = await import(
      "../services/UserHiddenEntityService.js"
    );

    const count = await userHiddenEntityService.unhideAll(
      userId,
      entityType as string | undefined
    );

    res.json({
      success: true,
      message: `${count} items restored successfully`,
      count,
    });
  } catch (error) {
    console.error("Error unhiding all entities:", error);
    res.status(500).json({ error: "Failed to restore all items" });
  }
};

/**
 * Get all hidden entities for the current user
 * Optionally filter by entity type
 */
export const getHiddenEntities = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { entityType } = req.query;

    // Validate entity type if provided
    if (entityType) {
      const validTypes = [
        "scene",
        "performer",
        "studio",
        "tag",
        "group",
        "gallery",
        "image",
      ];
      if (!validTypes.includes(entityType as string)) {
        return res.status(400).json({ error: "Invalid entity type" });
      }
    }

    // Import service
    const { userHiddenEntityService } = await import(
      "../services/UserHiddenEntityService.js"
    );

    const hiddenEntities = await userHiddenEntityService.getHiddenEntities(
      userId,
      entityType as any
    );

    res.json({ hiddenEntities });
  } catch (error) {
    console.error("Error getting hidden entities:", error);
    res.status(500).json({ error: "Failed to get hidden entities" });
  }
};

/**
 * Get hidden entity IDs organized by type (for filtering)
 */
export const getHiddenEntityIds = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Import service
    const { userHiddenEntityService } = await import(
      "../services/UserHiddenEntityService.js"
    );

    const hiddenIds = await userHiddenEntityService.getHiddenEntityIds(userId);

    // Convert Sets to arrays for JSON serialization
    const result = {
      scenes: Array.from(hiddenIds.scenes),
      performers: Array.from(hiddenIds.performers),
      studios: Array.from(hiddenIds.studios),
      tags: Array.from(hiddenIds.tags),
      groups: Array.from(hiddenIds.groups),
      galleries: Array.from(hiddenIds.galleries),
      images: Array.from(hiddenIds.images),
    };

    res.json({ hiddenIds: result });
  } catch (error) {
    console.error("Error getting hidden entity IDs:", error);
    res.status(500).json({ error: "Failed to get hidden entity IDs" });
  }
};

/**
 * Update hide confirmation preference
 */
export const updateHideConfirmation = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { hideConfirmationDisabled } = req.body;

    if (typeof hideConfirmationDisabled !== "boolean") {
      return res
        .status(400)
        .json({ error: "hideConfirmationDisabled must be a boolean" });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { hideConfirmationDisabled },
    });

    res.json({ success: true, hideConfirmationDisabled });
  } catch (error) {
    console.error("Error updating hide confirmation preference:", error);
    res
      .status(500)
      .json({ error: "Failed to update hide confirmation preference" });
  }
};
