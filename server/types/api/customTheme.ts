// server/types/api/customTheme.ts
/**
 * Custom Theme API Types
 *
 * Request and response types for /api/custom-themes/* endpoints.
 */
import type { JsonValue } from "@prisma/client/runtime/library";

// =============================================================================
// COMMON TYPES
// =============================================================================

/**
 * Theme configuration structure
 */
export interface ThemeConfig {
  mode: "dark" | "light";
  fonts: {
    brand: string;
    heading: string;
    body: string;
    mono: string;
  };
  colors: {
    background: string;
    backgroundSecondary: string;
    backgroundCard: string;
    text: string;
    border: string;
  };
  accents: {
    primary: string;
    secondary: string;
  };
  status: {
    success: string;
    error: string;
    info: string;
    warning: string;
  };
}

/**
 * Custom theme data structure
 */
export interface CustomThemeData {
  id: number;
  name: string;
  config: JsonValue;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// GET USER CUSTOM THEMES
// =============================================================================

/**
 * GET /api/custom-themes
 * Get all custom themes for current user
 */
export interface GetUserCustomThemesResponse {
  themes: CustomThemeData[];
}

// =============================================================================
// GET CUSTOM THEME
// =============================================================================

/**
 * GET /api/custom-themes/:id
 * Get single custom theme
 */
export interface GetCustomThemeParams extends Record<string, string> {
  id: string;
}

export interface GetCustomThemeResponse {
  theme: CustomThemeData & { userId: number };
}

// =============================================================================
// CREATE CUSTOM THEME
// =============================================================================

/**
 * POST /api/custom-themes
 * Create new custom theme
 */
export interface CreateCustomThemeRequest {
  name: string;
  config: ThemeConfig;
}

export interface CreateCustomThemeResponse {
  theme: CustomThemeData & { userId: number };
}

// =============================================================================
// UPDATE CUSTOM THEME
// =============================================================================

/**
 * PUT /api/custom-themes/:id
 * Update custom theme
 */
export interface UpdateCustomThemeParams extends Record<string, string> {
  id: string;
}

export interface UpdateCustomThemeRequest {
  name?: string;
  config?: ThemeConfig;
}

export interface UpdateCustomThemeResponse {
  theme: CustomThemeData & { userId: number };
}

// =============================================================================
// DELETE CUSTOM THEME
// =============================================================================

/**
 * DELETE /api/custom-themes/:id
 * Delete custom theme
 */
export interface DeleteCustomThemeParams extends Record<string, string> {
  id: string;
}

export interface DeleteCustomThemeResponse {
  success: true;
}

// =============================================================================
// DUPLICATE CUSTOM THEME
// =============================================================================

/**
 * POST /api/custom-themes/:id/duplicate
 * Duplicate custom theme
 */
export interface DuplicateCustomThemeParams extends Record<string, string> {
  id: string;
}

export interface DuplicateCustomThemeResponse {
  theme: CustomThemeData & { userId: number };
}
