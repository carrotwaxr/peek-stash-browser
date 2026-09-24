/**
 * Unit Tests for User Controller — Settings, Password, and Admin Operations
 *
 * Tests getUserSettings, updateUserSettings, changePassword, getRecoveryKey,
 * regenerateRecoveryKey, adminResetPassword, adminRegenerateRecoveryKey,
 * getAllUsers, createUser, deleteUser, updateUserRole.
 */
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
import { validatePassword } from "../../utils/passwordValidation.js";
import { formatRecoveryKey } from "../../utils/recoveryKey.js";
import { mockReq, mockRes } from "../helpers/controllerTestUtils.js";

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
      const req = mockReq({}, {}, {} as any);
      const res = mockRes();
      await getUserSettings(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns 404 when user not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const req = mockReq({}, {}, USER);
      const res = mockRes();
      await getUserSettings(req, res);
      expect(res._getStatus()).toBe(404);
    });

    it("returns user settings with defaults for null fields", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
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
        minimumPlayPercent: null,
        syncToStash: false,
        hideConfirmationDisabled: false,
        unitPreference: null,
        wallPlayback: null,
        tableColumnDefaults: null,
        cardDisplaySettings: null,
        landingPagePreference: null,
        lightboxDoubleTapAction: null,
      } as any);

      const req = mockReq({}, {}, USER);
      const res = mockRes();
      await getUserSettings(req, res);

      const body = res._getBody();
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
      const req = mockReq({}, {}, USER);
      const res = mockRes();
      await getUserSettings(req, res);
      expect(res._getStatus()).toBe(500);
    });
  });

  // ─── updateUserSettings ───

  describe("updateUserSettings", () => {
    const mockUpdatedUser = {
      id: 2,
      preferredQuality: "720p",
      preferredPlaybackMode: null,
      theme: null,
      carouselPreferences: null,
      navPreferences: null,
      minimumPlayPercent: null,
      syncToStash: false,
      wallPlayback: null,
      tableColumnDefaults: null,
      cardDisplaySettings: null,
      landingPagePreference: null,
      lightboxDoubleTapAction: null,
    };

    it("returns 401 when user has no id", async () => {
      const req = mockReq({}, {}, {} as any);
      const res = mockRes();
      await updateUserSettings(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns 403 when non-admin updates another user", async () => {
      const req = mockReq({}, { userId: "3" }, USER);
      const res = mockRes();
      await updateUserSettings(req, res);
      expect(res._getStatus()).toBe(403);
    });

    it("allows admin to update another user's settings", async () => {
      mockPrisma.user.update.mockResolvedValue(mockUpdatedUser as any);
      const req = mockReq({ preferredQuality: "720p" }, { userId: "2" }, ADMIN);
      const res = mockRes();
      await updateUserSettings(req, res);
      expect(res._getBody().success).toBe(true);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 2 } })
      );
    });

    it("updates own settings successfully", async () => {
      mockPrisma.user.update.mockResolvedValue(mockUpdatedUser as any);
      const req = mockReq({ preferredQuality: "720p" }, {}, USER);
      const res = mockRes();
      await updateUserSettings(req, res);
      expect(res._getBody().success).toBe(true);
    });

    // Validation tests
    it("rejects invalid quality", async () => {
      const req = mockReq({ preferredQuality: "4k" }, {}, USER);
      const res = mockRes();
      await updateUserSettings(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody().error).toMatch(/Invalid quality/);
    });

    it("rejects invalid playback mode", async () => {
      const req = mockReq({ preferredPlaybackMode: "turbo" }, {}, USER);
      const res = mockRes();
      await updateUserSettings(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody().error).toMatch(/Invalid playback mode/);
    });

    it("rejects invalid preview quality", async () => {
      const req = mockReq({ preferredPreviewQuality: "gif" }, {}, USER);
      const res = mockRes();
      await updateUserSettings(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody().error).toMatch(/Invalid preview quality/);
    });

    it("rejects minimumPlayPercent out of range", async () => {
      const req = mockReq({ minimumPlayPercent: 150 }, {}, USER);
      const res = mockRes();
      await updateUserSettings(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("rejects non-number minimumPlayPercent", async () => {
      const req = mockReq({ minimumPlayPercent: "half" }, {}, USER);
      const res = mockRes();
      await updateUserSettings(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("rejects non-boolean syncToStash", async () => {
      const req = mockReq({ syncToStash: "yes" }, {}, USER);
      const res = mockRes();
      await updateUserSettings(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns 403 when a non-admin sends syncToStash", async () => {
      const req = mockReq({ syncToStash: true }, {}, USER);
      const res = mockRes();
      await updateUserSettings(req, res);
      expect(res._getStatus()).toBe(403);
      expect(res._getBody().error).toBe("Only admins can change Sync to Stash");
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it("lets an admin set syncToStash on their own settings", async () => {
      mockPrisma.user.update.mockResolvedValue({
        ...mockUpdatedUser,
        id: 1,
        syncToStash: true,
      } as any);
      const req = mockReq({ syncToStash: true }, {}, ADMIN);
      const res = mockRes();
      await updateUserSettings(req, res);
      expect(res._getBody().success).toBe(true);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({ syncToStash: true }),
        })
      );
    });

    it("rejects invalid unitPreference", async () => {
      const req = mockReq({ unitPreference: "kelvin" }, {}, USER);
      const res = mockRes();
      await updateUserSettings(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("rejects invalid wallPlayback", async () => {
      const req = mockReq({ wallPlayback: "loop" }, {}, USER);
      const res = mockRes();
      await updateUserSettings(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("rejects non-array carouselPreferences", async () => {
      const req = mockReq({ carouselPreferences: "bad" }, {}, USER);
      const res = mockRes();
      await updateUserSettings(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("rejects invalid carousel preference format", async () => {
      const req = mockReq(
        { carouselPreferences: [{ id: 123, enabled: "yes", order: "first" }] },
        {},
        USER
      );
      const res = mockRes();
      await updateUserSettings(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("rejects non-array navPreferences", async () => {
      const req = mockReq({ navPreferences: {} }, {}, USER);
      const res = mockRes();
      await updateUserSettings(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("rejects invalid tableColumnDefaults entity type", async () => {
      const req = mockReq(
        { tableColumnDefaults: { invalid: { visible: [], order: [] } } },
        {},
        USER
      );
      const res = mockRes();
      await updateUserSettings(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("rejects tableColumnDefaults with missing arrays", async () => {
      const req = mockReq(
        { tableColumnDefaults: { scene: { visible: "not-array" } } },
        {},
        USER
      );
      const res = mockRes();
      await updateUserSettings(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("accepts null tableColumnDefaults (clearing)", async () => {
      mockPrisma.user.update.mockResolvedValue(mockUpdatedUser as any);
      const req = mockReq({ tableColumnDefaults: null }, {}, USER);
      const res = mockRes();
      await updateUserSettings(req, res);
      expect(res._getBody().success).toBe(true);
    });

    it("rejects landingPagePreference with no pages", async () => {
      const req = mockReq(
        { landingPagePreference: { pages: [], randomize: false } },
        {},
        USER
      );
      const res = mockRes();
      await updateUserSettings(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("rejects randomize mode with fewer than 2 pages", async () => {
      const req = mockReq(
        { landingPagePreference: { pages: ["home"], randomize: true } },
        {},
        USER
      );
      const res = mockRes();
      await updateUserSettings(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody().error).toMatch(/at least 2 pages/);
    });

    it("rejects invalid landing page key", async () => {
      const req = mockReq(
        {
          landingPagePreference: {
            pages: ["home", "invalid-page"],
            randomize: false,
          },
        },
        {},
        USER
      );
      const res = mockRes();
      await updateUserSettings(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody().error).toMatch(/Invalid landing page key/);
    });

    it("rejects invalid lightboxDoubleTapAction", async () => {
      const req = mockReq({ lightboxDoubleTapAction: "zoom" }, {}, USER);
      const res = mockRes();
      await updateUserSettings(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("accepts valid lightboxDoubleTapAction values", async () => {
      mockPrisma.user.update.mockResolvedValue(mockUpdatedUser as any);
      for (const action of ["favorite", "o_counter", "fullscreen"]) {
        const req = mockReq({ lightboxDoubleTapAction: action }, {}, USER);
        const res = mockRes();
        await updateUserSettings(req, res);
        expect(res._getBody().success).toBe(true);
      }
    });
  });

  // ─── changePassword ───

  describe("changePassword", () => {
    it("returns 401 when user has no id", async () => {
      const req = mockReq(
        { currentPassword: "old", newPassword: "New1pass" },
        {},
        {} as any
      );
      const res = mockRes();
      await changePassword(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns 400 when passwords missing", async () => {
      const req = mockReq({}, {}, USER);
      const res = mockRes();
      await changePassword(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody().error).toMatch(/required/);
    });

    it("returns 400 when new password fails validation", async () => {
      mockValidatePassword.mockReturnValue({
        valid: false,
        errors: ["Too short"],
      });
      const req = mockReq(
        { currentPassword: "old", newPassword: "bad" },
        {},
        USER
      );
      const res = mockRes();
      await changePassword(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody().error).toMatch(/Too short/);
    });

    it("returns 404 when user not found", async () => {
      mockValidatePassword.mockReturnValue({ valid: true, errors: [] });
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const req = mockReq(
        { currentPassword: "old", newPassword: "NewPass1" },
        {},
        USER
      );
      const res = mockRes();
      await changePassword(req, res);
      expect(res._getStatus()).toBe(404);
    });

    it("returns 401 when current password is incorrect", async () => {
      mockValidatePassword.mockReturnValue({ valid: true, errors: [] });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 2,
        password: "hashed",
      } as any);
      mockBcrypt.compare.mockResolvedValue(false as any);
      const req = mockReq(
        { currentPassword: "wrong", newPassword: "NewPass1" },
        {},
        USER
      );
      const res = mockRes();
      await changePassword(req, res);
      expect(res._getStatus()).toBe(401);
      expect(res._getBody().error).toMatch(/incorrect/);
    });

    it("changes password successfully", async () => {
      mockValidatePassword.mockReturnValue({ valid: true, errors: [] });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 2,
        password: "hashed",
      } as any);
      mockBcrypt.compare.mockResolvedValue(true as any);
      mockPrisma.user.update.mockResolvedValue({} as any);
      const req = mockReq(
        { currentPassword: "OldPass1", newPassword: "NewPass1" },
        {},
        USER
      );
      const res = mockRes();
      await changePassword(req, res);
      expect(res._getBody().success).toBe(true);
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
      const claims = jwt.decode(res.cookie.mock.calls[0][1]) as {
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
      const req = mockReq({}, {}, {} as any);
      const res = mockRes();
      await getRecoveryKey(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns 404 when user not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const req = mockReq({}, {}, USER);
      const res = mockRes();
      await getRecoveryKey(req, res);
      expect(res._getStatus()).toBe(404);
    });

    it("reports that a key exists without returning it", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        recoveryKeyHash: "a".repeat(64),
      } as any);
      const req = mockReq({}, {}, USER);
      const res = mockRes();
      await getRecoveryKey(req, res);
      expect(res._getBody()).toEqual({ hasRecoveryKey: true });
    });

    it("reports hasRecoveryKey false when no recovery key exists", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        recoveryKeyHash: null,
      } as any);
      const req = mockReq({}, {}, USER);
      const res = mockRes();
      await getRecoveryKey(req, res);
      expect(res._getBody()).toEqual({ hasRecoveryKey: false });
    });
  });

  // ─── regenerateRecoveryKey ───

  describe("regenerateRecoveryKey", () => {
    it("returns 401 when user has no id", async () => {
      const req = mockReq({}, {}, {} as any);
      const res = mockRes();
      await regenerateRecoveryKey(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns 400 without currentPassword", async () => {
      const req = mockReq({}, {}, USER);
      const res = mockRes();
      await regenerateRecoveryKey(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody().error).toBe("Current password is required");
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it("returns 400 when currentPassword is wrong", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 2,
        password: "hashed",
      } as any);
      mockBcrypt.compare.mockResolvedValue(false as any);
      const req = mockReq({ currentPassword: "wrong" }, {}, USER);
      const res = mockRes();
      await regenerateRecoveryKey(req, res);
      // 400, not 401, so the client's apiFetch does not bounce to login
      expect(res._getStatus()).toBe(400);
      expect(res._getBody().error).toBe("Current password is incorrect");
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it("stores only the hash and returns the formatted key", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 2,
        password: "hashed",
      } as any);
      mockBcrypt.compare.mockResolvedValue(true as any);
      mockPrisma.user.update.mockResolvedValue({} as any);
      const req = mockReq({ currentPassword: "OldPass1" }, {}, USER);
      const res = mockRes();
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
      const req = mockReq({ newPassword: "NewPass1" }, { userId: "3" }, USER);
      const res = mockRes();
      await adminResetPassword(req, res);
      expect(res._getStatus()).toBe(403);
    });

    it("returns 400 for invalid user ID", async () => {
      const req = mockReq(
        { newPassword: "NewPass1" },
        { userId: "abc" },
        ADMIN
      );
      const res = mockRes();
      await adminResetPassword(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody().error).toMatch(/Invalid user ID/);
    });

    it("returns 400 when password missing", async () => {
      const req = mockReq({}, { userId: "3" }, ADMIN);
      const res = mockRes();
      await adminResetPassword(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns 400 when password fails validation", async () => {
      mockValidatePassword.mockReturnValue({ valid: false, errors: ["Weak"] });
      const req = mockReq({ newPassword: "bad" }, { userId: "3" }, ADMIN);
      const res = mockRes();
      await adminResetPassword(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns 404 when user not found", async () => {
      mockValidatePassword.mockReturnValue({ valid: true, errors: [] });
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const req = mockReq({ newPassword: "NewPass1" }, { userId: "3" }, ADMIN);
      const res = mockRes();
      await adminResetPassword(req, res);
      expect(res._getStatus()).toBe(404);
    });

    it("resets password successfully", async () => {
      mockValidatePassword.mockReturnValue({ valid: true, errors: [] });
      mockPrisma.user.findUnique.mockResolvedValue({ id: 3 } as any);
      mockPrisma.user.update.mockResolvedValue({} as any);
      const req = mockReq({ newPassword: "NewPass1" }, { userId: "3" }, ADMIN);
      const res = mockRes();
      await adminResetPassword(req, res);
      expect(res._getBody().success).toBe(true);
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
      const req = mockReq({}, { userId: "3" }, USER);
      const res = mockRes();
      await adminRegenerateRecoveryKey(req, res);
      expect(res._getStatus()).toBe(403);
    });

    it("returns 404 when user not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const req = mockReq({}, { userId: "3" }, ADMIN);
      const res = mockRes();
      await adminRegenerateRecoveryKey(req, res);
      expect(res._getStatus()).toBe(404);
    });

    it("regenerates key successfully", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 3 } as any);
      mockPrisma.user.update.mockResolvedValue({} as any);
      const req = mockReq({}, { userId: "3" }, ADMIN);
      const res = mockRes();
      await adminRegenerateRecoveryKey(req, res);
      expect(res._getBody().recoveryKey).toBe("ABCD-1234-EFGH-5678");
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: { recoveryKeyHash: "hashed-key" },
      });
    });
  });

  // ─── getAllUsers ───

  describe("getAllUsers", () => {
    it("returns 403 when non-admin", async () => {
      const req = mockReq({}, {}, USER);
      const res = mockRes();
      await getAllUsers(req, res);
      expect(res._getStatus()).toBe(403);
    });

    it("returns users with group memberships mapped", async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 1,
          username: "admin",
          role: "ADMIN",
          createdAt: new Date(),
          updatedAt: new Date(),
          syncToStash: false,
          groupMemberships: [{ group: { id: 1, name: "Group A" } }],
        },
      ] as any);
      const req = mockReq({}, {}, ADMIN);
      const res = mockRes();
      await getAllUsers(req, res);
      const body = res._getBody();
      expect(body.users).toHaveLength(1);
      expect(body.users[0].groups).toEqual([{ id: 1, name: "Group A" }]);
      expect(body.users[0].groupMemberships).toBeUndefined();
    });
  });

  // ─── createUser ───

  describe("createUser", () => {
    it("returns 403 when non-admin", async () => {
      const req = mockReq({ username: "new", password: "Pass123" }, {}, USER);
      const res = mockRes();
      await createUser(req, res);
      expect(res._getStatus()).toBe(403);
    });

    it("returns 400 when username or password missing", async () => {
      const req = mockReq({ username: "new" }, {}, ADMIN);
      const res = mockRes();
      await createUser(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns 400 when password too short", async () => {
      const req = mockReq({ username: "new", password: "12345" }, {}, ADMIN);
      const res = mockRes();
      await createUser(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody().error).toMatch(/6 characters/);
    });

    it("returns 400 for invalid role", async () => {
      const req = mockReq(
        { username: "new", password: "Pass123", role: "SUPERADMIN" },
        {},
        ADMIN
      );
      const res = mockRes();
      await createUser(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody().error).toMatch(/ADMIN or USER/);
    });

    it("returns 409 when username already exists", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 5 } as any);
      const req = mockReq(
        { username: "existing", password: "Pass123" },
        {},
        ADMIN
      );
      const res = mockRes();
      await createUser(req, res);
      expect(res._getStatus()).toBe(409);
    });

    it("creates user with default USER role", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 5,
        username: "new",
        role: "USER",
        createdAt: new Date(),
      } as any);
      const req = mockReq({ username: "new", password: "Pass123" }, {}, ADMIN);
      const res = mockRes();
      await createUser(req, res);
      expect(res._getStatus()).toBe(201);
      expect(res._getBody().success).toBe(true);
      expect(res._getBody().user.username).toBe("new");
      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: "USER" }),
        })
      );
    });

    it("creates user with explicit ADMIN role", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 5,
        username: "admin2",
        role: "ADMIN",
        createdAt: new Date(),
      } as any);
      const req = mockReq(
        { username: "admin2", password: "Pass123", role: "ADMIN" },
        {},
        ADMIN
      );
      const res = mockRes();
      await createUser(req, res);
      expect(res._getStatus()).toBe(201);
    });
  });

  // ─── deleteUser ───

  describe("deleteUser", () => {
    it("returns 403 when non-admin", async () => {
      const req = mockReq({}, { userId: "3" }, USER);
      const res = mockRes();
      await deleteUser(req, res);
      expect(res._getStatus()).toBe(403);
    });

    it("returns 400 for invalid user ID", async () => {
      const req = mockReq({}, { userId: "abc" }, ADMIN);
      const res = mockRes();
      await deleteUser(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns 400 when trying to delete self", async () => {
      const req = mockReq({}, { userId: "1" }, ADMIN);
      const res = mockRes();
      await deleteUser(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody().error).toMatch(/own account/);
    });

    it("returns 404 when user not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const req = mockReq({}, { userId: "99" }, ADMIN);
      const res = mockRes();
      await deleteUser(req, res);
      expect(res._getStatus()).toBe(404);
    });

    it("deletes user successfully", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 3 } as any);
      mockPrisma.user.delete.mockResolvedValue({} as any);
      const req = mockReq({}, { userId: "3" }, ADMIN);
      const res = mockRes();
      await deleteUser(req, res);
      expect(res._getBody().success).toBe(true);
      expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: 3 } });
    });
  });

  // ─── updateUserRole ───

  describe("updateUserRole", () => {
    it("returns 403 when non-admin", async () => {
      const req = mockReq({ role: "ADMIN" }, { userId: "3" }, USER);
      const res = mockRes();
      await updateUserRole(req, res);
      expect(res._getStatus()).toBe(403);
    });

    it("returns 400 for invalid user ID", async () => {
      const req = mockReq({ role: "USER" }, { userId: "abc" }, ADMIN);
      const res = mockRes();
      await updateUserRole(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns 400 for invalid role", async () => {
      const req = mockReq({ role: "SUPERADMIN" }, { userId: "3" }, ADMIN);
      const res = mockRes();
      await updateUserRole(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns 400 when changing own role", async () => {
      const req = mockReq({ role: "USER" }, { userId: "1" }, ADMIN);
      const res = mockRes();
      await updateUserRole(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody().error).toMatch(/own role/);
    });

    it("updates role successfully", async () => {
      mockPrisma.user.update.mockResolvedValue({
        id: 3,
        username: "user3",
        role: "ADMIN",
        updatedAt: new Date(),
      } as any);
      const req = mockReq({ role: "ADMIN" }, { userId: "3" }, ADMIN);
      const res = mockRes();
      await updateUserRole(req, res);
      expect(res._getBody().success).toBe(true);
      expect(res._getBody().user.role).toBe("ADMIN");
    });

    it("recomputes exclusions after a role change", async () => {
      // Promotion drops restricted/empty rows; demotion applies the kept rows again
      const order: string[] = [];
      mockPrisma.user.update.mockImplementation(() => {
        order.push("update");
        return Promise.resolve({
          id: 3,
          username: "user3",
          role: "USER",
          updatedAt: new Date(),
        }) as any;
      });
      mockExclusions.recomputeForUser.mockImplementation(async () => {
        order.push("recompute");
      });
      const req = mockReq({ role: "USER" }, { userId: "3" }, ADMIN);
      const res = mockRes();
      await updateUserRole(req, res);
      expect(mockExclusions.recomputeForUser).toHaveBeenCalledWith(3);
      expect(order).toEqual(["update", "recompute"]);
      expect(res._getBody().success).toBe(true);
    });
  });

  // ─── updateUserRestrictions ───

  describe("updateUserRestrictions", () => {
    const TARGET = { id: 3, username: "user3", role: "USER" };
    const tagRule = (mode: string, ids: unknown[] = ["1:A"]) => ({
      entityType: "tags",
      mode,
      entityIds: ids,
    });

    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue(TARGET as any);
      mockPrisma.userContentRestriction.deleteMany.mockResolvedValue({
        count: 0,
      } as any);
      mockPrisma.userContentRestriction.createMany.mockResolvedValue({
        count: 1,
      } as any);
      mockPrisma.userContentRestriction.findMany.mockResolvedValue([] as any);
      mockPrisma.$transaction.mockImplementation(((ops: unknown[]) =>
        Promise.all(ops)) as any);
      mockExclusions.recomputeForUser.mockResolvedValue(undefined);
    });

    it("returns 403 when non-admin", async () => {
      const req = mockReq(
        { restrictions: [tagRule("EXCLUDE")] },
        { userId: "3" },
        USER
      );
      const res = mockRes();
      await updateUserRestrictions(req, res);
      expect(res._getStatus()).toBe(403);
    });

    it("400 when the target is an admin", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...TARGET,
        role: "ADMIN",
      } as any);
      const req = mockReq(
        { restrictions: [tagRule("EXCLUDE")] },
        { userId: "3" },
        ADMIN
      );
      const res = mockRes();
      await updateUserRestrictions(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody().error).toMatch(/administrators/);
      expect(
        mockPrisma.userContentRestriction.deleteMany
      ).not.toHaveBeenCalled();
    });

    it("404 when the target does not exist", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const req = mockReq(
        { restrictions: [tagRule("EXCLUDE")] },
        { userId: "3" },
        ADMIN
      );
      const res = mockRes();
      await updateUserRestrictions(req, res);
      expect(res._getStatus()).toBe(404);
      expect(
        mockPrisma.userContentRestriction.deleteMany
      ).not.toHaveBeenCalled();
    });

    it("400 on a duplicate (entityType, mode) pair", async () => {
      const req = mockReq(
        { restrictions: [tagRule("EXCLUDE"), tagRule("EXCLUDE", ["2:A"])] },
        { userId: "3" },
        ADMIN
      );
      const res = mockRes();
      await updateUserRestrictions(req, res);
      expect(res._getStatus()).toBe(400);
      expect(
        mockPrisma.userContentRestriction.deleteMany
      ).not.toHaveBeenCalled();
    });

    it("400 on an empty entityIds list", async () => {
      const req = mockReq(
        { restrictions: [tagRule("INCLUDE", [])] },
        { userId: "3" },
        ADMIN
      );
      const res = mockRes();
      await updateUserRestrictions(req, res);
      expect(res._getStatus()).toBe(400);
      expect(
        mockPrisma.userContentRestriction.deleteMany
      ).not.toHaveBeenCalled();
    });

    it("400 on a malformed id", async () => {
      for (const bad of [["abc"], ["1:"], [5], ["1:A", "x:y:"]]) {
        vi.clearAllMocks();
        mockPrisma.user.findUnique.mockResolvedValue(TARGET as any);
        const req = mockReq(
          { restrictions: [tagRule("EXCLUDE", bad)] },
          { userId: "3" },
          ADMIN
        );
        const res = mockRes();
        await updateUserRestrictions(req, res);
        expect(res._getStatus()).toBe(400);
        expect(
          mockPrisma.userContentRestriction.deleteMany
        ).not.toHaveBeenCalled();
      }
    });

    it("400 on a non-boolean restrictEmpty", async () => {
      const req = mockReq(
        { restrictions: [{ ...tagRule("EXCLUDE"), restrictEmpty: "yes" }] },
        { userId: "3" },
        ADMIN
      );
      const res = mockRes();
      await updateUserRestrictions(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("defaults restrictEmpty to true for INCLUDE and false for EXCLUDE when omitted", async () => {
      const req = mockReq(
        {
          restrictions: [
            tagRule("INCLUDE"),
            { entityType: "studios", mode: "EXCLUDE", entityIds: ["7:A"] },
          ],
        },
        { userId: "3" },
        ADMIN
      );
      const res = mockRes();
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
      const req = mockReq(
        { restrictions: [{ ...tagRule("INCLUDE"), restrictEmpty: false }] },
        { userId: "3" },
        ADMIN
      );
      const res = mockRes();
      await updateUserRestrictions(req, res);
      const data = mockPrisma.userContentRestriction.createMany.mock
        .calls[0]?.[0]?.data as Array<Record<string, unknown>>;
      expect(data[0].restrictEmpty).toBe(false);
    });

    it("stores an INCLUDE and an EXCLUDE row for the same type and recomputes", async () => {
      const saved = [
        { id: 10, userId: 3, entityType: "tags", mode: "INCLUDE" },
        { id: 11, userId: 3, entityType: "tags", mode: "EXCLUDE" },
      ];
      mockPrisma.userContentRestriction.findMany.mockResolvedValue(
        saved as any
      );
      const req = mockReq(
        {
          restrictions: [
            { ...tagRule("INCLUDE"), restrictEmpty: true },
            { ...tagRule("EXCLUDE", ["2:A"]), restrictEmpty: true },
          ],
        },
        { userId: "3" },
        ADMIN
      );
      const res = mockRes();
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
      expect(res._getBody().success).toBe(true);
      expect(res._getBody().restrictions).toEqual(saved);
    });

    it("deletes and inserts in one batch transaction, then recomputes", async () => {
      const deleteOp = { op: "deleteMany" };
      const createOp = { op: "createMany" };
      const order: string[] = [];
      mockPrisma.userContentRestriction.deleteMany.mockReturnValue(
        deleteOp as any
      );
      mockPrisma.userContentRestriction.createMany.mockReturnValue(
        createOp as any
      );
      mockPrisma.$transaction.mockImplementation((async () => {
        order.push("transaction");
        return [{ count: 0 }, { count: 1 }];
      }) as any);
      mockExclusions.recomputeForUser.mockImplementation(async () => {
        order.push("recompute");
      });
      const req = mockReq(
        { restrictions: [tagRule("EXCLUDE")] },
        { userId: "3" },
        ADMIN
      );
      const res = mockRes();
      await updateUserRestrictions(req, res);

      expect(res._getStatus()).toBe(200);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      // The batch form; the mock's parameter type is the callback overload's
      const ops: unknown = mockPrisma.$transaction.mock.calls[0][0];
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
      const req = mockReq(
        { restrictions: [tagRule("EXCLUDE")] },
        { userId: "3" },
        ADMIN
      );
      const res = mockRes();
      await updateUserRestrictions(req, res);

      expect(res._getStatus()).toBe(500);
      expect(mockExclusions.recomputeForUser).not.toHaveBeenCalled();
    });
  });
});
