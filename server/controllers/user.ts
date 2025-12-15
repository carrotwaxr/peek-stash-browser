import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth.js";
import prisma from "../prisma/singleton.js";

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

    // Fetch all entities from Stash (per_page: -1 = unlimited)
    console.log("Syncing from Stash: Fetching all entities...");

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

      const scenesData = await stash.findScenes({
        filter: { per_page: -1 },
        scene_filter:
          Object.keys(sceneFilter).length > 0 ? sceneFilter : undefined,
      });
      const scenes = scenesData.findScenes.scenes;

      // Filter in code only if both options are selected
      const filteredScenes =
        syncOptions.scenes.rating && syncOptions.scenes.oCounter
          ? scenes.filter(
              (s: { rating100?: number | null; o_counter?: number | null }) =>
                (s.rating100 !== null &&
                  s.rating100 !== undefined &&
                  s.rating100 > 0) ||
                (s.o_counter !== null &&
                  s.o_counter !== undefined &&
                  s.o_counter > 0)
            )
          : scenes;

      stats.scenes.checked = filteredScenes.length;

      // Track unique scenes to avoid double-counting when syncing both rating and o_counter
      const createdScenes = new Set<string>();
      const updatedScenes = new Set<string>();

      for (const scene of filteredScenes) {
        let sceneWasCreated = false;
        let sceneWasUpdated = false;

        // Handle rating sync (use upsert to prevent duplicate key errors)
        if (
          syncOptions.scenes.rating &&
          scene.rating100 &&
          scene.rating100 > 0
        ) {
          const stashRating = scene.rating100;

          // Check if record exists before upsert to track created vs updated
          const existingRating = await prisma.sceneRating.findUnique({
            where: {
              userId_sceneId: { userId: targetUserId, sceneId: scene.id },
            },
          });

          await prisma.sceneRating.upsert({
            where: {
              userId_sceneId: { userId: targetUserId, sceneId: scene.id },
            },
            update: { rating: stashRating },
            create: {
              userId: targetUserId,
              sceneId: scene.id,
              rating: stashRating,
              favorite: false,
            },
          });

          if (!existingRating) {
            sceneWasCreated = true;
          } else if (existingRating.rating !== stashRating) {
            sceneWasUpdated = true;
          }
        }

        // Handle o_counter sync (use upsert to prevent duplicate key errors)
        if (
          syncOptions.scenes.oCounter &&
          scene.o_counter &&
          scene.o_counter > 0
        ) {
          const stashOCounter = scene.o_counter;

          // Check if record exists before upsert to track created vs updated
          const existingWatchHistory = await prisma.watchHistory.findUnique({
            where: {
              userId_sceneId: { userId: targetUserId, sceneId: scene.id },
            },
          });

          await prisma.watchHistory.upsert({
            where: {
              userId_sceneId: { userId: targetUserId, sceneId: scene.id },
            },
            update: { oCount: stashOCounter },
            create: {
              userId: targetUserId,
              sceneId: scene.id,
              oCount: stashOCounter,
              oHistory: [], // Don't have timestamp data, just the count
              playCount: 0,
              playDuration: 0,
              playHistory: [],
            },
          });

          if (!existingWatchHistory) {
            sceneWasCreated = true;
          } else if (existingWatchHistory.oCount !== stashOCounter) {
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

      const performersData = await stash.findPerformers({
        filter: { per_page: -1 },
        performer_filter:
          Object.keys(performerFilter).length > 0 ? performerFilter : undefined,
      });
      const performers = performersData.findPerformers.performers;

      // Filter in code only if both options are selected
      const filteredPerformers =
        syncOptions.performers.rating && syncOptions.performers.favorite
          ? performers.filter(
              (p: { rating100?: number | null; favorite?: boolean }) =>
                (p.rating100 !== null &&
                  p.rating100 !== undefined &&
                  p.rating100 > 0) ||
                p.favorite
            )
          : performers;

      stats.performers.checked = filteredPerformers.length;

      for (const performer of filteredPerformers) {
        const stashRating = syncOptions.performers.rating
          ? performer.rating100
          : null;
        const stashFavorite = syncOptions.performers.favorite
          ? performer.favorite || false
          : false;

        // Check if record exists before upsert to track created vs updated
        const existingRating = await prisma.performerRating.findUnique({
          where: {
            userId_performerId: {
              userId: targetUserId,
              performerId: performer.id,
            },
          },
        });

        const updates: SyncUpdates = {};
        if (syncOptions.performers.rating) updates.rating = stashRating;
        if (syncOptions.performers.favorite) updates.favorite = stashFavorite;

        await prisma.performerRating.upsert({
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

        if (!existingRating) {
          stats.performers.created++;
        } else {
          let needsUpdate = false;
          if (
            syncOptions.performers.rating &&
            existingRating.rating !== stashRating
          )
            needsUpdate = true;
          if (
            syncOptions.performers.favorite &&
            existingRating.favorite !== stashFavorite
          )
            needsUpdate = true;

          if (needsUpdate) {
            stats.performers.updated++;
          }
        }
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

      const studiosData = await stash.findStudios({
        filter: { per_page: -1 },
        studio_filter:
          Object.keys(studioFilter).length > 0 ? studioFilter : undefined,
      });
      const studios = studiosData.findStudios.studios;

      // Filter in code only if both options are selected
      const filteredStudios =
        syncOptions.studios.rating && syncOptions.studios.favorite
          ? studios.filter(
              (s: { rating100?: number | null; favorite?: boolean }) =>
                (s.rating100 !== null &&
                  s.rating100 !== undefined &&
                  s.rating100 > 0) ||
                s.favorite
            )
          : studios;

      stats.studios.checked = filteredStudios.length;

      for (const studio of filteredStudios) {
        const stashRating = syncOptions.studios.rating
          ? studio.rating100
          : null;
        const stashFavorite = syncOptions.studios.favorite
          ? studio.favorite || false
          : false;

        // Check if record exists before upsert to track created vs updated
        const existingRating = await prisma.studioRating.findUnique({
          where: {
            userId_studioId: { userId: targetUserId, studioId: studio.id },
          },
        });

        const updates: SyncUpdates = {};
        if (syncOptions.studios.rating) updates.rating = stashRating;
        if (syncOptions.studios.favorite) updates.favorite = stashFavorite;

        await prisma.studioRating.upsert({
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

        if (!existingRating) {
          stats.studios.created++;
        } else {
          let needsUpdate = false;
          if (
            syncOptions.studios.rating &&
            existingRating.rating !== stashRating
          )
            needsUpdate = true;
          if (
            syncOptions.studios.favorite &&
            existingRating.favorite !== stashFavorite
          )
            needsUpdate = true;

          if (needsUpdate) {
            stats.studios.updated++;
          }
        }
      }
    }

    // 4. Sync Tags - Only fetch favorited tags
    if (syncOptions.tags.favorite) {
      const tagsData = await stash.findTags({
        filter: { per_page: -1 },
        tag_filter: { favorite: true },
      });
      const tags = tagsData.findTags.tags;
      stats.tags.checked = tags.length;

      for (const tag of tags) {
        const stashFavorite = tag.favorite || false;

        // Check if record exists before upsert to track created vs updated
        const existingRating = await prisma.tagRating.findUnique({
          where: { userId_tagId: { userId: targetUserId, tagId: tag.id } },
        });

        await prisma.tagRating.upsert({
          where: { userId_tagId: { userId: targetUserId, tagId: tag.id } },
          update: { favorite: stashFavorite },
          create: {
            userId: targetUserId,
            tagId: tag.id,
            rating: null, // Tags don't have ratings in Stash
            favorite: stashFavorite,
          },
        });

        if (!existingRating) {
          stats.tags.created++;
        } else if (existingRating.favorite !== stashFavorite) {
          stats.tags.updated++;
        }
      }
    }

    // 5. Sync Galleries (rating only - no favorite in Stash)
    if (syncOptions.galleries && syncOptions.galleries.rating) {
      const galleriesData = await stash.findGalleries({
        filter: { per_page: -1 },
        gallery_filter: undefined, // Fetch all galleries
      });
      // Filter for rated galleries in code
      const galleries = galleriesData.findGalleries.galleries.filter(
        (g: { rating100?: number | null }) =>
          g.rating100 !== null && g.rating100 !== undefined && g.rating100 > 0
      );
      stats.galleries.checked = galleries.length;

      for (const gallery of galleries) {
        const stashRating = gallery.rating100;

        // Check if record exists before upsert to track created vs updated
        const existingRating = await prisma.galleryRating.findUnique({
          where: {
            userId_galleryId: { userId: targetUserId, galleryId: gallery.id },
          },
        });

        await prisma.galleryRating.upsert({
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

        if (!existingRating) {
          stats.galleries.created++;
        } else if (existingRating.rating !== stashRating) {
          stats.galleries.updated++;
        }
      }
    }

    // 6. Sync Groups/Collections (rating only - no favorite in Stash)
    if (syncOptions.groups && syncOptions.groups.rating) {
      const groupsData = await stash.findGroups({
        filter: { per_page: -1 },
        group_filter: undefined, // Fetch all groups
      });
      // Filter for rated groups in code
      const groups = groupsData.findGroups.groups.filter(
        (g: { rating100?: number | null }) =>
          g.rating100 !== null && g.rating100 !== undefined && g.rating100 > 0
      );
      stats.groups.checked = groups.length;

      for (const group of groups) {
        const stashRating = group.rating100;

        // Check if record exists before upsert to track created vs updated
        const existingRating = await prisma.groupRating.findUnique({
          where: {
            userId_groupId: { userId: targetUserId, groupId: group.id },
          },
        });

        await prisma.groupRating.upsert({
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

        if (!existingRating) {
          stats.groups.created++;
        } else if (existingRating.rating !== stashRating) {
          stats.groups.updated++;
        }
      }
    }

    console.log("Stash sync completed", { targetUserId, stats });

    res.json({
      success: true,
      message: "Successfully synced ratings and favorites from Stash",
      stats,
    });
  } catch (error) {
    console.error("Error syncing from Stash:", error);
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

    await prisma.userContentRestriction.deleteMany({
      where: { userId: parseInt(userId) },
    });

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
