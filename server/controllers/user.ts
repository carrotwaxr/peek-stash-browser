import { Response } from "express";
import prisma from "../prisma/singleton.js";
import { AuthenticatedRequest } from "../middleware/auth.js";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
// import { getDefaultCarouselPreferences } from "../utils/carouselDefaults.js";

// Inline the default carousel preferences to avoid ESM loading issues
const getDefaultCarouselPreferences = () => [
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
export const getUserSettings = async (req: AuthenticatedRequest, res: Response) => {
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
        theme: true,
        customTheme: true,
        carouselPreferences: true,
        navPreferences: true,
        filterPresets: true,
        minimumPlayPercent: true,
        syncToStash: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      settings: {
        preferredQuality: user.preferredQuality,
        preferredPlaybackMode: user.preferredPlaybackMode,
        theme: user.theme,
        customTheme: user.customTheme,
        carouselPreferences: user.carouselPreferences || getDefaultCarouselPreferences(),
        navPreferences: user.navPreferences || null,
        minimumPlayPercent: user.minimumPlayPercent,
        syncToStash: user.syncToStash,
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
export const updateUserSettings = async (req: AuthenticatedRequest, res: Response) => {
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
      if (currentUserRole !== 'ADMIN') {
        return res.status(403).json({ error: "Only admins can update other users' settings" });
      }
      targetUserId = parseInt(req.params.userId);
    }

    const { preferredQuality, preferredPlaybackMode, theme, customTheme, carouselPreferences, navPreferences, minimumPlayPercent, syncToStash } = req.body;

    // Validate values
    const validQualities = ["auto", "1080p", "720p", "480p", "360p"];
    const validPlaybackModes = ["auto", "direct", "transcode"];

    if (preferredQuality && !validQualities.includes(preferredQuality)) {
      return res.status(400).json({ error: "Invalid quality setting" });
    }

    if (preferredPlaybackMode && !validPlaybackModes.includes(preferredPlaybackMode)) {
      return res.status(400).json({ error: "Invalid playback mode setting" });
    }

    // Validate minimumPlayPercent if provided
    if (minimumPlayPercent !== undefined) {
      if (typeof minimumPlayPercent !== 'number' || minimumPlayPercent < 0 || minimumPlayPercent > 100) {
        return res.status(400).json({ error: "Minimum play percent must be a number between 0 and 100" });
      }
    }

    // Validate syncToStash if provided (admin only can change this)
    if (syncToStash !== undefined && typeof syncToStash !== 'boolean') {
      return res.status(400).json({ error: "Sync to Stash must be a boolean" });
    }

    // Validate carousel preferences if provided
    if (carouselPreferences !== undefined) {
      if (!Array.isArray(carouselPreferences)) {
        return res.status(400).json({ error: "Carousel preferences must be an array" });
      }

      // Validate each carousel preference
      for (const pref of carouselPreferences) {
        if (typeof pref.id !== 'string' || typeof pref.enabled !== 'boolean' || typeof pref.order !== 'number') {
          return res.status(400).json({ error: "Invalid carousel preference format" });
        }
      }
    }

    // Validate navigation preferences if provided
    if (navPreferences !== undefined) {
      if (!Array.isArray(navPreferences)) {
        return res.status(400).json({ error: "Navigation preferences must be an array" });
      }

      // Validate each navigation preference
      for (const pref of navPreferences) {
        if (typeof pref.id !== 'string' || typeof pref.enabled !== 'boolean' || typeof pref.order !== 'number') {
          return res.status(400).json({ error: "Invalid navigation preference format" });
        }
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: {
        ...(preferredQuality !== undefined && { preferredQuality }),
        ...(preferredPlaybackMode !== undefined && { preferredPlaybackMode }),
        ...(theme !== undefined && { theme }),
        ...(customTheme !== undefined && { customTheme }),
        ...(carouselPreferences !== undefined && { carouselPreferences }),
        ...(navPreferences !== undefined && { navPreferences }),
        ...(minimumPlayPercent !== undefined && { minimumPlayPercent }),
        ...(syncToStash !== undefined && { syncToStash }),
      },
      select: {
        id: true,
        username: true,
        role: true,
        preferredQuality: true,
        preferredPlaybackMode: true,
        theme: true,
        customTheme: true,
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
        customTheme: updatedUser.customTheme,
        carouselPreferences: updatedUser.carouselPreferences || getDefaultCarouselPreferences(),
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
export const changePassword = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current password and new password are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters" });
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
      return res.status(403).json({ error: "Forbidden: Admin access required" });
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
      return res.status(403).json({ error: "Forbidden: Admin access required" });
    }

    const { username, password, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    if (role && role !== "ADMIN" && role !== "USER") {
      return res.status(400).json({ error: "Role must be either ADMIN or USER" });
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
        carouselPreferences: getDefaultCarouselPreferences() as any,
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
      return res.status(403).json({ error: "Forbidden: Admin access required" });
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
export const updateUserRole = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Check if user is admin
    if (req.user?.role !== "ADMIN") {
      return res.status(403).json({ error: "Forbidden: Admin access required" });
    }

    const { userId } = req.params;
    const { role } = req.body;
    const userIdInt = parseInt(userId, 10);

    if (isNaN(userIdInt)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    if (!role || (role !== "ADMIN" && role !== "USER")) {
      return res.status(400).json({ error: "Role must be either ADMIN or USER" });
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
export const getFilterPresets = async (req: AuthenticatedRequest, res: Response) => {
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
export const saveFilterPreset = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { artifactType, name, filters, sort, direction } = req.body;

    // Validate required fields
    if (!artifactType || !name || !filters || !sort || !direction) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Validate artifact type
    const validTypes = ["scene", "performer", "studio", "tag"];
    if (!validTypes.includes(artifactType)) {
      return res.status(400).json({ error: "Invalid artifact type" });
    }

    // Get current presets
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { filterPresets: true },
    });

    const currentPresets = (user?.filterPresets as any) || {
      scene: [],
      performer: [],
      studio: [],
      tag: [],
    };

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
    currentPresets[artifactType] = [...(currentPresets[artifactType] || []), newPreset];

    // Update user
    await prisma.user.update({
      where: { id: userId },
      data: {
        filterPresets: currentPresets,
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
export const deleteFilterPreset = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { artifactType, presetId } = req.params;

    // Validate artifact type
    const validTypes = ["scene", "performer", "studio", "tag"];
    if (!validTypes.includes(artifactType)) {
      return res.status(400).json({ error: "Invalid artifact type" });
    }

    // Get current presets
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { filterPresets: true },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const currentPresets = (user.filterPresets as any) || {
      scene: [],
      performer: [],
      studio: [],
      tag: [],
    };

    // Remove preset from the appropriate artifact type array
    currentPresets[artifactType] = (currentPresets[artifactType] || []).filter(
      (preset: any) => preset.id !== presetId
    );

    // Update user
    await prisma.user.update({
      where: { id: userId },
      data: {
        filterPresets: currentPresets,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting filter preset:", error);
    res.status(500).json({ error: "Failed to delete filter preset" });
  }
};

/**
 * Sync ratings and favorites from Stash to Peek (one-way)
 * This is a one-time import operation, not continuous sync
 * Admin only - syncs data for a specific user
 */
export const syncFromStash = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const currentUser = req.user;

    // Only admins can sync
    if (!currentUser || currentUser.role !== 'ADMIN') {
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
      scenes: { rating: true, favorite: false },
      performers: { rating: true, favorite: true },
      studios: { rating: true, favorite: true },
      tags: { rating: false, favorite: true },
      galleries: { rating: true, favorite: true },
    };

    // Import stash singleton
    const getStash = (await import('../stash.js')).default;
    const stash = getStash();

    const stats = {
      scenes: { checked: 0, updated: 0, created: 0 },
      performers: { checked: 0, updated: 0, created: 0 },
      studios: { checked: 0, updated: 0, created: 0 },
      tags: { checked: 0, updated: 0, created: 0 },
      galleries: { checked: 0, updated: 0, created: 0 },
    };

    // Fetch all entities from Stash (per_page: -1 = unlimited)
    console.log('Syncing from Stash: Fetching all entities...');

    // 1. Sync Scenes - Fetch scenes with ratings and/or o_counter
    if (syncOptions.scenes.rating || syncOptions.scenes.oCounter) {
      let sceneFilter: any = {};

      // Determine which filter to use
      if (syncOptions.scenes.rating && !syncOptions.scenes.oCounter) {
        sceneFilter = { rating100: { value: 0, modifier: 'GREATER_THAN' } };
      } else if (syncOptions.scenes.oCounter && !syncOptions.scenes.rating) {
        sceneFilter = { o_counter: { value: 0, modifier: 'GREATER_THAN' } };
      }
      // If both are selected, fetch all scenes (can't do OR in single query)

      const scenesData = await stash.findScenes({
        filter: { per_page: -1 },
        scene_filter: Object.keys(sceneFilter).length > 0 ? sceneFilter : undefined
      });
      const scenes = scenesData.findScenes.scenes;

      // Filter in code only if both options are selected
      const filteredScenes = (syncOptions.scenes.rating && syncOptions.scenes.oCounter)
        ? scenes.filter((s: any) => (s.rating100 !== null && s.rating100 > 0) || (s.o_counter !== null && s.o_counter > 0))
        : scenes;

      stats.scenes.checked = filteredScenes.length;

      // Track unique scenes to avoid double-counting when syncing both rating and o_counter
      const createdScenes = new Set<string>();
      const updatedScenes = new Set<string>();

      for (const scene of filteredScenes) {
        let sceneWasCreated = false;
        let sceneWasUpdated = false;

        // Handle rating sync (use upsert to prevent duplicate key errors)
        if (syncOptions.scenes.rating && scene.rating100 && scene.rating100 > 0) {
          const stashRating = scene.rating100;

          // Check if record exists before upsert to track created vs updated
          const existingRating = await prisma.sceneRating.findUnique({
            where: { userId_sceneId: { userId: targetUserId, sceneId: scene.id } }
          });

          await prisma.sceneRating.upsert({
            where: { userId_sceneId: { userId: targetUserId, sceneId: scene.id } },
            update: { rating: stashRating },
            create: {
              userId: targetUserId,
              sceneId: scene.id,
              rating: stashRating,
              favorite: false,
            }
          });

          if (!existingRating) {
            sceneWasCreated = true;
          } else if (existingRating.rating !== stashRating) {
            sceneWasUpdated = true;
          }
        }

        // Handle o_counter sync (use upsert to prevent duplicate key errors)
        if (syncOptions.scenes.oCounter && scene.o_counter && scene.o_counter > 0) {
          const stashOCounter = scene.o_counter;

          // Check if record exists before upsert to track created vs updated
          const existingWatchHistory = await prisma.watchHistory.findUnique({
            where: { userId_sceneId: { userId: targetUserId, sceneId: scene.id } }
          });

          await prisma.watchHistory.upsert({
            where: { userId_sceneId: { userId: targetUserId, sceneId: scene.id } },
            update: { oCount: stashOCounter },
            create: {
              userId: targetUserId,
              sceneId: scene.id,
              oCount: stashOCounter,
              oHistory: [], // Don't have timestamp data, just the count
              playCount: 0,
              playDuration: 0,
              playHistory: [],
            }
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
      let performerFilter: any = {};

      // Use GraphQL filter when only one option is selected
      if (syncOptions.performers.rating && !syncOptions.performers.favorite) {
        performerFilter = { rating100: { value: 0, modifier: 'GREATER_THAN' } };
      } else if (syncOptions.performers.favorite && !syncOptions.performers.rating) {
        performerFilter = { filter_favorites: true };
      }
      // If both are selected, fetch all and filter in code (can't do OR in single query)

      const performersData = await stash.findPerformers({
        filter: { per_page: -1 },
        performer_filter: Object.keys(performerFilter).length > 0 ? performerFilter : undefined
      });
      const performers = performersData.findPerformers.performers;

      // Filter in code only if both options are selected
      const filteredPerformers = (syncOptions.performers.rating && syncOptions.performers.favorite)
        ? performers.filter((p: any) => (p.rating100 !== null && p.rating100 > 0) || p.favorite)
        : performers;

      stats.performers.checked = filteredPerformers.length;

      for (const performer of filteredPerformers) {
        const stashRating = syncOptions.performers.rating ? performer.rating100 : null;
        const stashFavorite = syncOptions.performers.favorite ? (performer.favorite || false) : false;

        // Check if record exists before upsert to track created vs updated
        const existingRating = await prisma.performerRating.findUnique({
          where: { userId_performerId: { userId: targetUserId, performerId: performer.id } }
        });

        const updates: any = {};
        if (syncOptions.performers.rating) updates.rating = stashRating;
        if (syncOptions.performers.favorite) updates.favorite = stashFavorite;

        await prisma.performerRating.upsert({
          where: { userId_performerId: { userId: targetUserId, performerId: performer.id } },
          update: updates,
          create: {
            userId: targetUserId,
            performerId: performer.id,
            rating: stashRating,
            favorite: stashFavorite,
          }
        });

        if (!existingRating) {
          stats.performers.created++;
        } else {
          let needsUpdate = false;
          if (syncOptions.performers.rating && existingRating.rating !== stashRating) needsUpdate = true;
          if (syncOptions.performers.favorite && existingRating.favorite !== stashFavorite) needsUpdate = true;

          if (needsUpdate) {
            stats.performers.updated++;
          }
        }
      }
    }

    // 3. Sync Studios
    if (syncOptions.studios.rating || syncOptions.studios.favorite) {
      let studioFilter: any = {};

      // Use GraphQL filter when only one option is selected
      if (syncOptions.studios.rating && !syncOptions.studios.favorite) {
        studioFilter = { rating100: { value: 0, modifier: 'GREATER_THAN' } };
      } else if (syncOptions.studios.favorite && !syncOptions.studios.rating) {
        studioFilter = { favorite: true };
      }
      // If both are selected, fetch all and filter in code (can't do OR in single query)

      const studiosData = await stash.findStudios({
        filter: { per_page: -1 },
        studio_filter: Object.keys(studioFilter).length > 0 ? studioFilter : undefined
      });
      const studios = studiosData.findStudios.studios;

      // Filter in code only if both options are selected
      const filteredStudios = (syncOptions.studios.rating && syncOptions.studios.favorite)
        ? studios.filter((s: any) => (s.rating100 !== null && s.rating100 > 0) || s.favorite)
        : studios;

      stats.studios.checked = filteredStudios.length;

      for (const studio of filteredStudios) {
        const stashRating = syncOptions.studios.rating ? studio.rating100 : null;
        const stashFavorite = syncOptions.studios.favorite ? (studio.favorite || false) : false;

        // Check if record exists before upsert to track created vs updated
        const existingRating = await prisma.studioRating.findUnique({
          where: { userId_studioId: { userId: targetUserId, studioId: studio.id } }
        });

        const updates: any = {};
        if (syncOptions.studios.rating) updates.rating = stashRating;
        if (syncOptions.studios.favorite) updates.favorite = stashFavorite;

        await prisma.studioRating.upsert({
          where: { userId_studioId: { userId: targetUserId, studioId: studio.id } },
          update: updates,
          create: {
            userId: targetUserId,
            studioId: studio.id,
            rating: stashRating,
            favorite: stashFavorite,
          }
        });

        if (!existingRating) {
          stats.studios.created++;
        } else {
          let needsUpdate = false;
          if (syncOptions.studios.rating && existingRating.rating !== stashRating) needsUpdate = true;
          if (syncOptions.studios.favorite && existingRating.favorite !== stashFavorite) needsUpdate = true;

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
        tag_filter: { favorite: true }
      });
      const tags = tagsData.findTags.tags;
      stats.tags.checked = tags.length;

      for (const tag of tags) {
        const stashFavorite = tag.favorite || false;

        // Check if record exists before upsert to track created vs updated
        const existingRating = await prisma.tagRating.findUnique({
          where: { userId_tagId: { userId: targetUserId, tagId: tag.id } }
        });

        await prisma.tagRating.upsert({
          where: { userId_tagId: { userId: targetUserId, tagId: tag.id } },
          update: { favorite: stashFavorite },
          create: {
            userId: targetUserId,
            tagId: tag.id,
            rating: null, // Tags don't have ratings in Stash
            favorite: stashFavorite,
          }
        });

        if (!existingRating) {
          stats.tags.created++;
        } else if (existingRating.favorite !== stashFavorite) {
          stats.tags.updated++;
        }
      }
    }

    // 5. Sync Galleries
    if (syncOptions.galleries.rating || syncOptions.galleries.favorite) {
      let galleryFilter: any = {};

      // Use GraphQL filter when only one option is selected
      if (syncOptions.galleries.rating && !syncOptions.galleries.favorite) {
        galleryFilter = { rating100: { value: 0, modifier: 'GREATER_THAN' } };
      } else if (syncOptions.galleries.favorite && !syncOptions.galleries.rating) {
        galleryFilter = { favorite: true };
      }
      // If both are selected, fetch all and filter in code (can't do OR in single query)

      const galleriesData = await stash.findGalleries({
        filter: { per_page: -1 },
        gallery_filter: Object.keys(galleryFilter).length > 0 ? galleryFilter : undefined
      });
      const galleries = galleriesData.findGalleries.galleries;

      // Filter in code only if both options are selected
      const filteredGalleries = (syncOptions.galleries.rating && syncOptions.galleries.favorite)
        ? galleries.filter((g: any) => (g.rating100 !== null && g.rating100 > 0) || g.favorite)
        : galleries;

      stats.galleries.checked = filteredGalleries.length;

      for (const gallery of filteredGalleries) {
        const stashRating = syncOptions.galleries.rating ? gallery.rating100 : null;
        const stashFavorite = syncOptions.galleries.favorite ? (gallery.favorite || false) : false;

        // Check if record exists before upsert to track created vs updated
        const existingRating = await prisma.galleryRating.findUnique({
          where: { userId_galleryId: { userId: targetUserId, galleryId: gallery.id } }
        });

        const updates: any = {};
        if (syncOptions.galleries.rating) updates.rating = stashRating;
        if (syncOptions.galleries.favorite) updates.favorite = stashFavorite;

        await prisma.galleryRating.upsert({
          where: { userId_galleryId: { userId: targetUserId, galleryId: gallery.id } },
          update: updates,
          create: {
            userId: targetUserId,
            galleryId: gallery.id,
            rating: stashRating,
            favorite: stashFavorite,
          }
        });

        if (!existingRating) {
          stats.galleries.created++;
        } else {
          let needsUpdate = false;
          if (syncOptions.galleries.rating && existingRating.rating !== stashRating) needsUpdate = true;
          if (syncOptions.galleries.favorite && existingRating.favorite !== stashFavorite) needsUpdate = true;

          if (needsUpdate) {
            stats.galleries.updated++;
          }
        }
      }
    }

    console.log('Stash sync completed', { targetUserId, stats });

    res.json({
      success: true,
      message: 'Successfully synced ratings and favorites from Stash',
      stats
    });
  } catch (error) {
    console.error("Error syncing from Stash:", error);
    res.status(500).json({ error: "Failed to sync from Stash" });
  }
};

/**
 * Get content restrictions for a user (Admin only)
 */
export const getUserRestrictions = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const requestingUser = (req as any).user;

    // Only admins can manage restrictions
    if (requestingUser.role !== "ADMIN") {
      return res.status(403).json({ error: "Only administrators can manage content restrictions" });
    }

    const restrictions = await prisma.userContentRestriction.findMany({
      where: { userId: parseInt(userId) }
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
export const updateUserRestrictions = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { restrictions } = req.body; // Array of {entityType, mode, entityIds, restrictEmpty}
    const requestingUser = (req as any).user;

    // Only admins can manage restrictions
    if (requestingUser.role !== "ADMIN") {
      return res.status(403).json({ error: "Only administrators can manage content restrictions" });
    }

    const targetUserId = parseInt(userId);

    // Validate input
    if (!Array.isArray(restrictions)) {
      return res.status(400).json({ error: "Restrictions must be an array" });
    }

    // Validate each restriction
    for (const r of restrictions) {
      if (!['groups', 'tags', 'studios', 'galleries'].includes(r.entityType)) {
        return res.status(400).json({ error: `Invalid entity type: ${r.entityType}` });
      }
      if (!['INCLUDE', 'EXCLUDE'].includes(r.mode)) {
        return res.status(400).json({ error: `Invalid mode: ${r.mode}` });
      }
      if (!Array.isArray(r.entityIds)) {
        return res.status(400).json({ error: "entityIds must be an array" });
      }
    }

    // Delete existing restrictions
    await prisma.userContentRestriction.deleteMany({
      where: { userId: targetUserId }
    });

    // Create new restrictions
    const created = await Promise.all(
      restrictions.map((r: any) =>
        prisma.userContentRestriction.create({
          data: {
            userId: targetUserId,
            entityType: r.entityType,
            mode: r.mode,
            entityIds: JSON.stringify(r.entityIds),
            restrictEmpty: r.restrictEmpty || false
          }
        })
      )
    );

    res.json({
      success: true,
      message: 'Content restrictions updated successfully',
      restrictions: created
    });
  } catch (error) {
    console.error("Error updating user restrictions:", error);
    res.status(500).json({ error: "Failed to update content restrictions" });
  }
};

/**
 * Delete all content restrictions for a user (Admin only)
 */
export const deleteUserRestrictions = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const requestingUser = (req as any).user;

    // Only admins can manage restrictions
    if (requestingUser.role !== "ADMIN") {
      return res.status(403).json({ error: "Only administrators can manage content restrictions" });
    }

    await prisma.userContentRestriction.deleteMany({
      where: { userId: parseInt(userId) }
    });

    res.json({
      success: true,
      message: 'All content restrictions removed successfully'
    });
  } catch (error) {
    console.error("Error deleting user restrictions:", error);
    res.status(500).json({ error: "Failed to delete content restrictions" });
  }
};
