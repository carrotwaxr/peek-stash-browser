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
      // Admin updating another user's settings
      if (currentUserRole !== 'admin') {
        return res.status(403).json({ error: "Only admins can update other users' settings" });
      }
      targetUserId = parseInt(req.params.userId);
    }

    const { preferredQuality, preferredPlaybackMode, theme, customTheme, carouselPreferences, minimumPlayPercent, syncToStash } = req.body;

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

    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: {
        ...(preferredQuality !== undefined && { preferredQuality }),
        ...(preferredPlaybackMode !== undefined && { preferredPlaybackMode }),
        ...(theme !== undefined && { theme }),
        ...(customTheme !== undefined && { customTheme }),
        ...(carouselPreferences !== undefined && { carouselPreferences }),
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
