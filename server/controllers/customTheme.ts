import prisma from "../prisma/singleton.js";
import type {
  ApiErrorResponse,
  CreateCustomThemeRequest,
  CreateCustomThemeResponse,
  DeleteCustomThemeParams,
  DeleteCustomThemeResponse,
  DuplicateCustomThemeParams,
  DuplicateCustomThemeResponse,
  GetCustomThemeParams,
  GetCustomThemeResponse,
  GetUserCustomThemesResponse,
  ThemeConfig,
  TypedAuthRequest,
  TypedResponse,
  UpdateCustomThemeParams,
  UpdateCustomThemeRequest,
  UpdateCustomThemeResponse,
} from "../types/api/index.js";
import { logger } from "../utils/logger.js";

/**
 * Validate hex color format
 */
const isValidHexColor = (color: string): boolean => {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
};

/**
 * Validate theme config structure and values
 */
const validateThemeConfig = (config: ThemeConfig): config is ThemeConfig => {
  if (!config || typeof config !== "object") return false;

  // Validate mode
  if (!["dark", "light"].includes(config.mode)) return false;

  // Validate fonts
  if (!config.fonts || typeof config.fonts !== "object") return false;
  const requiredFonts: (keyof ThemeConfig["fonts"])[] = [
    "brand",
    "heading",
    "body",
    "mono",
  ];
  if (!requiredFonts.every((f) => typeof config.fonts[f] === "string"))
    return false;

  // Validate colors
  if (!config.colors || typeof config.colors !== "object") return false;
  const requiredColors: (keyof ThemeConfig["colors"])[] = [
    "background",
    "backgroundSecondary",
    "backgroundCard",
    "text",
    "border",
  ];
  if (!requiredColors.every((c) => isValidHexColor(config.colors[c])))
    return false;

  // Validate accents
  if (!config.accents || typeof config.accents !== "object") return false;
  if (
    !isValidHexColor(config.accents.primary) ||
    !isValidHexColor(config.accents.secondary)
  )
    return false;

  // Validate status colors
  if (!config.status || typeof config.status !== "object") return false;
  const requiredStatus: (keyof ThemeConfig["status"])[] = [
    "success",
    "error",
    "info",
    "warning",
  ];
  if (!requiredStatus.every((s) => isValidHexColor(config.status[s])))
    return false;

  return true;
};

/**
 * Get all custom themes for current user
 */
export const getUserCustomThemes = async (
  req: TypedAuthRequest,
  res: TypedResponse<GetUserCustomThemesResponse | ApiErrorResponse>
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const themes = await prisma.customTheme.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        config: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json({ themes });
  } catch (error) {
    logger.error("Error getting custom themes", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({ error: "Failed to get custom themes" });
  }
};

/**
 * Get single custom theme
 */
export const getCustomTheme = async (
  req: TypedAuthRequest<unknown, GetCustomThemeParams>,
  res: TypedResponse<GetCustomThemeResponse | ApiErrorResponse>
) => {
  try {
    const userId = req.user?.id;
    const themeId = parseInt(req.params.id);

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (isNaN(themeId)) {
      res.status(400).json({ error: "Invalid theme ID" });
      return;
    }

    const theme = await prisma.customTheme.findFirst({
      where: {
        id: themeId,
        userId, // Only allow accessing own themes
      },
    });

    if (!theme) {
      res.status(404).json({ error: "Theme not found" });
      return;
    }

    res.json({ theme });
  } catch (error) {
    logger.error("Error getting custom theme", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({ error: "Failed to get custom theme" });
  }
};

/**
 * Create new custom theme
 */
export const createCustomTheme = async (
  req: TypedAuthRequest<CreateCustomThemeRequest>,
  res: TypedResponse<CreateCustomThemeResponse | ApiErrorResponse>
) => {
  try {
    const userId = req.user?.id;
    const { name, config } = req.body;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Validate name
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      res.status(400).json({ error: "Theme name is required" });
      return;
    }

    if (name.length > 50) {
      res
        .status(400)
        .json({ error: "Theme name must be 50 characters or less" });
      return;
    }

    // Validate config
    if (!validateThemeConfig(config)) {
      res.status(400).json({ error: "Invalid theme configuration" });
      return;
    }

    // Check for duplicate name
    const existing = await prisma.customTheme.findFirst({
      where: {
        userId,
        name: name.trim(),
      },
    });

    if (existing) {
      res.status(409).json({ error: "A theme with this name already exists" });
      return;
    }

    // Create theme
    const theme = await prisma.customTheme.create({
      data: {
        userId,
        name: name.trim(),
        config: config as object,
      },
    });

    res.status(201).json({ theme });
  } catch (error) {
    logger.error("Error creating custom theme", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({ error: "Failed to create custom theme" });
  }
};

/**
 * Update custom theme
 */
export const updateCustomTheme = async (
  req: TypedAuthRequest<UpdateCustomThemeRequest, UpdateCustomThemeParams>,
  res: TypedResponse<UpdateCustomThemeResponse | ApiErrorResponse>
) => {
  try {
    const userId = req.user?.id;
    const themeId = parseInt(req.params.id);
    const { name, config } = req.body;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (isNaN(themeId)) {
      res.status(400).json({ error: "Invalid theme ID" });
      return;
    }

    // Verify ownership
    const existing = await prisma.customTheme.findFirst({
      where: {
        id: themeId,
        userId,
      },
    });

    if (!existing) {
      res.status(404).json({ error: "Theme not found" });
      return;
    }

    // Validate updates
    const updates: { name?: string; config?: object } = {};

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        res.status(400).json({ error: "Theme name cannot be empty" });
        return;
      }
      if (name.length > 50) {
        res
          .status(400)
          .json({ error: "Theme name must be 50 characters or less" });
        return;
      }

      // Check for duplicate name (excluding current theme)
      const duplicate = await prisma.customTheme.findFirst({
        where: {
          userId,
          name: name.trim(),
          id: { not: themeId },
        },
      });

      if (duplicate) {
        res
          .status(409)
          .json({ error: "A theme with this name already exists" });
        return;
      }

      updates.name = name.trim();
    }

    if (config !== undefined) {
      if (!validateThemeConfig(config)) {
        res.status(400).json({ error: "Invalid theme configuration" });
        return;
      }
      updates.config = config as object;
    }

    // Update theme
    const theme = await prisma.customTheme.update({
      where: { id: themeId },
      data: updates,
    });

    res.json({ theme });
  } catch (error) {
    logger.error("Error updating custom theme", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({ error: "Failed to update custom theme" });
  }
};

/**
 * Delete custom theme
 */
export const deleteCustomTheme = async (
  req: TypedAuthRequest<unknown, DeleteCustomThemeParams>,
  res: TypedResponse<DeleteCustomThemeResponse | ApiErrorResponse>
) => {
  try {
    const userId = req.user?.id;
    const themeId = parseInt(req.params.id);

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (isNaN(themeId)) {
      res.status(400).json({ error: "Invalid theme ID" });
      return;
    }

    // Verify ownership
    const existing = await prisma.customTheme.findFirst({
      where: {
        id: themeId,
        userId,
      },
    });

    if (!existing) {
      res.status(404).json({ error: "Theme not found" });
      return;
    }

    // Delete theme
    await prisma.customTheme.delete({
      where: { id: themeId },
    });

    res.json({ success: true });
  } catch (error) {
    logger.error("Error deleting custom theme", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({ error: "Failed to delete custom theme" });
  }
};

/**
 * Duplicate custom theme
 */
export const duplicateCustomTheme = async (
  req: TypedAuthRequest<unknown, DuplicateCustomThemeParams>,
  res: TypedResponse<DuplicateCustomThemeResponse | ApiErrorResponse>
) => {
  try {
    const userId = req.user?.id;
    const themeId = parseInt(req.params.id);

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (isNaN(themeId)) {
      res.status(400).json({ error: "Invalid theme ID" });
      return;
    }

    // Get original theme
    const original = await prisma.customTheme.findFirst({
      where: {
        id: themeId,
        userId,
      },
    });

    if (!original) {
      res.status(404).json({ error: "Theme not found" });
      return;
    }

    // Generate unique name
    let newName = `${original.name} (Copy)`;
    let counter = 1;

    while (
      await prisma.customTheme.findFirst({
        where: { userId, name: newName },
      })
    ) {
      counter++;
      newName = `${original.name} (Copy ${counter})`;
    }

    // Create duplicate
    const theme = await prisma.customTheme.create({
      data: {
        userId,
        name: newName,
        config: original.config as object,
      },
    });

    res.status(201).json({ theme });
  } catch (error) {
    logger.error("Error duplicating custom theme", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({ error: "Failed to duplicate custom theme" });
  }
};
