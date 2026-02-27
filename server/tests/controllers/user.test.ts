/**
 * Unit Tests for User Controller — Settings, Password, and Admin Operations
 *
 * Tests getUserSettings, updateUserSettings, changePassword, getRecoveryKey,
 * regenerateRecoveryKey, adminResetPassword, adminRegenerateRecoveryKey,
 * getAllUsers, createUser, deleteUser, updateUserRole.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock prisma
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

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

import prisma from "../../prisma/singleton.js";
import bcrypt from "bcryptjs";
import { validatePassword } from "../../utils/passwordValidation.js";
import { formatRecoveryKey } from "../../utils/recoveryKey.js";
import {
  getUserSettings,
  updateUserSettings,
  changePassword,
  getRecoveryKey,
  regenerateRecoveryKey,
  adminResetPassword,
  adminRegenerateRecoveryKey,
  getAllUsers,
  createUser,
  deleteUser,
  updateUserRole,
} from "../../controllers/user.js";

const mockPrisma = vi.mocked(prisma);
const mockBcrypt = vi.mocked(bcrypt);
const mockValidatePassword = vi.mocked(validatePassword);

const ADMIN = { id: 1, username: "admin", role: "ADMIN" };
const USER = { id: 2, username: "testuser", role: "USER" };

function mockReq(
  body: Record<string, unknown> = {},
  params: Record<string, string> = {},
  user: typeof ADMIN | typeof USER | Record<string, unknown> = USER,
  query: Record<string, string> = {}
) {
  return { body, params, user, query } as any;
}

function mockRes() {
  const res: any = {
    json: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
    _getStatus: () => res.status.mock.calls[0]?.[0] ?? 200,
    _getBody: () => {
      const jsonCalls = res.json.mock.calls;
      return jsonCalls[jsonCalls.length - 1]?.[0];
    },
  };
  return res;
}

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
      expect(body.settings.landingPagePreference).toEqual({ pages: ["home"], randomize: false }); // default
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
        { landingPagePreference: { pages: ["home", "invalid-page"], randomize: false } },
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
      const req = mockReq({ currentPassword: "old", newPassword: "New1pass" }, {}, {} as any);
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
      mockValidatePassword.mockReturnValue({ valid: false, errors: ["Too short"] });
      const req = mockReq({ currentPassword: "old", newPassword: "bad" }, {}, USER);
      const res = mockRes();
      await changePassword(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody().error).toMatch(/Too short/);
    });

    it("returns 404 when user not found", async () => {
      mockValidatePassword.mockReturnValue({ valid: true, errors: [] });
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const req = mockReq({ currentPassword: "old", newPassword: "NewPass1" }, {}, USER);
      const res = mockRes();
      await changePassword(req, res);
      expect(res._getStatus()).toBe(404);
    });

    it("returns 401 when current password is incorrect", async () => {
      mockValidatePassword.mockReturnValue({ valid: true, errors: [] });
      mockPrisma.user.findUnique.mockResolvedValue({ id: 2, password: "hashed" } as any);
      mockBcrypt.compare.mockResolvedValue(false as any);
      const req = mockReq({ currentPassword: "wrong", newPassword: "NewPass1" }, {}, USER);
      const res = mockRes();
      await changePassword(req, res);
      expect(res._getStatus()).toBe(401);
      expect(res._getBody().error).toMatch(/incorrect/);
    });

    it("changes password successfully", async () => {
      mockValidatePassword.mockReturnValue({ valid: true, errors: [] });
      mockPrisma.user.findUnique.mockResolvedValue({ id: 2, password: "hashed" } as any);
      mockBcrypt.compare.mockResolvedValue(true as any);
      mockPrisma.user.update.mockResolvedValue({} as any);
      const req = mockReq({ currentPassword: "OldPass1", newPassword: "NewPass1" }, {}, USER);
      const res = mockRes();
      await changePassword(req, res);
      expect(res._getBody().success).toBe(true);
      expect(mockBcrypt.hash).toHaveBeenCalledWith("NewPass1", 10);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 2 },
          data: { password: "hashed-password" },
        })
      );
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

    it("returns formatted recovery key", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ recoveryKey: "ABCD1234EFGH5678" } as any);
      const req = mockReq({}, {}, USER);
      const res = mockRes();
      await getRecoveryKey(req, res);
      expect(res._getBody().recoveryKey).toBe("ABCD-1234-EFGH-5678");
    });

    it("returns null when no recovery key exists", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ recoveryKey: null } as any);
      const req = mockReq({}, {}, USER);
      const res = mockRes();
      await getRecoveryKey(req, res);
      expect(res._getBody().recoveryKey).toBeNull();
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

    it("generates and returns new formatted key", async () => {
      mockPrisma.user.update.mockResolvedValue({} as any);
      const req = mockReq({}, {}, USER);
      const res = mockRes();
      await regenerateRecoveryKey(req, res);
      expect(res._getBody().recoveryKey).toBe("ABCD-1234-EFGH-5678");
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 2 },
          data: { recoveryKey: "ABCD1234EFGH5678" },
        })
      );
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
      const req = mockReq({ newPassword: "NewPass1" }, { userId: "abc" }, ADMIN);
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
      const req = mockReq({ username: "existing", password: "Pass123" }, {}, ADMIN);
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
  });
});
