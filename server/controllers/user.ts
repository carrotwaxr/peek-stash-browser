import { Request, Response } from "express";
import prisma from "../prisma/singleton.js";
import { AuthenticatedRequest } from "../middleware/auth.js";
import bcrypt from "bcryptjs";

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
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { preferredQuality, preferredPlaybackMode, theme, customTheme } = req.body;

    // Validate values
    const validQualities = ["auto", "1080p", "720p", "480p", "360p"];
    const validPlaybackModes = ["auto", "direct", "transcode"];

    if (preferredQuality && !validQualities.includes(preferredQuality)) {
      return res.status(400).json({ error: "Invalid quality setting" });
    }

    if (preferredPlaybackMode && !validPlaybackModes.includes(preferredPlaybackMode)) {
      return res.status(400).json({ error: "Invalid playback mode setting" });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(preferredQuality !== undefined && { preferredQuality }),
        ...(preferredPlaybackMode !== undefined && { preferredPlaybackMode }),
        ...(theme !== undefined && { theme }),
        ...(customTheme !== undefined && { customTheme }),
      },
      select: {
        id: true,
        username: true,
        role: true,
        preferredQuality: true,
        preferredPlaybackMode: true,
        theme: true,
        customTheme: true,
      },
    });

    res.json({
      success: true,
      settings: {
        preferredQuality: updatedUser.preferredQuality,
        preferredPlaybackMode: updatedUser.preferredPlaybackMode,
        theme: updatedUser.theme,
        customTheme: updatedUser.customTheme,
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

    // Create user
    const newUser = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        role: role || "USER",
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
