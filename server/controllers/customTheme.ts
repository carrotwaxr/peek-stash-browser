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

/**
 * Validate hex color format
 */
const isValidHexColor = (color: string): boolean => {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/**
 * Validate theme config structure and values. The config comes from a request
 * body, so it is unknown until every part is checked.
 */
const validateThemeConfig = (config: unknown): config is ThemeConfig => {
  if (!isRecord(config)) return false;

  // Validate mode
  if (
    typeof config.mode !== "string" ||
    !["dark", "light"].includes(config.mode)
  )
    return false;

  // Validate fonts
  const { fonts, colors, accents, status } = config;
  if (!isRecord(fonts)) return false;
  const requiredFonts: (keyof ThemeConfig["fonts"])[] = [
    "brand",
    "heading",
    "body",
    "mono",
  ];
  if (!requiredFonts.every((f) => typeof fonts[f] === "string")) return false;

  // Validate colors
  if (!isRecord(colors)) return false;
  const isHex = (value: unknown) =>
    typeof value === "string" && isValidHexColor(value);
  const requiredColors: (keyof ThemeConfig["colors"])[] = [
    "background",
    "backgroundSecondary",
    "backgroundCard",
    "text",
    "border",
  ];
  if (!requiredColors.every((c) => isHex(colors[c]))) return false;

  // Validate accents
  if (!isRecord(accents)) return false;
  if (!isHex(accents.primary) || !isHex(accents.secondary)) return false;

  // Validate status colors
  if (!isRecord(status)) return false;
  const requiredStatus: (keyof ThemeConfig["status"])[] = [
    "success",
    "error",
    "info",
    "warning",
  ];
  if (!requiredStatus.every((s) => isHex(status[s]))) return false;

  return true;
};

/**
 * Get all custom themes for current user
 */
export const getUserCustomThemes = async (
  req: TypedAuthRequest,
  res: TypedResponse<GetUserCustomThemesResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;

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
};

/**
 * Get single custom theme
 */
export const getCustomTheme = async (
  req: TypedAuthRequest<unknown, GetCustomThemeParams>,
  res: TypedResponse<GetCustomThemeResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;
  const themeId = parseInt(req.params.id);

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
};

/**
 * Create new custom theme
 */
export const createCustomTheme = async (
  req: TypedAuthRequest<CreateCustomThemeRequest>,
  res: TypedResponse<CreateCustomThemeResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;
  const { name, config } = req.body;

  // Validate name
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "Theme name is required" });
    return;
  }

  if (name.length > 50) {
    res.status(400).json({ error: "Theme name must be 50 characters or less" });
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
};

/**
 * Update custom theme
 */
export const updateCustomTheme = async (
  req: TypedAuthRequest<UpdateCustomThemeRequest, UpdateCustomThemeParams>,
  res: TypedResponse<UpdateCustomThemeResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;
  const themeId = parseInt(req.params.id);
  const { name, config } = req.body;

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
      res.status(409).json({ error: "A theme with this name already exists" });
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
};

/**
 * Delete custom theme
 */
export const deleteCustomTheme = async (
  req: TypedAuthRequest<unknown, DeleteCustomThemeParams>,
  res: TypedResponse<DeleteCustomThemeResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;
  const themeId = parseInt(req.params.id);

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
};

/**
 * Duplicate custom theme
 */
export const duplicateCustomTheme = async (
  req: TypedAuthRequest<unknown, DuplicateCustomThemeParams>,
  res: TypedResponse<DuplicateCustomThemeResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;
  const themeId = parseInt(req.params.id);

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
};
