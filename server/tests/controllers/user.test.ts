/**
 * Unit Tests for User Controller — Settings, Password, and Admin Operations
 *
 * Tests getUserSettings, updateUserSettings, changePassword, getRecoveryKey,
 * regenerateRecoveryKey, adminResetPassword, adminRegenerateRecoveryKey,
 * getAllUsers, createUser, deleteUser, updateUserRole.
 */
import type { User, UserContentRestriction } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminRegenerateRecoveryKey,
  adminResetPassword,
  changePassword,
  createUser,
  deleteUser,
  deleteUserRestrictions,
  getAllUsers,
  getRecoveryKey,
  getUserRestrictions,
  getUserSettings,
  regenerateRecoveryKey,
  updateUserRestrictions,
  updateUserRole,
  updateUserSettings,
  updateUserStashInstances,
} from "../../controllers/user.js";
import prisma from "../../prisma/singleton.js";
import userRoutes from "../../routes/user.js";
import { exclusionComputationService } from "../../services/ExclusionComputationService.js";
import { rankingComputeService } from "../../services/RankingComputeService.js";
import { recommendationService } from "../../services/RecommendationService.js";
import type { UserRestriction } from "../../types/api/index.js";
import { validatePassword } from "../../utils/passwordValidation.js";
import { authenticated } from "../../utils/routeHelpers.js";
import {
  malformed,
  reqFor,
  resFor,
  runRoute,
} from "../helpers/controllerTestUtils.js";
import { type UserWithGroups, userRow } from "../helpers/fixtures.js";
import { anyOf, objectContaining } from "../helpers/matchers.js";
import { must } from "../helpers/must.js";
import { partialRow, prismaImpl } from "../helpers/prismaMock.js";

// Mock prisma
vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// Mock bcryptjs. `compare` is typed as its promise overload, the one the
// controller calls (the mocked module's type is the callback overload).
const { mockCompare } = vi.hoisted(() => ({
  mockCompare: vi
    .fn<(password: string, hash: string) => Promise<boolean>>()
    .mockResolvedValue(true),
}));
vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("hashed-password"),
    compare: mockCompare,
  },
}));

// Mock recoveryKey utils
vi.mock("../../utils/recoveryKey.js", () => ({
  generateRecoveryKey: vi.fn().mockReturnValue("ABCD1234EFGH5678"),
  formatRecoveryKey: vi.fn().mockReturnValue("ABCD-1234-EFGH-5678"),
  hashRecoveryKey: vi.fn().mockReturnValue("hashed-key"),
}));

// Mock passwordValidation
vi.mock("../../utils/passwordValidation.js", () => ({
  validatePassword: vi.fn().mockReturnValue({ valid: true, errors: [] }),
}));

// Mock PermissionService (imported by user.ts but not used by settings/password/admin ops directly)
vi.mock("../../services/PermissionService.js", () => ({
  resolveUserPermissions: vi.fn(),
}));

// Mock ExclusionComputationService
vi.mock("../../services/ExclusionComputationService.js", () => ({
  exclusionComputationService: {
    recomputeForUser: vi.fn().mockResolvedValue(undefined),
    saveRestrictions: vi.fn().mockResolvedValue(undefined),
  },
}));

// The per-user caches deleteUser drops
vi.mock("../../services/RankingComputeService.js", () => ({
  rankingComputeService: { forget: vi.fn() },
}));
vi.mock("../../services/RecommendationService.js", () => ({
  recommendationService: { forget: vi.fn() },
}));

const mockPrisma = vi.mocked(prisma, true);
const mockExclusions = vi.mocked(exclusionComputationService);
const mockRankings = vi.mocked(rankingComputeService, true);
const mockRecommendations = vi.mocked(recommendationService, true);
const mockBcrypt = vi.mocked(bcrypt);
const mockValidatePassword = vi.mocked(validatePassword);

const ADMIN = { id: 1, username: "admin", role: "ADMIN" };
const USER = { id: 2, username: "testuser", role: "USER" };

describe("User Controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── getUserSettings ───

  describe("getUserSettings", () => {
    it("returns 401 when user has no id", async () => {
      const req = reqFor(getUserSettings, { user: malformed({}) });
      const res = resFor(getUserSettings);
      await authenticated(getUserSettings)(req, res, vi.fn());
      expect(res._getStatus()).toBe(401);
    });

    it("returns 404 when user not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const req = reqFor(getUserSettings, { user: USER });
      const res = resFor(getUserSettings);
      await getUserSettings(req, res);
      expect(res._getStatus()).toBe(404);
    });

    it("returns user settings with defaults for null fields", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          id: 2,
          username: "testuser",
          role: "USER",
          preferredQuality: "1080p",
          preferredPlaybackMode: null,
          preferredPreviewQuality: null,
          enableCast: false,
          theme: "dark",
          carouselPreferences: null,
          navPreferences: null,
          filterPresets: null,
          minimumPlayPercent: 20,
          syncToStash: false,
          hideConfirmationDisabled: false,
          unitPreference: null,
          wallPlayback: null,
          tableColumnDefaults: null,
          cardDisplaySettings: null,
          landingPagePreference: null,
          lightboxDoubleTapAction: null,
        })
      );

      const req = reqFor(getUserSettings, { user: USER });
      const res = resFor(getUserSettings);
      await getUserSettings(req, res);

      const body = res._getOkBody();
      expect(body.settings.preferredQuality).toBe("1080p");
      expect(body.settings.unitPreference).toBe("metric"); // default
      expect(body.settings.wallPlayback).toBe("autoplay"); // default
      expect(body.settings.lightboxDoubleTapAction).toBe("favorite"); // default
      expect(body.settings.landingPagePreference).toEqual({
        pages: ["home"],
        randomize: false,
      }); // default
      expect(body.settings.carouselPreferences).toBeInstanceOf(Array); // default carousel prefs
      expect(body.settings.carouselPreferences.length).toBeGreaterThan(0);
    });

    it("a failure reaches the error handler: database error", async () => {
      mockPrisma.user.findUnique.mockRejectedValue(new Error("DB error"));
      const req = reqFor(getUserSettings, { user: USER });
      const res = resFor(getUserSettings);
      await expect(getUserSettings(req, res)).rejects.toThrow("DB error");
      expect(res.json).not.toHaveBeenCalled();
    });
  });

  // ─── updateUserSettings ───

  describe("updateUserSettings", () => {
    const mockUpdatedUser: User = partialRow({
      id: 2,
      preferredQuality: "720p",
      preferredPlaybackMode: null,
      theme: null,
      carouselPreferences: null,
      navPreferences: null,
      minimumPlayPercent: 20,
      syncToStash: false,
      wallPlayback: null,
      tableColumnDefaults: null,
      cardDisplaySettings: null,
      landingPagePreference: null,
      lightboxDoubleTapAction: null,
    });

    it("returns 401 when user has no id", async () => {
      const req = reqFor(updateUserSettings, { user: malformed({}) });
      const res = resFor(updateUserSettings);
      await authenticated(updateUserSettings)(req, res, vi.fn());
      expect(res._getStatus()).toBe(401);
    });

    it("returns 403 when non-admin updates another user", async () => {
      const req = reqFor(updateUserSettings, {
        params: { userId: "3" },
        user: USER,
      });
      const res = resFor(updateUserSettings);
      await updateUserSettings(req, res);
      expect(res._getStatus()).toBe(403);
    });

    it("allows admin to update another user's settings", async () => {
      mockPrisma.user.update.mockResolvedValue(mockUpdatedUser);
      const req = reqFor(updateUserSettings, {
        body: { preferredQuality: "720p" },
        params: { userId: "2" },
        user: ADMIN,
      });
      const res = resFor(updateUserSettings);
      await updateUserSettings(req, res);
      expect(res._getOkBody().success).toBe(true);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 2 } })
      );
    });

    it("updates own settings successfully", async () => {
      mockPrisma.user.update.mockResolvedValue(mockUpdatedUser);
      const req = reqFor(updateUserSettings, {
        body: { preferredQuality: "720p" },
        user: USER,
      });
      const res = resFor(updateUserSettings);
      await updateUserSettings(req, res);
      expect(res._getOkBody().success).toBe(true);
    });

    // Validation tests
    it("rejects invalid quality", async () => {
      const req = reqFor(updateUserSettings, {
        body: { preferredQuality: "4k" },
        user: USER,
      });
      const res = resFor(updateUserSettings);
      await updateUserSettings(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toMatch(/Invalid quality/);
    });

    it("rejects invalid playback mode", async () => {
      const req = reqFor(updateUserSettings, {
        body: { preferredPlaybackMode: "turbo" },
        user: USER,
      });
      const res = resFor(updateUserSettings);
      await updateUserSettings(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toMatch(/Invalid playback mode/);
    });

    it("rejects invalid preview quality", async () => {
      const req = reqFor(updateUserSettings, {
        body: { preferredPreviewQuality: "gif" },
        user: USER,
      });
      const res = resFor(updateUserSettings);
      await updateUserSettings(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toMatch(/Invalid preview quality/);
    });

    it("rejects minimumPlayPercent out of range", async () => {
      const req = reqFor(updateUserSettings, {
        body: { minimumPlayPercent: 150 },
        user: USER,
      });
      const res = resFor(updateUserSettings);
      await updateUserSettings(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("rejects non-number minimumPlayPercent", async () => {
      const req = reqFor(updateUserSettings, {
        body: malformed({ minimumPlayPercent: "half" }),
        user: USER,
      });
      const res = resFor(updateUserSettings);
      await updateUserSettings(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("rejects non-boolean syncToStash", async () => {
      const req = reqFor(updateUserSettings, {
        body: malformed({ syncToStash: "yes" }),
        user: USER,
      });
      const res = resFor(updateUserSettings);
      await updateUserSettings(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns 403 when a non-admin sends syncToStash", async () => {
      const req = reqFor(updateUserSettings, {
        body: { syncToStash: true },
        user: USER,
      });
      const res = resFor(updateUserSettings);
      await updateUserSettings(req, res);
      expect(res._getStatus()).toBe(403);
      expect(res._getErrorBody().error).toBe(
        "Only admins can change Sync to Stash"
      );
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it("lets an admin set syncToStash on their own settings", async () => {
      mockPrisma.user.update.mockResolvedValue({
        ...mockUpdatedUser,
        id: 1,
        syncToStash: true,
      });
      const req = reqFor(updateUserSettings, {
        body: { syncToStash: true },
        user: ADMIN,
      });
      const res = resFor(updateUserSettings);
      await updateUserSettings(req, res);
      expect(res._getOkBody().success).toBe(true);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: objectContaining({ syncToStash: true }),
        })
      );
    });

    it("rejects invalid unitPreference", async () => {
      const req = reqFor(updateUserSettings, {
        body: { unitPreference: "kelvin" },
        user: USER,
      });
      const res = resFor(updateUserSettings);
      await updateUserSettings(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("rejects invalid wallPlayback", async () => {
      const req = reqFor(updateUserSettings, {
        body: { wallPlayback: "loop" },
        user: USER,
      });
      const res = resFor(updateUserSettings);
      await updateUserSettings(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("rejects non-array carouselPreferences", async () => {
      const req = reqFor(updateUserSettings, {
        body: malformed({ carouselPreferences: "bad" }),
        user: USER,
      });
      const res = resFor(updateUserSettings);
      await updateUserSettings(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("rejects invalid carousel preference format", async () => {
      const req = reqFor(updateUserSettings, {
        body: malformed({
          carouselPreferences: [{ id: 123, enabled: "yes", order: "first" }],
        }),
        user: USER,
      });
      const res = resFor(updateUserSettings);
      await updateUserSettings(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("rejects non-array navPreferences", async () => {
      const req = reqFor(updateUserSettings, {
        body: malformed({ navPreferences: {} }),
        user: USER,
      });
      const res = resFor(updateUserSettings);
      await updateUserSettings(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("rejects invalid tableColumnDefaults entity type", async () => {
      const req = reqFor(updateUserSettings, {
        body: { tableColumnDefaults: { invalid: { visible: [], order: [] } } },
        user: USER,
      });
      const res = resFor(updateUserSettings);
      await updateUserSettings(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("accepts clip table columns", async () => {
      mockPrisma.user.update.mockResolvedValue(mockUpdatedUser);
      const tableColumnDefaults = {
        scene: { visible: ["title"], order: ["title", "date"] },
        clip: { visible: ["title", "scene"], order: ["scene", "title"] },
      };
      const req = reqFor(updateUserSettings, {
        body: { tableColumnDefaults },
        user: USER,
      });
      const res = resFor(updateUserSettings);
      await updateUserSettings(req, res);
      expect(res._getOkBody().success).toBe(true);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: objectContaining({ tableColumnDefaults }),
        })
      );
    });

    it("rejects tableColumnDefaults with missing arrays", async () => {
      const req = reqFor(updateUserSettings, {
        body: malformed({
          tableColumnDefaults: { scene: { visible: "not-array" } },
        }),
        user: USER,
      });
      const res = resFor(updateUserSettings);
      await updateUserSettings(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("accepts null tableColumnDefaults (clearing)", async () => {
      mockPrisma.user.update.mockResolvedValue(mockUpdatedUser);
      const req = reqFor(updateUserSettings, {
        body: { tableColumnDefaults: null },
        user: USER,
      });
      const res = resFor(updateUserSettings);
      await updateUserSettings(req, res);
      expect(res._getOkBody().success).toBe(true);
    });

    it.each([
      ["null", null],
      ["without arrays", {}],
    ])("rejects a table column config that is %s", async (_label, config) => {
      const req = reqFor(updateUserSettings, {
        body: malformed({ tableColumnDefaults: { scene: config } }),
        user: USER,
      });
      const res = resFor(updateUserSettings);
      await updateUserSettings(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toMatch(/Invalid table column config/);
    });

    it("rejects landingPagePreference with no pages", async () => {
      const req = reqFor(updateUserSettings, {
        body: { landingPagePreference: { pages: [], randomize: false } },
        user: USER,
      });
      const res = resFor(updateUserSettings);
      await updateUserSettings(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("rejects randomize mode with fewer than 2 pages", async () => {
      const req = reqFor(updateUserSettings, {
        body: { landingPagePreference: { pages: ["home"], randomize: true } },
        user: USER,
      });
      const res = resFor(updateUserSettings);
      await updateUserSettings(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toMatch(/at least 2 pages/);
    });

    it("rejects invalid landing page key", async () => {
      const req = reqFor(updateUserSettings, {
        body: {
          landingPagePreference: {
            pages: ["home", "invalid-page"],
            randomize: false,
          },
        },
        user: USER,
      });
      const res = resFor(updateUserSettings);
      await updateUserSettings(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toMatch(/Invalid landing page key/);
    });

    it("rejects invalid lightboxDoubleTapAction", async () => {
      const req = reqFor(updateUserSettings, {
        body: { lightboxDoubleTapAction: "zoom" },
        user: USER,
      });
      const res = resFor(updateUserSettings);
      await updateUserSettings(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("accepts valid lightboxDoubleTapAction values", async () => {
      mockPrisma.user.update.mockResolvedValue(mockUpdatedUser);
      for (const action of ["favorite", "o_counter", "fullscreen"]) {
        const req = reqFor(updateUserSettings, {
          body: { lightboxDoubleTapAction: action },
          user: USER,
        });
        const res = resFor(updateUserSettings);
        await updateUserSettings(req, res);
        expect(res._getOkBody().success).toBe(true);
      }
    });
  });

  // ─── changePassword ───

  describe("changePassword", () => {
    it("returns 401 when user has no id", async () => {
      const req = reqFor(changePassword, {
        body: { currentPassword: "old", newPassword: "New1pass" },
        user: malformed({}),
      });
      const res = resFor(changePassword);
      await authenticated(changePassword)(req, res, vi.fn());
      expect(res._getStatus()).toBe(401);
    });

    it("returns 400 when passwords missing", async () => {
      const req = reqFor(changePassword, { user: USER });
      const res = resFor(changePassword);
      await changePassword(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toMatch(/required/);
    });

    it("returns 400 when new password fails validation", async () => {
      mockValidatePassword.mockReturnValue({
        valid: false,
        errors: ["Too short"],
      });
      const req = reqFor(changePassword, {
        body: { currentPassword: "old", newPassword: "bad" },
        user: USER,
      });
      const res = resFor(changePassword);
      await changePassword(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toMatch(/Too short/);
    });

    it("returns 404 when user not found", async () => {
      mockValidatePassword.mockReturnValue({ valid: true, errors: [] });
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const req = reqFor(changePassword, {
        body: { currentPassword: "old", newPassword: "NewPass1" },
        user: USER,
      });
      const res = resFor(changePassword);
      await changePassword(req, res);
      expect(res._getStatus()).toBe(404);
    });

    it("changePassword answers 400 for a wrong current password", async () => {
      mockValidatePassword.mockReturnValue({ valid: true, errors: [] });
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          id: 2,
          password: "hashed",
        })
      );
      mockCompare.mockResolvedValue(false);
      const req = reqFor(changePassword, {
        body: { currentPassword: "wrong", newPassword: "NewPass1" },
        user: USER,
      });
      const res = resFor(changePassword);
      await changePassword(req, res);
      // 401 means the session is gone: the client would send the user to
      // the login page instead of showing this message
      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toBe("Current password is incorrect");
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
      expect(res.cookie).not.toHaveBeenCalled();
    });

    it("changes password successfully", async () => {
      mockValidatePassword.mockReturnValue({ valid: true, errors: [] });
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          id: 2,
          password: "hashed",
        })
      );
      mockCompare.mockResolvedValue(true);
      mockPrisma.user.update.mockResolvedValue(userRow());
      const req = reqFor(changePassword, {
        body: { currentPassword: "OldPass1", newPassword: "NewPass1" },
        user: USER,
      });
      const res = resFor(changePassword);
      await changePassword(req, res);
      expect(res._getOkBody().success).toBe(true);
      expect(mockBcrypt.hash).toHaveBeenCalledWith("NewPass1", 10);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 2 },
          data: {
            password: "hashed-password",
            passwordChangedAt: anyOf(Date),
          },
        })
      );
      // The current password was just proven, so this session gets a fresh
      // token and its 30 days restart.
      expect(res.cookie).toHaveBeenCalledWith(
        "token",
        expect.any(String),
        expect.anything()
      );
      const claims = jwt.decode(must(res.cookie.mock.calls[0])[1]) as {
        id: number;
        authTime: number;
      };
      expect(claims.id).toBe(2);
      expect(Math.abs(claims.authTime - Date.now() / 1000)).toBeLessThan(5);
    });
  });

  // ─── getRecoveryKey ───

  describe("getRecoveryKey", () => {
    it("returns 401 when user has no id", async () => {
      const req = reqFor(getRecoveryKey, { user: malformed({}) });
      const res = resFor(getRecoveryKey);
      await authenticated(getRecoveryKey)(req, res, vi.fn());
      expect(res._getStatus()).toBe(401);
    });

    it("returns 404 when user not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const req = reqFor(getRecoveryKey, { user: USER });
      const res = resFor(getRecoveryKey);
      await getRecoveryKey(req, res);
      expect(res._getStatus()).toBe(404);
    });

    it("reports that a key exists without returning it", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          recoveryKeyHash: "a".repeat(64),
        })
      );
      const req = reqFor(getRecoveryKey, { user: USER });
      const res = resFor(getRecoveryKey);
      await getRecoveryKey(req, res);
      expect(res._getBody()).toEqual({ hasRecoveryKey: true });
    });

    it("reports hasRecoveryKey false when no recovery key exists", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          recoveryKeyHash: null,
        })
      );
      const req = reqFor(getRecoveryKey, { user: USER });
      const res = resFor(getRecoveryKey);
      await getRecoveryKey(req, res);
      expect(res._getBody()).toEqual({ hasRecoveryKey: false });
    });
  });

  // ─── regenerateRecoveryKey ───

  describe("regenerateRecoveryKey", () => {
    it("returns 401 when user has no id", async () => {
      const req = reqFor(regenerateRecoveryKey, { user: malformed({}) });
      const res = resFor(regenerateRecoveryKey);
      await authenticated(regenerateRecoveryKey)(req, res, vi.fn());
      expect(res._getStatus()).toBe(401);
    });

    it("returns 400 without currentPassword", async () => {
      const req = reqFor(regenerateRecoveryKey, { user: USER });
      const res = resFor(regenerateRecoveryKey);
      await regenerateRecoveryKey(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toBe("Current password is required");
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it("returns 400 when currentPassword is wrong", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          id: 2,
          password: "hashed",
        })
      );
      mockCompare.mockResolvedValue(false);
      const req = reqFor(regenerateRecoveryKey, {
        body: { currentPassword: "wrong" },
        user: USER,
      });
      const res = resFor(regenerateRecoveryKey);
      await regenerateRecoveryKey(req, res);
      // 400, not 401, so the client's apiFetch does not bounce to login
      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toBe("Current password is incorrect");
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it("stores only the hash and returns the formatted key", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          id: 2,
          password: "hashed",
        })
      );
      mockCompare.mockResolvedValue(true);
      mockPrisma.user.update.mockResolvedValue(userRow());
      const req = reqFor(regenerateRecoveryKey, {
        body: { currentPassword: "OldPass1" },
        user: USER,
      });
      const res = resFor(regenerateRecoveryKey);
      await regenerateRecoveryKey(req, res);
      expect(mockCompare).toHaveBeenCalledWith("OldPass1", "hashed");
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 2 },
        data: { recoveryKeyHash: "hashed-key" },
      });
      expect(res._getBody()).toEqual({ recoveryKey: "ABCD-1234-EFGH-5678" });
    });
  });

  // ─── adminResetPassword ───

  describe("adminResetPassword", () => {
    it("returns 403 when non-admin", async () => {
      const req = reqFor(adminResetPassword, {
        body: { newPassword: "NewPass1" },
        params: { userId: "3" },
        user: USER,
      });
      const res = resFor(adminResetPassword);
      await runRoute(userRoutes, "post", "/:userId/reset-password", req, res);
      expect(res._getStatus()).toBe(403);
    });

    it("returns 400 for invalid user ID", async () => {
      const req = reqFor(adminResetPassword, {
        body: { newPassword: "NewPass1" },
        params: { userId: "abc" },
        user: ADMIN,
      });
      const res = resFor(adminResetPassword);
      await adminResetPassword(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toMatch(/Invalid user ID/);
    });

    it("returns 400 when password missing", async () => {
      const req = reqFor(adminResetPassword, {
        params: { userId: "3" },
        user: ADMIN,
      });
      const res = resFor(adminResetPassword);
      await adminResetPassword(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns 400 when password fails validation", async () => {
      mockValidatePassword.mockReturnValue({ valid: false, errors: ["Weak"] });
      const req = reqFor(adminResetPassword, {
        body: { newPassword: "bad" },
        params: { userId: "3" },
        user: ADMIN,
      });
      const res = resFor(adminResetPassword);
      await adminResetPassword(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns 404 when user not found", async () => {
      mockValidatePassword.mockReturnValue({ valid: true, errors: [] });
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const req = reqFor(adminResetPassword, {
        body: { newPassword: "NewPass1" },
        params: { userId: "3" },
        user: ADMIN,
      });
      const res = resFor(adminResetPassword);
      await adminResetPassword(req, res);
      expect(res._getStatus()).toBe(404);
    });

    it("resets password successfully", async () => {
      mockValidatePassword.mockReturnValue({ valid: true, errors: [] });
      mockPrisma.user.findUnique.mockResolvedValue(partialRow({ id: 3 }));
      mockPrisma.user.update.mockResolvedValue(userRow());
      const req = reqFor(adminResetPassword, {
        body: { newPassword: "NewPass1" },
        params: { userId: "3" },
        user: ADMIN,
      });
      const res = resFor(adminResetPassword);
      await adminResetPassword(req, res);
      expect(res._getOkBody().success).toBe(true);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 3 },
          data: {
            password: "hashed-password",
            passwordChangedAt: anyOf(Date),
          },
        })
      );
    });
  });

  // ─── adminRegenerateRecoveryKey ───

  describe("adminRegenerateRecoveryKey", () => {
    it("returns 403 when non-admin", async () => {
      const req = reqFor(adminRegenerateRecoveryKey, {
        params: { userId: "3" },
        user: USER,
      });
      const res = resFor(adminRegenerateRecoveryKey);
      await runRoute(
        userRoutes,
        "post",
        "/:userId/regenerate-recovery-key",
        req,
        res
      );
      expect(res._getStatus()).toBe(403);
    });

    it("returns 404 when user not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const req = reqFor(adminRegenerateRecoveryKey, {
        params: { userId: "3" },
        user: ADMIN,
      });
      const res = resFor(adminRegenerateRecoveryKey);
      await adminRegenerateRecoveryKey(req, res);
      expect(res._getStatus()).toBe(404);
    });

    it("regenerates key successfully", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(partialRow({ id: 3 }));
      mockPrisma.user.update.mockResolvedValue(userRow());
      const req = reqFor(adminRegenerateRecoveryKey, {
        params: { userId: "3" },
        user: ADMIN,
      });
      const res = resFor(adminRegenerateRecoveryKey);
      await adminRegenerateRecoveryKey(req, res);
      expect(res._getOkBody().recoveryKey).toBe("ABCD-1234-EFGH-5678");
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: { recoveryKeyHash: "hashed-key" },
      });
    });
  });

  // ─── getAllUsers ───

  describe("getAllUsers", () => {
    it("returns 403 when non-admin", async () => {
      const req = reqFor(getAllUsers, { user: USER });
      const res = resFor(getAllUsers);
      await runRoute(userRoutes, "get", "/all", req, res);
      expect(res._getStatus()).toBe(403);
    });

    it("returns users with group memberships mapped", async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        partialRow<UserWithGroups>({
          id: 1,
          username: "admin",
          role: "ADMIN",
          createdAt: new Date(),
          updatedAt: new Date(),
          syncToStash: false,
          groupMemberships: [
            partialRow({ group: partialRow({ id: 1, name: "Group A" }) }),
          ],
        }),
      ]);
      const req = reqFor(getAllUsers, { user: ADMIN });
      const res = resFor(getAllUsers);
      await getAllUsers(req, res);
      const body = res._getOkBody();
      expect(body.users).toHaveLength(1);
      const user = must(body.users[0]);
      expect(user.groups).toEqual([{ id: 1, name: "Group A" }]);
      // The raw relation is dropped from what the client receives
      const sent: Record<string, unknown> = user;
      expect(sent.groupMemberships).toBeUndefined();
    });
  });

  // ─── createUser ───

  describe("createUser", () => {
    it("returns 403 when non-admin", async () => {
      const req = reqFor(createUser, {
        body: { username: "new", password: "Pass123" },
        user: USER,
      });
      const res = resFor(createUser);
      await runRoute(userRoutes, "post", "/create", req, res);
      expect(res._getStatus()).toBe(403);
    });

    it("returns 400 when username or password missing", async () => {
      const req = reqFor(createUser, {
        body: malformed({ username: "new" }),
        user: ADMIN,
      });
      const res = resFor(createUser);
      await createUser(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("creating a user with a 256-character name answers 400", async () => {
      const req = reqFor(createUser, {
        body: { username: "a".repeat(256), password: "Pass123" },
        user: ADMIN,
      });
      const res = resFor(createUser);
      await createUser(req, res);
      expect(res._getStatus()).toBe(400);
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it("returns 400 when password too short", async () => {
      const req = reqFor(createUser, {
        body: { username: "new", password: "12345" },
        user: ADMIN,
      });
      const res = resFor(createUser);
      await createUser(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toMatch(/6 characters/);
    });

    it("returns 400 for invalid role", async () => {
      const req = reqFor(createUser, {
        body: { username: "new", password: "Pass123", role: "SUPERADMIN" },
        user: ADMIN,
      });
      const res = resFor(createUser);
      await createUser(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toMatch(/ADMIN or USER/);
    });

    it("returns 409 when username already exists", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(partialRow({ id: 5 }));
      const req = reqFor(createUser, {
        body: { username: "existing", password: "Pass123" },
        user: ADMIN,
      });
      const res = resFor(createUser);
      await createUser(req, res);
      expect(res._getStatus()).toBe(409);
    });

    it("creates user with default USER role", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(
        partialRow({
          id: 5,
          username: "new",
          role: "USER",
          createdAt: new Date(),
        })
      );
      const req = reqFor(createUser, {
        body: { username: "new", password: "Pass123" },
        user: ADMIN,
      });
      const res = resFor(createUser);
      await createUser(req, res);
      expect(res._getStatus()).toBe(201);
      expect(res._getOkBody().success).toBe(true);
      expect(res._getOkBody().user.username).toBe("new");
      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: objectContaining({ role: "USER" }),
        })
      );
    });

    it("creates a USER when role is an empty string", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(
        partialRow({
          id: 5,
          username: "new",
          role: "USER",
          createdAt: new Date(),
        })
      );
      const req = reqFor(createUser, {
        body: { username: "new", password: "Pass123", role: "" },
        user: ADMIN,
      });
      const res = resFor(createUser);
      await createUser(req, res);
      expect(res._getStatus()).toBe(201);
      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: objectContaining({ role: "USER" }),
        })
      );
    });

    it("creates user with explicit ADMIN role", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(
        partialRow({
          id: 5,
          username: "admin2",
          role: "ADMIN",
          createdAt: new Date(),
        })
      );
      const req = reqFor(createUser, {
        body: { username: "admin2", password: "Pass123", role: "ADMIN" },
        user: ADMIN,
      });
      const res = resFor(createUser);
      await createUser(req, res);
      expect(res._getStatus()).toBe(201);
    });
  });

  // ─── deleteUser ───

  describe("deleteUser", () => {
    it("returns 403 when non-admin", async () => {
      const req = reqFor(deleteUser, { params: { userId: "3" }, user: USER });
      const res = resFor(deleteUser);
      await runRoute(userRoutes, "delete", "/:userId", req, res);
      expect(res._getStatus()).toBe(403);
    });

    it("returns 400 for invalid user ID", async () => {
      const req = reqFor(deleteUser, {
        params: { userId: "abc" },
        user: ADMIN,
      });
      const res = resFor(deleteUser);
      await deleteUser(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns 400 when trying to delete self", async () => {
      const req = reqFor(deleteUser, { params: { userId: "1" }, user: ADMIN });
      const res = resFor(deleteUser);
      await deleteUser(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toMatch(/own account/);
    });

    it("returns 404 when user not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const req = reqFor(deleteUser, { params: { userId: "99" }, user: ADMIN });
      const res = resFor(deleteUser);
      await deleteUser(req, res);
      expect(res._getStatus()).toBe(404);
    });

    it("deletes user successfully", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(partialRow({ id: 3 }));
      mockPrisma.user.delete.mockResolvedValue(partialRow({}));
      const req = reqFor(deleteUser, { params: { userId: "3" }, user: ADMIN });
      const res = resFor(deleteUser);
      await deleteUser(req, res);
      expect(res._getOkBody().success).toBe(true);
      expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: 3 } });
    });

    it("deletes only the user, in one unit: every per-user table cascades from it", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(partialRow({ id: 3 }));
      mockPrisma.user.delete.mockResolvedValue(partialRow({}));
      const req = reqFor(deleteUser, { params: { userId: "3" }, user: ADMIN });
      const res = resFor(deleteUser);
      await deleteUser(req, res);

      // The stats and ranking tables cascade from User like the rest
      expect(mockPrisma.userPerformerStats.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.userStudioStats.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.userTagStats.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.userEntityRanking.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      const [ops] = must(mockPrisma.$transaction.mock.calls[0]);
      expect(Array.isArray(ops) ? ops.length : 0).toBe(1);
    });

    it("drops the deleted user from the ranking and Recommended caches, after the delete", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(partialRow({ id: 3 }));
      mockPrisma.user.delete.mockResolvedValue(partialRow({}));
      const req = reqFor(deleteUser, { params: { userId: "3" }, user: ADMIN });
      const res = resFor(deleteUser);
      await deleteUser(req, res);

      expect(mockRankings.forget).toHaveBeenCalledExactlyOnceWith(3);
      expect(mockRecommendations.forget).toHaveBeenCalledExactlyOnceWith(3);
      const deletedAt = must(
        mockPrisma.$transaction.mock.invocationCallOrder[0]
      );
      expect(
        must(mockRankings.forget.mock.invocationCallOrder[0])
      ).toBeGreaterThan(deletedAt);
      expect(
        must(mockRecommendations.forget.mock.invocationCallOrder[0])
      ).toBeGreaterThan(deletedAt);
    });

    it("a failed delete answers 500 and forgets nothing", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(partialRow({ id: 3 }));
      mockPrisma.user.delete.mockRejectedValue(new Error("disk I/O error"));
      const req = reqFor(deleteUser, { params: { userId: "3" }, user: ADMIN });
      const res = resFor(deleteUser);
      await expect(deleteUser(req, res)).rejects.toThrow("disk I/O error");

      expect(res.json).not.toHaveBeenCalled();
      expect(mockRankings.forget).not.toHaveBeenCalled();
      expect(mockRecommendations.forget).not.toHaveBeenCalled();
    });
  });

  // ─── updateUserRole ───

  describe("updateUserRole", () => {
    it("returns 403 when non-admin", async () => {
      const req = reqFor(updateUserRole, {
        body: { role: "ADMIN" },
        params: { userId: "3" },
        user: USER,
      });
      const res = resFor(updateUserRole);
      await runRoute(userRoutes, "put", "/:userId/role", req, res);
      expect(res._getStatus()).toBe(403);
    });

    it("returns 400 for invalid user ID", async () => {
      const req = reqFor(updateUserRole, {
        body: { role: "USER" },
        params: { userId: "abc" },
        user: ADMIN,
      });
      const res = resFor(updateUserRole);
      await updateUserRole(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns 400 for invalid role", async () => {
      const req = reqFor(updateUserRole, {
        body: { role: "SUPERADMIN" },
        params: { userId: "3" },
        user: ADMIN,
      });
      const res = resFor(updateUserRole);
      await updateUserRole(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns 400 when changing own role", async () => {
      const req = reqFor(updateUserRole, {
        body: { role: "USER" },
        params: { userId: "1" },
        user: ADMIN,
      });
      const res = resFor(updateUserRole);
      await updateUserRole(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toMatch(/own role/);
    });

    it("updates role successfully", async () => {
      mockPrisma.user.update.mockResolvedValue(
        partialRow({
          id: 3,
          username: "user3",
          role: "ADMIN",
          updatedAt: new Date(),
        })
      );
      const req = reqFor(updateUserRole, {
        body: { role: "ADMIN" },
        params: { userId: "3" },
        user: ADMIN,
      });
      const res = resFor(updateUserRole);
      await updateUserRole(req, res);
      expect(res._getOkBody().success).toBe(true);
      expect(res._getOkBody().user.role).toBe("ADMIN");
    });

    it("recomputes exclusions after a role change", async () => {
      // Promotion drops restricted/empty rows; demotion applies the kept rows again
      const order: string[] = [];
      mockPrisma.user.update.mockImplementation(
        prismaImpl(() => {
          order.push("update");
          return partialRow({
            id: 3,
            username: "user3",
            role: "USER",
            updatedAt: new Date(),
          });
        })
      );
      mockExclusions.recomputeForUser.mockImplementation(() => {
        order.push("recompute");
        return Promise.resolve();
      });
      const req = reqFor(updateUserRole, {
        body: { role: "USER" },
        params: { userId: "3" },
        user: ADMIN,
      });
      const res = resFor(updateUserRole);
      await updateUserRole(req, res);
      expect(mockExclusions.recomputeForUser).toHaveBeenCalledWith(3);
      expect(order).toEqual(["update", "recompute"]);
      expect(res._getOkBody().success).toBe(true);
    });
  });

  // ─── updateUserRestrictions ───

  describe("updateUserStashInstances", () => {
    beforeEach(() => {
      mockPrisma.stashInstance.findMany.mockResolvedValue([
        partialRow({ id: "A" }),
        partialRow({ id: "B" }),
      ]);
      mockPrisma.userStashInstance.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.userStashInstance.createMany.mockResolvedValue({ count: 2 });
      mockExclusions.recomputeForUser.mockResolvedValue(undefined);
    });

    it("recomputes the user's exclusions in the same request, after the selection is stored", async () => {
      const req = reqFor(updateUserStashInstances, {
        user: USER,
        body: { instanceIds: ["A", "B"] },
      });
      const res = resFor(updateUserStashInstances);
      await updateUserStashInstances(req, res);

      expect(res._getOkBody()).toEqual({
        success: true,
        selectedInstanceIds: ["A", "B"],
      });
      expect(mockExclusions.recomputeForUser).toHaveBeenCalledExactlyOnceWith(
        USER.id
      );
      // The rows were written before the recompute read them
      const [written] =
        mockPrisma.userStashInstance.createMany.mock.invocationCallOrder;
      const [recomputed] =
        mockExclusions.recomputeForUser.mock.invocationCallOrder;
      expect(must(written)).toBeLessThan(must(recomputed));
    });

    it("the selection is replaced in one dbWriteTransaction, then the user is recomputed", async () => {
      const req = reqFor(updateUserStashInstances, {
        user: USER,
        body: { instanceIds: ["A", "B", "A"] },
      });
      const res = resFor(updateUserStashInstances);
      await updateUserStashInstances(req, res);

      // One transaction holds both statements, each id once
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(
        mockPrisma.userStashInstance.createMany
      ).toHaveBeenCalledExactlyOnceWith({
        data: [
          { userId: USER.id, instanceId: "A" },
          { userId: USER.id, instanceId: "B" },
        ],
      });
      const [transaction] = mockPrisma.$transaction.mock.invocationCallOrder;
      const [deleted] =
        mockPrisma.userStashInstance.deleteMany.mock.invocationCallOrder;
      const [created] =
        mockPrisma.userStashInstance.createMany.mock.invocationCallOrder;
      const [recomputed] =
        mockExclusions.recomputeForUser.mock.invocationCallOrder;
      expect(must(transaction)).toBeLessThan(must(deleted));
      expect(must(deleted)).toBeLessThan(must(created));
      expect(must(created)).toBeLessThan(must(recomputed));
      expect(res._getOkBody().selectedInstanceIds).toEqual(["A", "B"]);
    });

    it("a non-string id throws a ValidationError naming instanceIds and writes nothing", async () => {
      const req = reqFor(updateUserStashInstances, {
        user: USER,
        body: { instanceIds: ["A", 7] } as never,
      });
      const res = resFor(updateUserStashInstances);
      await expect(updateUserStashInstances(req, res)).rejects.toMatchObject({
        statusCode: 400,
        issues: [expect.objectContaining({ path: "instanceIds.1" })],
      });
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockExclusions.recomputeForUser).not.toHaveBeenCalled();
    });

    it("an empty selection (every enabled instance) recomputes too", async () => {
      const req = reqFor(updateUserStashInstances, {
        user: USER,
        body: { instanceIds: [] },
      });
      const res = resFor(updateUserStashInstances);
      await updateUserStashInstances(req, res);

      expect(res._getOkBody().success).toBe(true);
      expect(mockPrisma.userStashInstance.createMany).not.toHaveBeenCalled();
      expect(mockExclusions.recomputeForUser).toHaveBeenCalledExactlyOnceWith(
        USER.id
      );
    });

    it("an invalid instance id answers 400 and recomputes nothing", async () => {
      const req = reqFor(updateUserStashInstances, {
        user: USER,
        body: { instanceIds: ["A", "nope"] },
      });
      const res = resFor(updateUserStashInstances);
      await updateUserStashInstances(req, res);

      expect(res._getStatus()).toBe(400);
      expect(mockExclusions.recomputeForUser).not.toHaveBeenCalled();
    });
  });

  describe("updateUserRestrictions", () => {
    const TARGET = userRow({ id: 3, username: "user3" });
    const tagRule = (
      mode: string,
      ids: string[] = ["1:A"]
    ): UserRestriction => ({
      entityType: "tags",
      mode,
      entityIds: ids,
    });

    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue(TARGET);
      mockPrisma.stashInstance.findMany.mockResolvedValue([
        partialRow({ id: "A" }),
      ]);
      mockPrisma.userContentRestriction.findMany.mockResolvedValue([]);
      mockExclusions.saveRestrictions.mockResolvedValue(undefined);
    });

    it("returns 403 when non-admin", async () => {
      const req = reqFor(updateUserRestrictions, {
        body: { restrictions: [tagRule("EXCLUDE")] },
        params: { userId: "3" },
        user: USER,
      });
      const res = resFor(updateUserRestrictions);
      await runRoute(userRoutes, "put", "/:userId/restrictions", req, res);
      expect(res._getStatus()).toBe(403);
    });

    it("400 when the target is an admin", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...TARGET,
        role: "ADMIN",
      });
      const req = reqFor(updateUserRestrictions, {
        body: { restrictions: [tagRule("EXCLUDE")] },
        params: { userId: "3" },
        user: ADMIN,
      });
      const res = resFor(updateUserRestrictions);
      await updateUserRestrictions(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toMatch(/administrators/);
      expect(mockExclusions.saveRestrictions).not.toHaveBeenCalled();
    });

    it("404 when the target does not exist", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const req = reqFor(updateUserRestrictions, {
        body: { restrictions: [tagRule("EXCLUDE")] },
        params: { userId: "3" },
        user: ADMIN,
      });
      const res = resFor(updateUserRestrictions);
      await updateUserRestrictions(req, res);
      expect(res._getStatus()).toBe(404);
      expect(mockExclusions.saveRestrictions).not.toHaveBeenCalled();
    });

    it("400 on a duplicate (entityType, mode) pair", async () => {
      const req = reqFor(updateUserRestrictions, {
        body: {
          restrictions: [tagRule("EXCLUDE"), tagRule("EXCLUDE", ["2:A"])],
        },
        params: { userId: "3" },
        user: ADMIN,
      });
      const res = resFor(updateUserRestrictions);
      await updateUserRestrictions(req, res);
      expect(res._getStatus()).toBe(400);
      expect(mockExclusions.saveRestrictions).not.toHaveBeenCalled();
    });

    it("400 on an empty entityIds list", async () => {
      const req = reqFor(updateUserRestrictions, {
        body: { restrictions: [tagRule("INCLUDE", [])] },
        params: { userId: "3" },
        user: ADMIN,
      });
      const res = resFor(updateUserRestrictions);
      await updateUserRestrictions(req, res);
      expect(res._getStatus()).toBe(400);
      expect(mockExclusions.saveRestrictions).not.toHaveBeenCalled();
    });

    it("400 on a malformed id", async () => {
      for (const bad of [["abc"], ["1:"], [5], ["1:A", "x:y:"]]) {
        vi.clearAllMocks();
        mockPrisma.user.findUnique.mockResolvedValue(TARGET);
        const req = reqFor(updateUserRestrictions, {
          body: malformed({
            restrictions: [{ ...tagRule("EXCLUDE"), entityIds: bad }],
          }),
          params: { userId: "3" },
          user: ADMIN,
        });
        const res = resFor(updateUserRestrictions);
        await updateUserRestrictions(req, res);
        expect(res._getStatus()).toBe(400);
        expect(mockExclusions.saveRestrictions).not.toHaveBeenCalled();
      }
    });

    it("400 on a non-boolean restrictEmpty", async () => {
      const req = reqFor(updateUserRestrictions, {
        body: malformed({
          restrictions: [{ ...tagRule("EXCLUDE"), restrictEmpty: "yes" }],
        }),
        params: { userId: "3" },
        user: ADMIN,
      });
      const res = resFor(updateUserRestrictions);
      await updateUserRestrictions(req, res);
      expect(res._getStatus()).toBe(400);
      expect(mockExclusions.saveRestrictions).not.toHaveBeenCalled();
    });

    it("400 naming the entry whose instance does not exist, and saves nothing", async () => {
      mockPrisma.stashInstance.findMany.mockResolvedValue([
        partialRow({ id: "A" }),
      ]);
      const req = reqFor(updateUserRestrictions, {
        body: {
          restrictions: [
            tagRule("EXCLUDE", ["1:A", "2:Z"]),
            { entityType: "studios", mode: "EXCLUDE", entityIds: ["7"] },
          ],
        },
        params: { userId: "3" },
        user: ADMIN,
      });
      const res = resFor(updateUserRestrictions);
      await updateUserRestrictions(req, res);

      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toContain("2:Z");
      // One lookup of the distinct instances named, enabled or not
      expect(mockPrisma.stashInstance.findMany).toHaveBeenCalledExactlyOnceWith(
        { where: { id: { in: ["A", "Z"] } }, select: { id: true } }
      );
      expect(mockExclusions.saveRestrictions).not.toHaveBeenCalled();
    });

    it("bare ids a stored list of the type already holds need no instance lookup", async () => {
      // A list saved before entries named their instance, saved again
      mockPrisma.userContentRestriction.findMany.mockResolvedValue([
        partialRow({
          entityType: "tags",
          entityIds: JSON.stringify(["1", "2"]),
        }),
      ]);
      const req = reqFor(updateUserRestrictions, {
        body: { restrictions: [tagRule("EXCLUDE", ["1", "2"])] },
        params: { userId: "3" },
        user: ADMIN,
      });
      const res = resFor(updateUserRestrictions);
      await updateUserRestrictions(req, res);

      expect(res._getStatus()).toBe(200);
      expect(mockPrisma.stashInstance.findMany).not.toHaveBeenCalled();
      expect(mockExclusions.saveRestrictions).toHaveBeenCalledExactlyOnceWith(
        3,
        [
          {
            entityType: "tags",
            mode: "EXCLUDE",
            entityIds: ["1", "2"],
            restrictEmpty: false,
          },
        ]
      );
    });

    it("defaults restrictEmpty to true for INCLUDE and false for EXCLUDE when omitted", async () => {
      const req = reqFor(updateUserRestrictions, {
        body: {
          restrictions: [
            tagRule("INCLUDE"),
            { entityType: "studios", mode: "EXCLUDE", entityIds: ["7:A"] },
          ],
        },
        params: { userId: "3" },
        user: ADMIN,
      });
      const res = resFor(updateUserRestrictions);
      await updateUserRestrictions(req, res);
      expect(res._getStatus()).toBe(200);
      expect(mockExclusions.saveRestrictions).toHaveBeenCalledExactlyOnceWith(
        3,
        [
          {
            entityType: "tags",
            mode: "INCLUDE",
            entityIds: ["1:A"],
            restrictEmpty: true,
          },
          {
            entityType: "studios",
            mode: "EXCLUDE",
            entityIds: ["7:A"],
            restrictEmpty: false,
          },
        ]
      );
    });

    it("keeps an explicit restrictEmpty value", async () => {
      const req = reqFor(updateUserRestrictions, {
        body: {
          restrictions: [{ ...tagRule("INCLUDE"), restrictEmpty: false }],
        },
        params: { userId: "3" },
        user: ADMIN,
      });
      const res = resFor(updateUserRestrictions);
      await updateUserRestrictions(req, res);
      const [, rows] = must(mockExclusions.saveRestrictions.mock.calls[0]);
      expect(must(rows[0]).restrictEmpty).toBe(false);
    });

    it("saves an INCLUDE and an EXCLUDE row for the same type in one unit, then answers the stored rows", async () => {
      const saved: UserContentRestriction[] = [
        partialRow({ id: 10, userId: 3, entityType: "tags", mode: "INCLUDE" }),
        partialRow({ id: 11, userId: 3, entityType: "tags", mode: "EXCLUDE" }),
      ];
      mockPrisma.userContentRestriction.findMany.mockResolvedValue(saved);
      const req = reqFor(updateUserRestrictions, {
        body: {
          restrictions: [
            { ...tagRule("INCLUDE"), restrictEmpty: true },
            { ...tagRule("EXCLUDE", ["2:A"]), restrictEmpty: true },
          ],
        },
        params: { userId: "3" },
        user: ADMIN,
      });
      const res = resFor(updateUserRestrictions);
      await updateUserRestrictions(req, res);

      expect(res._getStatus()).toBe(200);
      expect(mockExclusions.saveRestrictions).toHaveBeenCalledTimes(1);
      const [userId, rows] = must(
        mockExclusions.saveRestrictions.mock.calls[0]
      );
      expect(userId).toBe(3);
      expect(rows.map((r) => r.mode)).toEqual(["INCLUDE", "EXCLUDE"]);
      // The controller writes nothing itself: the save's swap stores the rows
      expect(
        mockPrisma.userContentRestriction.deleteMany
      ).not.toHaveBeenCalled();
      expect(
        mockPrisma.userContentRestriction.createMany
      ).not.toHaveBeenCalled();
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockExclusions.recomputeForUser).not.toHaveBeenCalled();
      // The stored rows are read back after the unit resolved
      expect(mockPrisma.userContentRestriction.findMany).toHaveBeenCalledWith({
        where: { userId: 3 },
      });
      const [savedAt] =
        mockExclusions.saveRestrictions.mock.invocationCallOrder;
      const [readAt] =
        mockPrisma.userContentRestriction.findMany.mock.invocationCallOrder;
      expect(must(savedAt)).toBeLessThan(must(readAt));
      expect(res._getOkBody().success).toBe(true);
      expect(res._getOkBody().restrictions).toEqual(saved);
    });

    it("a failed save throws (500) and reads nothing back", async () => {
      mockExclusions.saveRestrictions.mockRejectedValue(
        new Error("disk I/O error")
      );
      const req = reqFor(updateUserRestrictions, {
        body: { restrictions: [tagRule("EXCLUDE")] },
        params: { userId: "3" },
        user: ADMIN,
      });
      const res = resFor(updateUserRestrictions);
      await expect(updateUserRestrictions(req, res)).rejects.toThrow(
        "disk I/O error"
      );

      expect(res.json).not.toHaveBeenCalled();
      expect(mockPrisma.userContentRestriction.findMany).not.toHaveBeenCalled();
    });
  });

  describe("deleteUserRestrictions", () => {
    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue(
        userRow({ id: 3, username: "user3" })
      );
      mockExclusions.saveRestrictions.mockResolvedValue(undefined);
    });

    it("returns 403 when non-admin", async () => {
      const req = reqFor(deleteUserRestrictions, {
        params: { userId: "3" },
        user: USER,
      });
      const res = resFor(deleteUserRestrictions);
      await runRoute(userRoutes, "delete", "/:userId/restrictions", req, res);
      expect(res._getStatus()).toBe(403);
    });

    it("400 on a non-numeric id", async () => {
      const req = reqFor(deleteUserRestrictions, {
        params: { userId: "abc" },
        user: ADMIN,
      });
      const res = resFor(deleteUserRestrictions);
      await deleteUserRestrictions(req, res);
      expect(res._getStatus()).toBe(400);
      expect(mockExclusions.saveRestrictions).not.toHaveBeenCalled();
    });

    it("404 when the user does not exist", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const req = reqFor(deleteUserRestrictions, {
        params: { userId: "3" },
        user: ADMIN,
      });
      const res = resFor(deleteUserRestrictions);
      await deleteUserRestrictions(req, res);
      expect(res._getStatus()).toBe(404);
      expect(mockExclusions.saveRestrictions).not.toHaveBeenCalled();
    });

    it("saves an empty list in one unit, for an admin target too", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        userRow({ id: 3, username: "user3", role: "ADMIN" })
      );
      const req = reqFor(deleteUserRestrictions, {
        params: { userId: "3" },
        user: ADMIN,
      });
      const res = resFor(deleteUserRestrictions);
      await deleteUserRestrictions(req, res);

      expect(res._getOkBody().success).toBe(true);
      expect(mockExclusions.saveRestrictions).toHaveBeenCalledExactlyOnceWith(
        3,
        []
      );
      expect(
        mockPrisma.userContentRestriction.deleteMany
      ).not.toHaveBeenCalled();
      expect(mockExclusions.recomputeForUser).not.toHaveBeenCalled();
    });
  });

  describe("getUserRestrictions", () => {
    it("400 on a non-numeric id", async () => {
      const req = reqFor(getUserRestrictions, {
        params: { userId: "abc" },
        user: ADMIN,
      });
      const res = resFor(getUserRestrictions);
      await getUserRestrictions(req, res);
      expect(res._getStatus()).toBe(400);
      expect(mockPrisma.userContentRestriction.findMany).not.toHaveBeenCalled();
    });

    it("answers the user's rows with the stored lists parsed", async () => {
      mockPrisma.userContentRestriction.findMany.mockResolvedValue([
        partialRow({
          id: 10,
          entityType: "tags",
          mode: "INCLUDE",
          entityIds: '["5:a","6:a"]',
          restrictEmpty: false,
        }),
      ]);
      const req = reqFor(getUserRestrictions, {
        params: { userId: "3" },
        user: ADMIN,
      });
      const res = resFor(getUserRestrictions);
      await getUserRestrictions(req, res);
      expect(mockPrisma.userContentRestriction.findMany).toHaveBeenCalledWith({
        where: { userId: 3 },
        select: {
          id: true,
          entityType: true,
          mode: true,
          entityIds: true,
          restrictEmpty: true,
        },
      });
      expect(res._getOkBody().restrictions).toEqual([
        {
          id: 10,
          entityType: "tags",
          mode: "INCLUDE",
          entityIds: ["5:a", "6:a"],
          restrictEmpty: false,
          unreadable: false,
        },
      ]);
    });
  });
});
