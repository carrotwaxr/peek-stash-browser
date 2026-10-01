import {
  type GetUserRestrictionsResponse,
  TABLE_COLUMN_KINDS,
} from "@peek/shared-types/api/user.js";
import { parseEntityRef } from "@peek/shared-types/instanceAwareId.js";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import * as fs from "fs";
import { z } from "zod";
import {
  USERNAME_MAX_LENGTH,
  generateToken,
  setTokenCookie,
} from "../middleware/auth.js";
import {
  AppError,
  NotFoundError,
  ValidationError,
} from "../middleware/errorHandler.js";
import prisma from "../prisma/singleton.js";
import { downloadJobQueue } from "../services/DownloadJobQueue.js";
import { getVisibleEntityKeys } from "../services/EntityAccessService.js";
import {
  type RestrictionRowInput,
  exclusionComputationService,
} from "../services/ExclusionComputationService.js";
import { setUserPassword } from "../services/PasswordService.js";
import { resolveUserPermissions } from "../services/PermissionService.js";
import { rankingComputeService } from "../services/RankingComputeService.js";
import { recommendationService } from "../services/RecommendationService.js";
import {
  importFromStash,
  importOptionsFrom,
} from "../services/StashImportService.js";
import { stashInstanceManager } from "../services/StashInstanceManager.js";
import {
  type EntityType,
  isHideableEntityType,
  userHiddenEntityService,
} from "../services/UserHiddenEntityService.js";
import {
  RESTRICTABLE_ENTITY_TYPES,
  RESTRICTION_MODES,
  type RestrictableEntityType,
  type RestrictionMode,
  defaultRestrictEmpty,
  restrictionsApplyTo,
} from "../services/exclusionPolicy.js";
import type { ApiErrorResponse } from "../types/api/common.js";
import type { TypedAuthRequest, TypedResponse } from "../types/api/express.js";
import type { GetUserGroupMembershipsResponse } from "../types/api/groups.js";
import type {
  AdminRegenerateRecoveryKeyParams,
  AdminRegenerateRecoveryKeyResponse,
  AdminResetPasswordBody,
  AdminResetPasswordParams,
  AdminResetPasswordResponse,
  CarouselPreference,
  ChangePasswordBody,
  ChangePasswordResponse,
  CompleteSetupBody,
  CompleteSetupResponse,
  CreateUserBody,
  CreateUserResponse,
  DefaultFilterPresets,
  DeleteFilterPresetParams,
  DeleteFilterPresetResponse,
  DeleteUserParams,
  DeleteUserResponse,
  DeleteUserRestrictionsParams,
  DeleteUserRestrictionsResponse,
  FilterPreset,
  FilterPresets,
  GetAllUsersResponse,
  GetDefaultFilterPresetsResponse,
  GetFilterPresetsResponse,
  GetHiddenEntitiesQuery,
  GetHiddenEntitiesResponse,
  GetRecoveryKeyResponse,
  GetUserGroupMembershipsParams,
  GetUserPermissionsParams,
  GetUserRestrictionsParams,
  GetUserSettingsResponse,
  HideEntitiesBody,
  HideEntitiesResponse,
  HideEntityBody,
  HideEntityResponse,
  LandingPagePreference,
  NavPreference,
  RegenerateRecoveryKeyBody,
  RegenerateRecoveryKeyResponse,
  SaveFilterPresetBody,
  SaveFilterPresetResponse,
  SetDefaultFilterPresetBody,
  SetDefaultFilterPresetResponse,
  SyncFromStashBody,
  SyncFromStashParams,
  SyncFromStashResponse,
  TableColumnsConfig,
  UnhideAllEntitiesQuery,
  UnhideAllEntitiesResponse,
  UnhideEntityParams,
  UnhideEntityQuery,
  UnhideEntityResponse,
  UpdateHideConfirmationBody,
  UpdateHideConfirmationResponse,
  UpdatePermissionOverridesBody,
  UpdateUserRestrictionsBody,
  UpdateUserRestrictionsResponse,
  UpdateUserRoleBody,
  UpdateUserRoleParams,
  UpdateUserRoleResponse,
  UpdateUserSettingsBody,
  UpdateUserSettingsParams,
  UpdateUserSettingsResponse,
  UpdateUserStashInstancesBody,
} from "../types/api/user.js";
import { dbWriteBatch, dbWriteTransaction } from "../utils/dbWrite.js";
import { userDownloadsDir } from "../utils/downloadPaths.js";
import { type EntityRef, compositeKey, entityKey } from "../utils/entityRef.js";
import { logger } from "../utils/logger.js";
import { validatePassword } from "../utils/passwordValidation.js";
import {
  formatRecoveryKey,
  generateRecoveryKey,
  hashRecoveryKey,
} from "../utils/recoveryKey.js";
import { emptyToNull } from "../utils/sqlHelpers.js";
import { INSTANCE_ID_PATTERN } from "../utils/stashMediaPath.js";
import { USER_GROUP_SUMMARY_SELECT } from "./groups.js";

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
  req: TypedAuthRequest,
  res: TypedResponse<GetUserSettingsResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      role: true,
      preferredQuality: true,
      preferredPlaybackMode: true,
      preferredPreviewQuality: true,
      theme: true,
      carouselPreferences: true,
      navPreferences: true,
      filterPresets: true,
      minimumPlayPercent: true,
      syncToStash: true,
      hideConfirmationDisabled: true,
      unitPreference: true,
      wallPlayback: true,
      tableColumnDefaults: true,
      cardDisplaySettings: true,
      landingPagePreference: true,
      lightboxDoubleTapAction: true,
    },
  });

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({
    settings: {
      preferredQuality: user.preferredQuality ?? "auto",
      preferredPlaybackMode: user.preferredPlaybackMode ?? "auto",
      preferredPreviewQuality: user.preferredPreviewQuality ?? null,
      theme: user.theme ?? "dark",
      carouselPreferences:
        (user.carouselPreferences as CarouselPreference[] | null) ??
        getDefaultCarouselPreferences(),
      navPreferences: (user.navPreferences as NavPreference[] | null) ?? null,
      minimumPlayPercent: user.minimumPlayPercent,
      syncToStash: user.syncToStash,
      hideConfirmationDisabled: user.hideConfirmationDisabled,
      unitPreference: user.unitPreference ?? "metric",
      wallPlayback: user.wallPlayback ?? "autoplay",
      tableColumnDefaults:
        (user.tableColumnDefaults as Record<
          string,
          TableColumnsConfig
        > | null) ?? null,
      cardDisplaySettings:
        (user.cardDisplaySettings as Record<string, unknown> | null) ?? null,
      landingPagePreference:
        (user.landingPagePreference as LandingPagePreference | null) ?? {
          pages: ["home"],
          randomize: false,
        },
      lightboxDoubleTapAction: user.lightboxDoubleTapAction ?? "favorite",
    },
  });
};

/**
 * Update user settings
 */
export const updateUserSettings = async (
  req: TypedAuthRequest<UpdateUserSettingsBody, UpdateUserSettingsParams>,
  res: TypedResponse<UpdateUserSettingsResponse | ApiErrorResponse>
) => {
  const currentUserId = req.user.id;
  const currentUserRole = req.user.role;

  // Determine target user ID
  // If userId param provided (admin updating another user), use that
  // Otherwise, user is updating their own settings
  let targetUserId = currentUserId;
  if (req.params.userId) {
    // Admin updating another user's settings (or admin updating themselves via ServerSettings)
    if (currentUserRole !== "ADMIN") {
      res
        .status(403)
        .json({ error: "Only admins can update other users' settings" });
      return;
    }
    targetUserId = parseInt(req.params.userId);
  }

  const {
    preferredQuality,
    preferredPlaybackMode,
    preferredPreviewQuality,
    theme,
    carouselPreferences,
    navPreferences,
    minimumPlayPercent,
    syncToStash,
    unitPreference,
    wallPlayback,
    tableColumnDefaults,
    cardDisplaySettings,
    landingPagePreference,
    lightboxDoubleTapAction,
  } = req.body;

  // Validate values
  const validQualities = ["auto", "1080p", "720p", "480p", "360p"];
  const validPlaybackModes = ["auto", "direct", "transcode"];
  const validPreviewQualities = ["sprite", "webp", "mp4"];

  if (preferredQuality && !validQualities.includes(preferredQuality)) {
    res.status(400).json({ error: "Invalid quality setting" });
    return;
  }

  if (
    preferredPlaybackMode &&
    !validPlaybackModes.includes(preferredPlaybackMode)
  ) {
    res.status(400).json({ error: "Invalid playback mode setting" });
    return;
  }

  if (
    preferredPreviewQuality &&
    !validPreviewQualities.includes(preferredPreviewQuality)
  ) {
    res.status(400).json({ error: "Invalid preview quality setting" });
    return;
  }

  // Validate minimumPlayPercent if provided
  if (minimumPlayPercent !== undefined) {
    if (
      typeof minimumPlayPercent !== "number" ||
      minimumPlayPercent < 0 ||
      minimumPlayPercent > 100
    ) {
      res.status(400).json({
        error: "Minimum play percent must be a number between 0 and 100",
      });
      return;
    }
  }

  // Validate syncToStash if provided. Only an admin may change it, on their
  // own settings (/settings) or on anyone's (/:userId/settings); a regular
  // user's own request is refused.
  if (syncToStash !== undefined && typeof syncToStash !== "boolean") {
    res.status(400).json({ error: "Sync to Stash must be a boolean" });
    return;
  }

  if (syncToStash !== undefined && currentUserRole !== "ADMIN") {
    res.status(403).json({ error: "Only admins can change Sync to Stash" });
    return;
  }

  // Validate unitPreference if provided
  if (unitPreference !== undefined) {
    const validUnits = ["metric", "imperial"];
    if (!validUnits.includes(unitPreference)) {
      res
        .status(400)
        .json({ error: "Unit preference must be 'metric' or 'imperial'" });
      return;
    }
  }

  // Validate wallPlayback if provided
  if (wallPlayback !== undefined) {
    const validWallPlayback = ["autoplay", "hover", "static"];
    if (!validWallPlayback.includes(wallPlayback)) {
      res.status(400).json({
        error: "Wall playback must be 'autoplay', 'hover', or 'static'",
      });
      return;
    }
  }

  // Validate carousel preferences if provided
  if (carouselPreferences !== undefined) {
    if (!Array.isArray(carouselPreferences)) {
      res.status(400).json({ error: "Carousel preferences must be an array" });
      return;
    }

    // Validate each carousel preference
    for (const pref of carouselPreferences) {
      if (
        typeof pref.id !== "string" ||
        typeof pref.enabled !== "boolean" ||
        typeof pref.order !== "number"
      ) {
        res.status(400).json({ error: "Invalid carousel preference format" });
        return;
      }
    }
  }

  // Validate navigation preferences if provided
  if (navPreferences !== undefined) {
    if (!Array.isArray(navPreferences)) {
      res
        .status(400)
        .json({ error: "Navigation preferences must be an array" });
      return;
    }

    // Validate each navigation preference
    for (const pref of navPreferences) {
      if (
        typeof pref.id !== "string" ||
        typeof pref.enabled !== "boolean" ||
        typeof pref.order !== "number"
      ) {
        res.status(400).json({ error: "Invalid navigation preference format" });
        return;
      }
    }
  }

  // Validate table column defaults if provided
  if (tableColumnDefaults !== undefined) {
    if (
      tableColumnDefaults !== null &&
      typeof tableColumnDefaults !== "object"
    ) {
      res
        .status(400)
        .json({ error: "Table column defaults must be an object or null" });
      return;
    }

    if (tableColumnDefaults !== null) {
      // The body is untrusted: a value may be null or lack either array
      const submittedDefaults = tableColumnDefaults as Record<
        string,
        Partial<TableColumnsConfig> | null | undefined
      >;
      for (const [entityType, config] of Object.entries(submittedDefaults)) {
        if (!(TABLE_COLUMN_KINDS as readonly string[]).includes(entityType)) {
          res.status(400).json({
            error: `Invalid entity type in table column defaults: ${entityType}`,
          });
          return;
        }

        const typedConfig = config;
        if (
          !typedConfig ||
          !Array.isArray(typedConfig.visible) ||
          !Array.isArray(typedConfig.order)
        ) {
          res.status(400).json({
            error: `Invalid table column config for ${entityType}: must have visible and order arrays`,
          });
          return;
        }

        // Validate that arrays contain strings
        if (!typedConfig.visible.every((v: unknown) => typeof v === "string")) {
          res.status(400).json({
            error: `Invalid visible columns for ${entityType}: must be string array`,
          });
          return;
        }
        if (!typedConfig.order.every((v: unknown) => typeof v === "string")) {
          res.status(400).json({
            error: `Invalid column order for ${entityType}: must be string array`,
          });
          return;
        }
      }
    }
  }

  // Validate card display settings if provided
  if (cardDisplaySettings !== undefined) {
    if (
      cardDisplaySettings !== null &&
      typeof cardDisplaySettings !== "object"
    ) {
      res
        .status(400)
        .json({ error: "Card display settings must be an object or null" });
      return;
    }
  }

  // Validate landing page preference if provided
  if (landingPagePreference !== undefined) {
    if (
      landingPagePreference !== null &&
      typeof landingPagePreference !== "object"
    ) {
      res
        .status(400)
        .json({ error: "Landing page preference must be an object or null" });
      return;
    }

    if (landingPagePreference !== null) {
      if (
        !Array.isArray(landingPagePreference.pages) ||
        landingPagePreference.pages.length === 0
      ) {
        res.status(400).json({
          error: "Landing page preference must have at least one page",
        });
        return;
      }

      if (typeof landingPagePreference.randomize !== "boolean") {
        res.status(400).json({
          error: "Landing page preference randomize must be a boolean",
        });
        return;
      }

      // Validate minimum pages for randomize mode
      if (
        landingPagePreference.randomize &&
        landingPagePreference.pages.length < 2
      ) {
        res
          .status(400)
          .json({ error: "Random mode requires at least 2 pages selected" });
        return;
      }

      // Validate page keys
      const validPageKeys = [
        "home",
        "scenes",
        "performers",
        "studios",
        "tags",
        "collections",
        "galleries",
        "images",
        "playlists",
        "recommended",
        "watch-history",
        "user-stats",
      ];
      for (const pageKey of landingPagePreference.pages) {
        if (!validPageKeys.includes(pageKey)) {
          res
            .status(400)
            .json({ error: `Invalid landing page key: ${pageKey}` });
          return;
        }
      }
    }
  }

  // Validate lightboxDoubleTapAction if provided
  if (lightboxDoubleTapAction !== undefined) {
    const validActions = ["favorite", "o_counter", "fullscreen"];
    if (!validActions.includes(lightboxDoubleTapAction)) {
      res.status(400).json({
        error:
          "Lightbox double-tap action must be 'favorite', 'o_counter', or 'fullscreen'",
      });
      return;
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
      ...(theme !== undefined && { theme }),
      ...(carouselPreferences !== undefined && {
        carouselPreferences: carouselPreferences as never,
      }),
      ...(navPreferences !== undefined && {
        navPreferences: navPreferences as never,
      }),
      ...(minimumPlayPercent !== undefined && { minimumPlayPercent }),
      ...(syncToStash !== undefined && { syncToStash }),
      ...(unitPreference !== undefined && { unitPreference }),
      ...(wallPlayback !== undefined && { wallPlayback }),
      ...(tableColumnDefaults !== undefined && {
        tableColumnDefaults: tableColumnDefaults as never,
      }),
      ...(cardDisplaySettings !== undefined && {
        cardDisplaySettings: cardDisplaySettings as never,
      }),
      ...(landingPagePreference !== undefined && {
        landingPagePreference: landingPagePreference as never,
      }),
      ...(lightboxDoubleTapAction !== undefined && {
        lightboxDoubleTapAction,
      }),
    },
    select: {
      id: true,
      username: true,
      role: true,
      preferredQuality: true,
      preferredPlaybackMode: true,
      theme: true,
      carouselPreferences: true,
      navPreferences: true,
      minimumPlayPercent: true,
      syncToStash: true,
      wallPlayback: true,
      tableColumnDefaults: true,
      cardDisplaySettings: true,
      landingPagePreference: true,
      lightboxDoubleTapAction: true,
    },
  });

  res.json({
    success: true as const,
    settings: {
      preferredQuality: updatedUser.preferredQuality ?? "auto",
      preferredPlaybackMode: updatedUser.preferredPlaybackMode ?? "auto",
      theme: updatedUser.theme ?? "dark",
      carouselPreferences:
        (updatedUser.carouselPreferences as CarouselPreference[] | null) ??
        getDefaultCarouselPreferences(),
      navPreferences:
        (updatedUser.navPreferences as NavPreference[] | null) ?? null,
      minimumPlayPercent: updatedUser.minimumPlayPercent,
      syncToStash: updatedUser.syncToStash,
      wallPlayback: updatedUser.wallPlayback ?? "autoplay",
      tableColumnDefaults:
        (updatedUser.tableColumnDefaults as Record<
          string,
          TableColumnsConfig
        > | null) ?? null,
      cardDisplaySettings:
        (updatedUser.cardDisplaySettings as Record<string, unknown> | null) ??
        null,
      landingPagePreference:
        (updatedUser.landingPagePreference as LandingPagePreference | null) ?? {
          pages: ["home"],
          randomize: false,
        },
      lightboxDoubleTapAction:
        updatedUser.lightboxDoubleTapAction ?? "favorite",
    },
  });
};

/**
 * Change user password
 */
export const changePassword = async (
  req: TypedAuthRequest<ChangePasswordBody>,
  res: TypedResponse<ChangePasswordResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;

  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    res
      .status(400)
      .json({ error: "Current password and new password are required" });
    return;
  }

  const passwordValidation = validatePassword(newPassword);
  if (!passwordValidation.valid) {
    res.status(400).json({ error: passwordValidation.errors.join(". ") });
    return;
  }

  // Get current user with password
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // 400, not 401: the session is fine, and a 401 sends the client to login
  const validPassword = await bcrypt.compare(currentPassword, user.password);
  if (!validPassword) {
    res.status(400).json({ error: "Current password is incorrect" });
    return;
  }

  // Signs out every other session of this user
  await setUserPassword(userId, newPassword);

  // The current password was just proven: this session gets a fresh token,
  // and its 30 days restart
  setTokenCookie(
    res,
    generateToken({
      id: userId,
      username: req.user.username,
      role: req.user.role,
    })
  );

  res.json({ success: true, message: "Password changed successfully" });
};

/**
 * Whether the current user has a recovery key. Only its hash is stored, so the
 * key itself cannot be shown again.
 */
export const getRecoveryKey = async (
  req: TypedAuthRequest,
  res: TypedResponse<GetRecoveryKeyResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { recoveryKeyHash: true },
  });

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({ hasRecoveryKey: !!user.recoveryKeyHash });
};

/**
 * Create a new recovery key for the current user, replacing the old one.
 * Needs the current password; the key is returned this once and only its
 * hash is stored.
 */
export const regenerateRecoveryKey = async (
  req: TypedAuthRequest<RegenerateRecoveryKeyBody>,
  res: TypedResponse<RegenerateRecoveryKeyResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;

  // Express 5 leaves req.body undefined when the request has no body
  const { currentPassword } =
    (req.body as Partial<RegenerateRecoveryKeyBody> | undefined) ?? {};
  if (!currentPassword) {
    res.status(400).json({ error: "Current password is required" });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { password: true },
  });

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // 400, not 401: the client treats 401 as a lost session
  const validPassword = await bcrypt.compare(currentPassword, user.password);
  if (!validPassword) {
    res.status(400).json({ error: "Current password is incorrect" });
    return;
  }

  const newKey = generateRecoveryKey();
  await prisma.user.update({
    where: { id: userId },
    data: { recoveryKeyHash: hashRecoveryKey(newKey) },
  });

  res.json({ recoveryKey: formatRecoveryKey(newKey) });
};

/**
 * Get all users (admin only)
 */
export const getAllUsers = async (
  req: TypedAuthRequest,
  res: TypedResponse<GetAllUsersResponse | ApiErrorResponse>
) => {
  // Check if user is admin
  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      role: true,
      createdAt: true,
      updatedAt: true,
      syncToStash: true,
      groupMemberships: {
        select: {
          group: {
            select: { id: true, name: true },
          },
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  res.json({
    users: users.map((u) => ({
      ...u,
      groups: u.groupMemberships.map((m) => m.group),
      groupMemberships: undefined,
    })),
  });
};

/**
 * Create new user (admin only)
 */
export const createUser = async (
  req: TypedAuthRequest<CreateUserBody>,
  res: TypedResponse<CreateUserResponse | ApiErrorResponse>
) => {
  // Check if user is admin
  const { username, password, role } = req.body;

  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    !username ||
    !password ||
    username.length > USERNAME_MAX_LENGTH
  ) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  if (role && role !== "ADMIN" && role !== "USER") {
    res.status(400).json({ error: "Role must be either ADMIN or USER" });
    return;
  }

  // Check if username already exists
  const existingUser = await prisma.user.findUnique({
    where: { username },
  });

  if (existingUser) {
    res.status(409).json({ error: "Username already exists" });
    return;
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create user with default carousel preferences
  const newUser = await prisma.user.create({
    data: {
      username,
      password: hashedPassword,
      role: (emptyToNull(role) ?? "USER") as "ADMIN" | "USER",
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
};

/**
 * Delete user (admin only)
 */
export const deleteUser = async (
  req: TypedAuthRequest<never, DeleteUserParams>,
  res: TypedResponse<DeleteUserResponse | ApiErrorResponse>
) => {
  // Check if user is admin
  const { userId } = req.params;
  const userIdInt = parseInt(userId, 10);

  if (isNaN(userIdInt)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  // Prevent admin from deleting themselves
  if (userIdInt === req.user.id) {
    res.status(400).json({ error: "Cannot delete your own account" });
    return;
  }

  // Check if user exists
  const user = await prisma.user.findUnique({
    where: { id: userIdInt },
  });

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // The user's delete cascades to every per-user table. On a 200k-scene
  // library the heaviest user (42k rows: 18k plays, 6k stats and rankings,
  // 5k exclusions) held the lock 0.15 to 0.44 s, and 0.46 to 0.56 s with
  // its exclusions raised to 181k, so one unit is enough.
  await dbWriteBatch("user.delete", [
    prisma.user.delete({ where: { id: userIdInt } }),
  ]);
  rankingComputeService.forget(userIdInt);
  recommendationService.forget(userIdInt);

  // Their zips: stop the builds, then remove the folder (the sweep in
  // jobs/downloadCleanup.ts takes whatever this leaves)
  await downloadJobQueue.cancelUser(userIdInt);
  await fs.promises
    .rm(userDownloadsDir(userIdInt), { recursive: true, force: true })
    .catch((error: unknown) => {
      logger.warn("Could not remove a deleted user's downloads folder", {
        userId: userIdInt,
        error: error instanceof Error ? error.message : String(error),
      });
    });

  res.json({ success: true, message: "User deleted successfully" });
};

/**
 * Update user role (admin only)
 */
export const updateUserRole = async (
  req: TypedAuthRequest<UpdateUserRoleBody, UpdateUserRoleParams>,
  res: TypedResponse<UpdateUserRoleResponse | ApiErrorResponse>
) => {
  // Check if user is admin
  const { userId } = req.params;
  const { role } = req.body;
  const userIdInt = parseInt(userId, 10);

  if (isNaN(userIdInt)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  if (!role || (role !== "ADMIN" && role !== "USER")) {
    res.status(400).json({ error: "Role must be either ADMIN or USER" });
    return;
  }

  // Prevent admin from changing their own role
  if (userIdInt === req.user.id) {
    res.status(400).json({ error: "Cannot change your own role" });
    return;
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

  // Restrictions apply by role (item 13): promotion drops the restricted
  // and empty rows, demotion applies the kept restriction rows again.
  await exclusionComputationService.recomputeForUser(userIdInt);

  res.json({ success: true, user: updatedUser });
};

/**
 * Get user's filter presets
 */
export const getFilterPresets = async (
  req: TypedAuthRequest,
  res: TypedResponse<GetFilterPresetsResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      filterPresets: true,
    },
  });

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Return empty preset structure if none exists
  const presets = (user.filterPresets as FilterPresets | null) ?? {
    scene: [],
    performer: [],
    studio: [],
    tag: [],
  };

  res.json({ presets });
};

/**
 * Save a new filter preset
 */
export const saveFilterPreset = async (
  req: TypedAuthRequest<SaveFilterPresetBody>,
  res: TypedResponse<SaveFilterPresetResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;

  const {
    artifactType,
    context,
    name,
    filters,
    sort,
    direction,
    viewMode,
    zoomLevel,
    gridDensity,
    tableColumns,
    perPage,
    setAsDefault,
  } = req.body;

  // Validate required fields
  if (!artifactType || !name || !filters || !sort || !direction) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  // Validate artifact type
  const validTypes = [
    "scene",
    "performer",
    "studio",
    "tag",
    "group",
    "gallery",
    "image",
    "clip",
  ];
  if (!validTypes.includes(artifactType)) {
    res.status(400).json({ error: "Invalid artifact type" });
    return;
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
      "image",
      "clip",
    ];
    if (!validContexts.includes(context)) {
      res.status(400).json({ error: "Invalid context" });
      return;
    }
  }

  // Get current presets and defaults
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { filterPresets: true, defaultFilterPresets: true },
  });

  const currentPresets = (user?.filterPresets as FilterPresets | null) ?? {};
  const currentDefaults =
    (user?.defaultFilterPresets as DefaultFilterPresets | null) ?? {};

  // Create new preset
  const newPreset = {
    id: randomUUID(),
    name,
    filters,
    sort,
    direction,
    viewMode: emptyToNull(viewMode) ?? "grid",
    zoomLevel: emptyToNull(zoomLevel) ?? "medium",
    gridDensity: emptyToNull(gridDensity) ?? "comfortable",
    tableColumns: tableColumns ?? null,
    perPage: perPage ?? null,
    createdAt: new Date().toISOString(),
  };

  // Add preset to the appropriate artifact type array
  currentPresets[artifactType] = [
    ...(currentPresets[artifactType] ?? []),
    newPreset,
  ];

  // If setAsDefault is true, set this preset as default for the context
  if (setAsDefault) {
    const defaultContext = emptyToNull(context) ?? artifactType;
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
};

/**
 * Delete a filter preset
 */
export const deleteFilterPreset = async (
  req: TypedAuthRequest<never, DeleteFilterPresetParams>,
  res: TypedResponse<DeleteFilterPresetResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;

  const { artifactType, presetId } = req.params;

  // Validate artifact type
  const validTypes = [
    "scene",
    "performer",
    "studio",
    "tag",
    "group",
    "gallery",
    "image",
    "clip",
  ];
  if (!artifactType || !validTypes.includes(artifactType)) {
    res.status(400).json({ error: "Invalid artifact type" });
    return;
  }

  // Get current presets and defaults
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { filterPresets: true, defaultFilterPresets: true },
  });

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const currentPresets = (user.filterPresets as FilterPresets | null) ?? {};
  const currentDefaults =
    (user.defaultFilterPresets as DefaultFilterPresets | null) ?? {};

  // Remove preset from the appropriate artifact type array
  currentPresets[artifactType] = (currentPresets[artifactType] ?? []).filter(
    (preset: FilterPreset) => preset.id !== presetId
  );

  // If this was the default preset, clear the default
  if (currentDefaults[artifactType] === presetId) {
    currentDefaults[artifactType] = undefined;
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
};

/**
 * Get default filter presets
 */
export const getDefaultFilterPresets = async (
  req: TypedAuthRequest,
  res: TypedResponse<GetDefaultFilterPresetsResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;

  // Get user's default presets
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      defaultFilterPresets: true,
    },
  });

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Return empty object if no defaults set
  const defaults =
    (user.defaultFilterPresets as DefaultFilterPresets | null) ?? {};

  res.json({ defaults });
};

/**
 * Set default filter preset for a context
 * Context can be an artifact type (scene, performer, etc.) or a scene grid context
 * (scene_performer, scene_tag, scene_studio, scene_group)
 */
export const setDefaultFilterPreset = async (
  req: TypedAuthRequest<SetDefaultFilterPresetBody>,
  res: TypedResponse<SetDefaultFilterPresetResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;

  const { context, presetId } = req.body;

  // Validate required fields
  if (!context) {
    res.status(400).json({ error: "Missing context" });
    return;
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
    res.status(400).json({ error: "Invalid context" });
    return;
  }

  // Get current defaults
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultFilterPresets: true, filterPresets: true },
  });

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const currentDefaults =
    (user.defaultFilterPresets as DefaultFilterPresets | null) ?? {};
  const currentPresets = (user.filterPresets as FilterPresets | null) ?? {};

  // If presetId is provided, validate it exists
  // For scene grid contexts (scene_performer, etc.), validate against "scene" presets
  if (presetId) {
    const artifactType = context.startsWith("scene_") ? "scene" : context;
    const presetExists = (currentPresets[artifactType] ?? []).some(
      (preset: FilterPreset) => preset.id === presetId
    );

    if (!presetExists) {
      res.status(400).json({ error: "Preset not found" });
      return;
    }

    currentDefaults[context] = presetId;
  } else {
    // If presetId is null/undefined, clear the default
    currentDefaults[context] = undefined;
  }

  // Update user
  await prisma.user.update({
    where: { id: userId },
    data: {
      defaultFilterPresets: currentDefaults as never,
    },
  });

  res.json({ success: true, defaults: currentDefaults });
};

/**
 * POST /api/user/:userId/sync-from-stash: the admin's one-off import of a
 * user's ratings, favorites, O counts and plays from every Stash instance
 * (StashImportService). Admin only.
 */
export const syncFromStash = async (
  req: TypedAuthRequest<SyncFromStashBody, SyncFromStashParams>,
  res: TypedResponse<SyncFromStashResponse | ApiErrorResponse>
) => {
  const startTime = Date.now();

  const targetUserId = parseInt(req.params.userId);
  if (isNaN(targetUserId)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true },
  });
  if (!target) throw new NotFoundError("User not found");

  const options = importOptionsFrom(req.body.options);
  const instances = stashInstanceManager.getAll();
  if (instances.length === 0) {
    res.status(400).json({ error: "No Stash instances configured" });
    return;
  }

  const { stats, failedInstances } = await importFromStash(
    targetUserId,
    options,
    instances
  );
  if (failedInstances.length === instances.length) {
    throw new AppError(
      "Sync from Stash failed for every Stash instance",
      502,
      "UPSTREAM_ERROR"
    );
  }

  logger.info("syncFromStash completed", {
    totalTime: `${Date.now() - startTime}ms`,
    targetUserId,
    failedInstances,
    ...stats,
  });

  res.json({
    success: failedInstances.length === 0,
    message:
      failedInstances.length === 0
        ? "Successfully synced ratings and favorites from Stash"
        : `Synced from Stash, except for ${failedInstances.join(", ")}, which failed`,
    stats,
    failedInstances,
  });
};

function isRestrictableEntityType(
  value: string
): value is RestrictableEntityType {
  return (RESTRICTABLE_ENTITY_TYPES as readonly string[]).includes(value);
}

/**
 * A stored list's entries, or null when it is not a JSON array of strings.
 * The editor reads null as unreadable rather than empty: saved back as
 * empty, a lost Show-only list would show the user everything.
 */
function parseStoredRestrictionIds(entityIds: string): string[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(entityIds);
  } catch {
    return null;
  }
  return Array.isArray(parsed) &&
    parsed.every((id): id is string => typeof id === "string")
    ? parsed
    : null;
}

/**
 * Get content restrictions for a user (Admin only), each list parsed
 */
export const getUserRestrictions = async (
  req: TypedAuthRequest<never, GetUserRestrictionsParams>,
  res: TypedResponse<GetUserRestrictionsResponse | ApiErrorResponse>
) => {
  const targetUserId = parseInt(req.params.userId);
  if (isNaN(targetUserId)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }
  const rows = await prisma.userContentRestriction.findMany({
    where: { userId: targetUserId },
    select: {
      id: true,
      entityType: true,
      mode: true,
      entityIds: true,
      restrictEmpty: true,
    },
  });

  res.json({
    restrictions: rows.map((row) => {
      const entityIds = parseStoredRestrictionIds(row.entityIds);
      return { ...row, entityIds, unreadable: entityIds === null };
    }),
  });
};

/**
 * Update content restrictions for a user (Admin only)
 * Replaces all existing restrictions with new ones
 */
export const updateUserRestrictions = async (
  req: TypedAuthRequest<UpdateUserRestrictionsBody, GetUserRestrictionsParams>,
  res: TypedResponse<UpdateUserRestrictionsResponse | ApiErrorResponse>
) => {
  const { userId } = req.params;
  const { restrictions } = req.body;
  const targetUserId = parseInt(userId);
  if (isNaN(targetUserId)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  // Restrictions apply to non-admin accounts only (item 13)
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { role: true },
  });
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (!restrictionsApplyTo(target.role)) {
    res
      .status(400)
      .json({ error: "Content restrictions do not apply to administrators" });
    return;
  }

  // Validate input
  if (!Array.isArray(restrictions)) {
    res.status(400).json({ error: "Restrictions must be an array" });
    return;
  }

  // Validate each restriction: one row per (type, mode), a non-empty list of
  // "id" or "id:instanceId" strings whose instance exists, and an optional
  // boolean restrictEmpty
  const seenPairs = new Set<string>();
  const rows: RestrictionRowInput[] = [];
  const namedInstances = new Map<string, string>(); // instanceId -> an entry
  // Entries without an instance, each with the list it came in
  const bareEntries: Array<{ entityType: string; mode: string; id: string }> =
    [];
  for (const r of restrictions) {
    if (!isRestrictableEntityType(r.entityType)) {
      res.status(400).json({ error: `Invalid entity type: ${r.entityType}` });
      return;
    }
    if (!(RESTRICTION_MODES as readonly string[]).includes(r.mode)) {
      res.status(400).json({ error: `Invalid mode: ${r.mode}` });
      return;
    }
    const mode = r.mode as RestrictionMode;
    const pair = compositeKey(r.entityType, mode);
    if (seenPairs.has(pair)) {
      res.status(400).json({
        error: `Only one ${mode} list is allowed for ${r.entityType}`,
      });
      return;
    }
    seenPairs.add(pair);
    if (!Array.isArray(r.entityIds) || r.entityIds.length === 0) {
      res.status(400).json({
        error: `entityIds for ${r.entityType} ${mode} must be a non-empty array`,
      });
      return;
    }
    const entityIds: string[] = [];
    for (const id of r.entityIds) {
      if (typeof id !== "string" || !/^\d+(:[^:\s]+)?$/.test(id)) {
        res.status(400).json({
          error: `Invalid entity id in ${r.entityType} ${mode}: ${id}`,
        });
        return;
      }
      const { instanceId } = parseEntityRef(id);
      if (instanceId === undefined) {
        bareEntries.push({ entityType: r.entityType, mode, id });
      } else if (!namedInstances.has(instanceId)) {
        namedInstances.set(instanceId, id);
      }
      entityIds.push(id);
    }
    if (r.restrictEmpty !== undefined && typeof r.restrictEmpty !== "boolean") {
      res
        .status(400)
        .json({ error: "restrictEmpty must be a boolean when present" });
      return;
    }
    rows.push({
      entityType: r.entityType,
      mode,
      entityIds,
      restrictEmpty: r.restrictEmpty ?? defaultRestrictEmpty(mode),
    });
  }

  // The instance half of every "id:instanceId" entry names a configured
  // Stash server, enabled or not (a disabled one's entries wait for it)
  if (namedInstances.size > 0) {
    const known = new Set(
      (
        await prisma.stashInstance.findMany({
          where: { id: { in: [...namedInstances.keys()] } },
          select: { id: true },
        })
      ).map((i) => i.id)
    );
    for (const [instanceId, entry] of namedInstances) {
      if (!known.has(instanceId)) {
        res.status(400).json({
          error: `Unknown Stash instance in entity id: ${entry}`,
        });
        return;
      }
    }
  }

  // A bare id matches that id on every instance, so a Show-only list would
  // show another server's entity of that id. The editor sends "id:instanceId";
  // a bare id passes only when a stored list of its type already holds it
  // (a list saved before entries named their instance, saved again)
  if (bareEntries.length > 0) {
    const types = [...new Set(bareEntries.map((e) => e.entityType))];
    const stored = await prisma.userContentRestriction.findMany({
      where: { userId: targetUserId, entityType: { in: types } },
      select: { entityType: true, entityIds: true },
    });
    const storedBare = new Set(
      stored.flatMap((row) =>
        (parseStoredRestrictionIds(row.entityIds) ?? []).map((id) =>
          compositeKey(row.entityType, id)
        )
      )
    );
    const unnamed = bareEntries.find(
      (e) => !storedBare.has(compositeKey(e.entityType, e.id))
    );
    if (unnamed) {
      res.status(400).json({
        error: `Entity id in ${unnamed.entityType} ${unnamed.mode} needs its instance: ${unnamed.id}`,
      });
      return;
    }
  }

  // The rows and the exclusions they produce are written in one unit: the
  // recompute runs on these rows and its swap stores both, so a failure
  // leaves the user's old restrictions and old exclusions in place
  await exclusionComputationService.saveRestrictions(targetUserId, rows);

  const saved = await prisma.userContentRestriction.findMany({
    where: { userId: targetUserId },
  });

  res.json({
    success: true,
    message: "Content restrictions updated successfully",
    restrictions: saved,
  });
};

/**
 * Delete all content restrictions for a user (Admin only)
 */
export const deleteUserRestrictions = async (
  req: TypedAuthRequest<never, DeleteUserRestrictionsParams>,
  res: TypedResponse<DeleteUserRestrictionsResponse | ApiErrorResponse>
) => {
  const targetUserId = parseInt(req.params.userId);
  if (isNaN(targetUserId)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true },
  });
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Allowed for an admin target too (their rows are inert): the rows and
  // the exclusions they produced go in one unit, like a save
  await exclusionComputationService.saveRestrictions(targetUserId, []);

  res.json({
    success: true,
    message: "All content restrictions removed successfully",
  });
};

/**
 * Validate one hide target from a request body. Hidden ids are stored and
 * later reach exclusion queries, so only numeric Stash ids are accepted. A
 * hide names its instance: a bare id could mean the same id on another
 * server. `unknownHideInstance` then checks that the instance exists.
 */
function validateHideTarget(target: {
  entityType?: unknown;
  entityId?: unknown;
  instanceId?: unknown;
}):
  | { ok: true; entityType: EntityType; entityId: string; instanceId: string }
  | { ok: false; error: string } {
  const { entityType, entityId, instanceId } = target;

  if (!entityType || !entityId) {
    return { ok: false, error: "entityType and entityId are required" };
  }

  if (typeof entityType !== "string") {
    return { ok: false, error: `Invalid entity type: ${typeof entityType}` };
  }
  if (!isHideableEntityType(entityType)) {
    return { ok: false, error: `Invalid entity type: ${entityType}` };
  }

  if (typeof entityId !== "string" || !/^\d+$/.test(entityId)) {
    return {
      ok: false,
      error: "Invalid entityId: expected a numeric Stash id",
    };
  }

  if (instanceId === undefined || instanceId === null || instanceId === "") {
    return { ok: false, error: "instanceId is required" };
  }
  if (typeof instanceId !== "string") {
    return { ok: false, error: "Invalid instanceId" };
  }

  return { ok: true, entityType, entityId, instanceId };
}

/**
 * The index of the first target whose instance names no configured Stash
 * server (enabled or not), or -1. One query for the whole batch.
 */
async function unknownHideInstance(targets: HideTarget[]): Promise<number> {
  const named = [...new Set(targets.map((t) => t.instanceId))];
  const known = new Set(
    (
      await prisma.stashInstance.findMany({
        where: { id: { in: named } },
        select: { id: true },
      })
    ).map((i) => i.id)
  );
  return targets.findIndex((t) => !known.has(t.instanceId));
}

/**
 * The optional `entityType` filter of the Hidden Items routes: absent or ""
 * is no filter, a hideable type filters, and anything else is `false`.
 */
function hideTypeFilter(value: unknown): EntityType | undefined | false {
  if (value === undefined || value === "") return undefined;
  return isHideableEntityType(value) ? value : false;
}

interface HideTarget {
  entityType: EntityType;
  entityId: string;
  instanceId: string;
}

type HideAccess = "hide" | "already-hidden" | "not-found";

/**
 * May this user hide these targets? Hiding requires visibility: the user
 * must see the entity on the target's instance. A target this user has
 * already hidden (on that instance, or by a legacy row for every instance)
 * is "already-hidden": a repeat hide succeeds without writing. Anything else
 * is "not-found", the same answer as an id that does not exist, so a hide
 * never reveals whether a restricted entity exists.
 *
 * One query for the user's existing hides, then one visibility query per
 * entity type, whatever the batch size.
 */
async function checkHideTargets(
  userId: number,
  targets: HideTarget[]
): Promise<HideAccess[]> {
  const alreadyHidden = await userHiddenEntityService.findAlreadyHidden(
    userId,
    targets.map(({ entityType, entityId, instanceId }) => ({
      entityType,
      entityId,
      instanceId,
    }))
  );

  const byType = new Map<EntityType, EntityRef[]>();
  targets.forEach((target, i) => {
    if (alreadyHidden[i]) return;
    const refs = byType.get(target.entityType) ?? [];
    refs.push({ id: target.entityId, instanceId: target.instanceId });
    byType.set(target.entityType, refs);
  });

  const visibleKeys = new Map<EntityType, Set<string>>();
  for (const [entityType, refs] of byType) {
    visibleKeys.set(
      entityType,
      await getVisibleEntityKeys(userId, entityType, refs)
    );
  }

  return targets.map((target, i) => {
    if (alreadyHidden[i]) return "already-hidden";
    const visible = visibleKeys
      .get(target.entityType)
      ?.has(entityKey(target.entityId, target.instanceId));
    return visible ? "hide" : "not-found";
  });
}

/**
 * Hide an entity for the current user
 */
export const hideEntity = async (
  req: TypedAuthRequest<HideEntityBody>,
  res: TypedResponse<HideEntityResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;

  const target = validateHideTarget(req.body);
  if (!target.ok) {
    res.status(400).json({ error: target.error });
    return;
  }
  if ((await unknownHideInstance([target])) !== -1) {
    res.status(400).json({ error: "Invalid instanceId" });
    return;
  }

  const [access] = await checkHideTargets(userId, [target]);
  if (access === "not-found") {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (access === "hide") {
    await userHiddenEntityService.hideEntity(
      userId,
      target.entityType,
      target.entityId,
      target.instanceId
    );
  }

  res.json({ success: true, message: "Entity hidden successfully" });
};

/**
 * Unhide (restore) an entity for the current user
 */
export const unhideEntity = async (
  req: TypedAuthRequest<never, UnhideEntityParams, UnhideEntityQuery>,
  res: TypedResponse<UnhideEntityResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;

  const { entityType, entityId } = req.params;

  if (!entityType || !entityId) {
    res.status(400).json({ error: "Entity type and entity ID are required" });
    return;
  }

  if (!isHideableEntityType(entityType)) {
    res.status(400).json({ error: "Invalid entity type" });
    return;
  }

  // A repeated ?instanceId= arrives as an array; it names no one instance
  const requested: unknown = req.query.instanceId;
  if (requested !== undefined && typeof requested !== "string") {
    res.status(400).json({ error: "instanceId must be a string" });
    return;
  }

  // Without an instance, the legacy row stored for every instance ("") goes
  const unhideInstanceId = requested ?? "";

  // Validate instanceId if provided, against the database as a hide does
  if (unhideInstanceId) {
    const target = { entityType, entityId, instanceId: unhideInstanceId };
    if ((await unknownHideInstance([target])) !== -1) {
      res.status(400).json({ error: "Invalid instanceId" });
      return;
    }
  }

  await userHiddenEntityService.unhideEntity(
    userId,
    entityType,
    entityId,
    unhideInstanceId
  );

  res.json({ success: true, message: "Entity restored successfully" });
};

/**
 * Unhide all entities for the current user
 * Optionally filter by entity type
 */
export const unhideAllEntities = async (
  req: TypedAuthRequest<never, Record<string, string>, UnhideAllEntitiesQuery>,
  res: TypedResponse<UnhideAllEntitiesResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;

  const entityType = hideTypeFilter(req.query.entityType);
  if (entityType === false) {
    res.status(400).json({ error: "Invalid entity type" });
    return;
  }

  const count = await userHiddenEntityService.unhideAll(userId, entityType);

  res.json({
    success: true,
    message: `${count} items restored successfully`,
    count,
  });
};

const HIDDEN_PER_PAGE_DEFAULT = 50;
const HIDDEN_PER_PAGE_MAX = 100;

/** A positive integer query value, its default when absent, or null */
function positiveIntParam(
  value: string | string[] | undefined,
  fallback: number
): number | null {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return n >= 1 && Number.isSafeInteger(n) ? n : null;
}

/**
 * One page of the current user's hidden items, newest first, with the
 * number of each type. `entityType` narrows the page (not the counts);
 * `per_page` is 1 to 100, default 50. Outside the library-ready gate on
 * purpose: a user whose servers are all on their first sync can still
 * restore items. The allowed instances apply in the summary's visibility
 * check (resolveVisibleApartFromOwnHides).
 */
export const getHiddenEntities = async (
  req: TypedAuthRequest<never, Record<string, string>, GetHiddenEntitiesQuery>,
  res: TypedResponse<GetHiddenEntitiesResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;

  const entityType = hideTypeFilter(req.query.entityType);
  if (entityType === false) {
    res.status(400).json({ error: "Invalid entity type" });
    return;
  }
  const page = positiveIntParam(req.query.page, 1);
  if (page === null) {
    res.status(400).json({ error: "page must be a positive integer" });
    return;
  }
  const perPage = positiveIntParam(req.query.per_page, HIDDEN_PER_PAGE_DEFAULT);
  if (perPage === null || perPage > HIDDEN_PER_PAGE_MAX) {
    res.status(400).json({
      error: `per_page must be an integer from 1 to ${HIDDEN_PER_PAGE_MAX}`,
    });
    return;
  }

  res.json(
    await userHiddenEntityService.getHiddenEntities(userId, {
      entityType,
      page,
      perPage,
    })
  );
};

/**
 * Hide multiple entities in a single request: all of them or none
 */
export const hideEntities = async (
  req: TypedAuthRequest<HideEntitiesBody>,
  res: TypedResponse<HideEntitiesResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;

  const { entities } = req.body;

  if (!Array.isArray(entities) || entities.length === 0) {
    res.status(400).json({ error: "entities must be a non-empty array" });
    return;
  }

  // Validate and check every entity before hiding any
  const targets: HideTarget[] = [];
  for (const [i, entity] of entities.entries()) {
    const target = validateHideTarget(entity);
    if (!target.ok) {
      res.status(400).json({ error: `entities[${i}]: ${target.error}` });
      return;
    }
    targets.push(target);
  }
  const unknown = await unknownHideInstance(targets);
  if (unknown !== -1) {
    res.status(400).json({ error: `entities[${unknown}]: Invalid instanceId` });
    return;
  }
  const access = await checkHideTargets(userId, targets);
  const notFound = access.indexOf("not-found");
  if (notFound !== -1) {
    res.status(404).json({ error: `entities[${notFound}]: Not found` });
    return;
  }
  const toHide = targets
    .filter((_, i) => access[i] === "hide")
    .map(({ entityType, entityId, instanceId }) => ({
      entityType,
      entityId,
      instanceId,
    }));

  // All or nothing, in one unit: a failure answers 500 with nothing
  // written. The ones already hidden count as hidden
  if (toHide.length > 0) {
    await userHiddenEntityService.hideEntities(userId, toHide);
  }

  res.json({
    success: true,
    message: `${targets.length} entities hidden successfully`,
    successCount: targets.length,
    failCount: 0,
  });
};

/**
 * Update hide confirmation preference
 */
export const updateHideConfirmation = async (
  req: TypedAuthRequest<UpdateHideConfirmationBody>,
  res: TypedResponse<UpdateHideConfirmationResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;

  const { hideConfirmationDisabled } = req.body;

  if (typeof hideConfirmationDisabled !== "boolean") {
    res
      .status(400)
      .json({ error: "hideConfirmationDisabled must be a boolean" });
    return;
  }

  await prisma.user.update({
    where: { id: userId },
    data: { hideConfirmationDisabled },
  });

  res.json({ success: true, hideConfirmationDisabled });
};

/**
 * Get current user's resolved permissions
 */
export const getUserPermissions = async (
  req: TypedAuthRequest,
  res: TypedResponse<{ permissions: unknown } | ApiErrorResponse>
) => {
  const permissions = await resolveUserPermissions(req.user.id);

  if (!permissions) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({ permissions });
};

/**
 * Admin endpoint to get any user's permissions
 */
export const getAnyUserPermissions = async (
  req: TypedAuthRequest<never, GetUserPermissionsParams>,
  res: TypedResponse<{ permissions: unknown } | ApiErrorResponse>
) => {
  const userId = parseInt(req.params.userId);
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  const permissions = await resolveUserPermissions(userId);

  if (!permissions) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({ permissions });
};

/**
 * Admin endpoint to update user permission overrides
 */
export const updateUserPermissionOverrides = async (
  req: TypedAuthRequest<
    UpdatePermissionOverridesBody,
    GetUserPermissionsParams
  >,
  res: TypedResponse<{ success: true; permissions: unknown } | ApiErrorResponse>
) => {
  const userId = parseInt(req.params.userId);
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  const {
    canShareOverride,
    canDownloadFilesOverride,
    canDownloadPlaylistsOverride,
  } = req.body;

  // Validate values (must be boolean or null)
  const validateOverride = (value: unknown): boolean | null | undefined => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value === "boolean") return value;
    throw new Error("Invalid override value");
  };

  try {
    const updates: Record<string, boolean | null> = {};

    const shareOverride = validateOverride(canShareOverride);
    if (shareOverride !== undefined) updates.canShareOverride = shareOverride;

    const filesOverride = validateOverride(canDownloadFilesOverride);
    if (filesOverride !== undefined)
      updates.canDownloadFilesOverride = filesOverride;

    const playlistsOverride = validateOverride(canDownloadPlaylistsOverride);
    if (playlistsOverride !== undefined)
      updates.canDownloadPlaylistsOverride = playlistsOverride;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No valid updates provided" });
      return;
    }

    await prisma.user.update({
      where: { id: userId },
      data: updates,
    });

    // Return updated permissions
    const permissions = await resolveUserPermissions(userId);
    res.json({ success: true, permissions });
  } catch {
    res.status(400).json({
      error: "Invalid override value - must be true, false, or null",
    });
  }
};

/**
 * Get user's group memberships (admin only)
 */
export const getUserGroupMemberships = async (
  req: TypedAuthRequest<never, GetUserGroupMembershipsParams>,
  res: TypedResponse<GetUserGroupMembershipsResponse | ApiErrorResponse>
) => {
  const userId = parseInt(req.params.userId);
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  const memberships = await prisma.userGroupMembership.findMany({
    where: { userId },
    include: { group: { select: USER_GROUP_SUMMARY_SELECT } },
  });

  res.json({ groups: memberships.map((m) => m.group) });
};

/**
 * Admin: Reset a user's password
 */
export const adminResetPassword = async (
  req: TypedAuthRequest<AdminResetPasswordBody, AdminResetPasswordParams>,
  res: TypedResponse<AdminResetPasswordResponse | ApiErrorResponse>
) => {
  // Check if user is admin
  const { userId } = req.params;
  const { newPassword } = req.body;
  const userIdInt = parseInt(userId, 10);

  if (isNaN(userIdInt)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  if (!newPassword) {
    res.status(400).json({ error: "New password is required" });
    return;
  }

  const passwordValidation = validatePassword(newPassword);
  if (!passwordValidation.valid) {
    res.status(400).json({ error: passwordValidation.errors.join(". ") });
    return;
  }

  // Check if user exists
  const user = await prisma.user.findUnique({
    where: { id: userIdInt },
  });

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Also signs the user out everywhere
  await setUserPassword(userIdInt, newPassword);

  res.json({ success: true });
};

/**
 * Admin: Regenerate a user's recovery key
 */
export const adminRegenerateRecoveryKey = async (
  req: TypedAuthRequest<never, AdminRegenerateRecoveryKeyParams>,
  res: TypedResponse<AdminRegenerateRecoveryKeyResponse | ApiErrorResponse>
) => {
  // Check if user is admin
  const { userId } = req.params;
  const userIdInt = parseInt(userId, 10);

  if (isNaN(userIdInt)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  // Check if user exists
  const user = await prisma.user.findUnique({
    where: { id: userIdInt },
  });

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Only the hash is stored; the admin passes the key on
  const newKey = generateRecoveryKey();
  await prisma.user.update({
    where: { id: userIdInt },
    data: { recoveryKeyHash: hashRecoveryKey(newKey) },
  });

  res.json({ recoveryKey: formatRecoveryKey(newKey) });
};

// =============================================================================
// USER STASH INSTANCE SELECTION
// =============================================================================

/**
 * Get user's selected Stash instances
 * GET /api/user/stash-instances
 *
 * Returns:
 * - selectedInstanceIds: IDs the user has selected (empty = all enabled)
 * - availableInstances: All enabled instances for selection UI
 */
export const getUserStashInstances = async (
  req: TypedAuthRequest,
  res: TypedResponse<
    | { selectedInstanceIds: string[]; availableInstances: unknown[] }
    | ApiErrorResponse
  >
) => {
  const userId = req.user.id;
  // Get user's selected instances
  const userSelections = await prisma.userStashInstance.findMany({
    where: { userId },
    select: { instanceId: true },
  });
  const selectedInstanceIds = userSelections.map((s) => s.instanceId);

  // Get all enabled instances for the selection UI
  const availableInstances = await prisma.stashInstance.findMany({
    where: { enabled: true },
    select: {
      id: true,
      name: true,
      description: true,
    },
    orderBy: { priority: "asc" },
  });

  res.json({
    selectedInstanceIds,
    availableInstances,
  });
};

const instanceSelectionSchema = z
  .array(z.string().regex(INSTANCE_ID_PATTERN))
  .max(100);

/** The body's instance ids, each once; a value that is not an id list is a 400 naming its path */
function parseInstanceSelection(value: unknown, field: string): string[] {
  const parsed = instanceSelectionSchema.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError("Invalid request", {
      issues: parsed.error.issues.map((issue) => ({
        path: [field, ...issue.path].map(String).join("."),
        message: issue.message,
      })),
    });
  }
  return [...new Set(parsed.data)];
}

/** Replaces the user's selection in one unit: no reader sees the deleted rows without the created ones */
function replaceInstanceSelection(userId: number, instanceIds: string[]) {
  return dbWriteTransaction("user.instances", async (tx) => {
    await tx.userStashInstance.deleteMany({ where: { userId } });
    if (instanceIds.length > 0) {
      await tx.userStashInstance.createMany({
        data: instanceIds.map((instanceId) => ({ userId, instanceId })),
      });
    }
  });
}

/**
 * Update user's Stash instance selection
 * PUT /api/user/stash-instances
 *
 * Body: { instanceIds: string[] }
 * - Empty array means "show all enabled instances" (clears all selections)
 * - Non-empty array means "show only these instances"
 */
export const updateUserStashInstances = async (
  req: TypedAuthRequest<UpdateUserStashInstancesBody>,
  res: TypedResponse<
    { success: true; selectedInstanceIds: string[] } | ApiErrorResponse
  >
) => {
  const userId = req.user.id;
  const instanceIds = parseInstanceSelection(
    req.body.instanceIds,
    "instanceIds"
  );

  // Validate that all instance IDs exist and are enabled
  if (instanceIds.length > 0) {
    const validInstances = await prisma.stashInstance.findMany({
      where: {
        id: { in: instanceIds },
        enabled: true,
      },
      select: { id: true },
    });

    const validIds = new Set(validInstances.map((i) => i.id));
    const invalidIds = instanceIds.filter((id) => !validIds.has(id));

    if (invalidIds.length > 0) {
      res.status(400).json({
        error: "Invalid instance IDs",
        details: invalidIds.join(", "),
      });
      return;
    }
  }

  await replaceInstanceSelection(userId, instanceIds);

  // The user's scope changed: their exclusion rows must cover it before
  // anything on the added instances is listed to them
  await exclusionComputationService.recomputeForUser(userId);

  res.json({
    success: true,
    selectedInstanceIds: instanceIds,
  });
};

/**
 * Get setup status for first-login wizard
 * GET /api/user/setup-status
 */
export const getSetupStatus = async (
  req: TypedAuthRequest,
  res: TypedResponse<
    | {
        setupCompleted: boolean;
        instances: unknown[];
        instanceCount: number;
      }
    | ApiErrorResponse
  >
) => {
  const userId = req.user.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      setupCompleted: true,
    },
  });

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Get enabled instances for selection
  const instances = await prisma.stashInstance.findMany({
    where: { enabled: true },
    select: {
      id: true,
      name: true,
      description: true,
    },
    orderBy: { priority: "asc" },
  });

  const instanceCount = instances.length;

  res.json({
    setupCompleted: user.setupCompleted,
    instances,
    instanceCount,
  });
};

/**
 * Complete first-login setup
 * POST /api/user/complete-setup
 */
export const completeSetup = async (
  req: TypedAuthRequest<CompleteSetupBody>,
  res: TypedResponse<CompleteSetupResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;
  const { selectedInstanceIds: requestedIds } = req.body;

  // Check if multi-instance - require at least one selection
  const instanceCount = await prisma.stashInstance.count({
    where: { enabled: true },
  });

  if (instanceCount >= 2) {
    if (!Array.isArray(requestedIds) || requestedIds.length === 0) {
      res.status(400).json({
        error: "At least one Stash instance must be selected",
      });
      return;
    }
    const selectedInstanceIds = parseInstanceSelection(
      requestedIds,
      "selectedInstanceIds"
    );

    // Validate instance IDs
    const validInstances = await prisma.stashInstance.findMany({
      where: {
        id: { in: selectedInstanceIds },
        enabled: true,
      },
      select: { id: true },
    });

    const validIds = new Set(validInstances.map((i) => i.id));
    const invalidIds = selectedInstanceIds.filter((id) => !validIds.has(id));

    if (invalidIds.length > 0) {
      res.status(400).json({
        error: "Invalid instance IDs",
        details: invalidIds.join(", "),
      });
      return;
    }

    await replaceInstanceSelection(userId, selectedInstanceIds);

    // The user's scope changed with the selection (see
    // updateUserStashInstances)
    await exclusionComputationService.recomputeForUser(userId);
  }

  // Mark setup as complete and issue the first recovery key. The
  // conditional update issues at most one key per user: a repeated call
  // leaves the saved key alone and returns none.
  const key = generateRecoveryKey();
  const { count } = await prisma.user.updateMany({
    where: { id: userId, setupCompleted: false },
    data: {
      setupCompleted: true,
      setupCompletedAt: new Date(),
      recoveryKeyHash: hashRecoveryKey(key),
    },
  });

  res.json({
    success: true,
    recoveryKey: count === 1 ? formatRecoveryKey(key) : null,
  });
};
