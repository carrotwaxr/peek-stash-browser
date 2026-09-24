/**
 * Unit Tests for User Controller — Settings, Password, and Admin Operations
 *
 * Tests getUserSettings, updateUserSettings, changePassword, getRecoveryKey,
 * regenerateRecoveryKey, adminResetPassword, adminRegenerateRecoveryKey,
 * getAllUsers, createUser, deleteUser, updateUserRole.
 */
import type { Prisma, User, UserContentRestriction } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminRegenerateRecoveryKey,
  adminResetPassword,
  changePassword,
  createUser,
  deleteUser,
  getAllUsers,
  getRecoveryKey,
  getUserSettings,
  regenerateRecoveryKey,
  updateUserRestrictions,
  updateUserRole,
  updateUserSettings,
} from "../../controllers/user.js";
import prisma from "../../prisma/singleton.js";
import { exclusionComputationService } from "../../services/ExclusionComputationService.js";
import type { UserRestriction } from "../../types/api/index.js";
import { validatePassword } from "../../utils/passwordValidation.js";
import { formatRecoveryKey } from "../../utils/recoveryKey.js";
import { malformed, reqFor, resFor } from "../helpers/controllerTestUtils.js";
import { type UserWithGroups, userRow } from "../helpers/fixtures.js";
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

// Mock bcryptjs
vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("hashed-password"),
    compare: vi.fn().mockResolvedValue(true),
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
  },
}));

const mockPrisma = vi.mocked(prisma, true);
const mockExclusions = vi.mocked(exclusionComputationService);
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
      await getUserSettings(req, res);
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

    it("returns 500 on database error", async () => {
      mockPrisma.user.findUnique.mockRejectedValue(new Error("DB error"));
      const req = reqFor(getUserSettings, { user: USER });
      const res = resFor(getUserSettings);
      await getUserSettings(req, res);
      expect(res._getStatus()).toBe(500);
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
      await updateUserSettings(req, res);
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
          data: expect.objectContaining({ syncToStash: true }),
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
      await changePassword(req, res);
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

    it("returns 401 when current password is incorrect", async () => {
      mockValidatePassword.mockReturnValue({ valid: true, errors: [] });
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          id: 2,
          password: "hashed",
        })
      );
      mockBcrypt.compare.mockImplementation(async () => false);
      const req = reqFor(changePassword, {
        body: { currentPassword: "wrong", newPassword: "NewPass1" },
        user: USER,
      });
      const res = resFor(changePassword);
      await changePassword(req, res);
      expect(res._getStatus()).toBe(401);
      expect(res._getErrorBody().error).toMatch(/incorrect/);
    });

    it("changes password successfully", async () => {
      mockValidatePassword.mockReturnValue({ valid: true, errors: [] });
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          id: 2,
          password: "hashed",
        })
      );
      mockBcrypt.compare.mockImplementation(async () => true);
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
            passwordChangedAt: expect.any(Date),
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
      await getRecoveryKey(req, res);
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
      await regenerateRecoveryKey(req, res);
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
      mockBcrypt.compare.mockImplementation(async () => false);
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
      mockBcrypt.compare.mockImplementation(async () => true);
      mockPrisma.user.update.mockResolvedValue(userRow());
      const req = reqFor(regenerateRecoveryKey, {
        body: { currentPassword: "OldPass1" },
        user: USER,
      });
      const res = resFor(regenerateRecoveryKey);
      await regenerateRecoveryKey(req, res);
      expect(mockBcrypt.compare).toHaveBeenCalledWith("OldPass1", "hashed");
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
      await adminResetPassword(req, res);
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
            passwordChangedAt: expect.any(Date),
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
      await adminRegenerateRecoveryKey(req, res);
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
      await getAllUsers(req, res);
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
      await createUser(req, res);
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
          data: expect.objectContaining({ role: "USER" }),
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
      await deleteUser(req, res);
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
      await updateUserRole(req, res);
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
      mockExclusions.recomputeForUser.mockImplementation(async () => {
        order.push("recompute");
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
      mockPrisma.userContentRestriction.deleteMany.mockResolvedValue({
        count: 0,
      });
      mockPrisma.userContentRestriction.createMany.mockResolvedValue({
        count: 1,
      });
      mockPrisma.userContentRestriction.findMany.mockResolvedValue([]);
      // Back to the mock's own $transaction (an array runs with Promise.all)
      mockPrisma.$transaction.mockReset();
      mockExclusions.recomputeForUser.mockResolvedValue(undefined);
    });

    it("returns 403 when non-admin", async () => {
      const req = reqFor(updateUserRestrictions, {
        body: { restrictions: [tagRule("EXCLUDE")] },
        params: { userId: "3" },
        user: USER,
      });
      const res = resFor(updateUserRestrictions);
      await updateUserRestrictions(req, res);
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
      expect(
        mockPrisma.userContentRestriction.deleteMany
      ).not.toHaveBeenCalled();
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
      expect(
        mockPrisma.userContentRestriction.deleteMany
      ).not.toHaveBeenCalled();
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
      expect(
        mockPrisma.userContentRestriction.deleteMany
      ).not.toHaveBeenCalled();
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
      expect(
        mockPrisma.userContentRestriction.deleteMany
      ).not.toHaveBeenCalled();
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
        expect(
          mockPrisma.userContentRestriction.deleteMany
        ).not.toHaveBeenCalled();
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
      const data = mockPrisma.userContentRestriction.createMany.mock
        .calls[0]?.[0]?.data as Array<Record<string, unknown>>;
      expect(data).toEqual([
        {
          userId: 3,
          entityType: "tags",
          mode: "INCLUDE",
          entityIds: JSON.stringify(["1:A"]),
          restrictEmpty: true,
        },
        {
          userId: 3,
          entityType: "studios",
          mode: "EXCLUDE",
          entityIds: JSON.stringify(["7:A"]),
          restrictEmpty: false,
        },
      ]);
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
      const data = mockPrisma.userContentRestriction.createMany.mock
        .calls[0]?.[0]?.data as Array<Record<string, unknown>>;
      expect(must(data[0]).restrictEmpty).toBe(false);
    });

    it("stores an INCLUDE and an EXCLUDE row for the same type and recomputes", async () => {
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
      expect(mockPrisma.userContentRestriction.deleteMany).toHaveBeenCalledWith(
        {
          where: { userId: 3 },
        }
      );
      expect(
        mockPrisma.userContentRestriction.createMany
      ).toHaveBeenCalledTimes(1);
      const data = mockPrisma.userContentRestriction.createMany.mock
        .calls[0]?.[0]?.data as Array<Record<string, unknown>>;
      expect(data.map((r) => r.mode)).toEqual(["INCLUDE", "EXCLUDE"]);
      expect(mockExclusions.recomputeForUser).toHaveBeenCalledTimes(1);
      expect(mockExclusions.recomputeForUser).toHaveBeenCalledWith(3);
      expect(mockPrisma.userContentRestriction.findMany).toHaveBeenCalledWith({
        where: { userId: 3 },
      });
      expect(res._getOkBody().success).toBe(true);
      expect(res._getOkBody().restrictions).toEqual(saved);
    });

    it("deletes and inserts in one batch transaction, then recomputes", async () => {
      // Stand-ins the test only compares by identity
      const deleteOp = partialRow<Prisma.PrismaPromise<Prisma.BatchPayload>>(
        {}
      );
      const createOp = partialRow<Prisma.PrismaPromise<Prisma.BatchPayload>>(
        {}
      );
      const order: string[] = [];
      mockPrisma.userContentRestriction.deleteMany.mockReturnValue(deleteOp);
      mockPrisma.userContentRestriction.createMany.mockReturnValue(createOp);
      mockPrisma.$transaction.mockImplementation(
        prismaImpl(() => {
          order.push("transaction");
          return [{ count: 0 }, { count: 1 }];
        })
      );
      mockExclusions.recomputeForUser.mockImplementation(async () => {
        order.push("recompute");
      });
      const req = reqFor(updateUserRestrictions, {
        body: { restrictions: [tagRule("EXCLUDE")] },
        params: { userId: "3" },
        user: ADMIN,
      });
      const res = resFor(updateUserRestrictions);
      await updateUserRestrictions(req, res);

      expect(res._getStatus()).toBe(200);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      // The batch form; the mock's parameter type is the callback overload's
      const ops: unknown = must(mockPrisma.$transaction.mock.calls[0])[0];
      if (!Array.isArray(ops)) throw new Error("expected a batch transaction");
      expect(ops).toHaveLength(2);
      expect(ops[0]).toBe(deleteOp);
      expect(ops[1]).toBe(createOp);
      expect(order).toEqual(["transaction", "recompute"]);
    });

    it("500 and no recompute when the transaction fails", async () => {
      mockPrisma.$transaction.mockRejectedValue(
        new Error("UNIQUE constraint failed")
      );
      const req = reqFor(updateUserRestrictions, {
        body: { restrictions: [tagRule("EXCLUDE")] },
        params: { userId: "3" },
        user: ADMIN,
      });
      const res = resFor(updateUserRestrictions);
      await updateUserRestrictions(req, res);

      expect(res._getStatus()).toBe(500);
      expect(mockExclusions.recomputeForUser).not.toHaveBeenCalled();
    });
  });
});
