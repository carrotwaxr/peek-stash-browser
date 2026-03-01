/**
 * Unit Tests for User Controller — Filter Presets, Restrictions, Hidden Entities,
 * Permissions, Instance Selection, and Setup
 *
 * Tests getFilterPresets, saveFilterPreset, deleteFilterPreset,
 * getDefaultFilterPresets, setDefaultFilterPreset, getUserRestrictions,
 * updateUserRestrictions, deleteUserRestrictions, hideEntity, unhideEntity,
 * unhideAllEntities, getHiddenEntities, getHiddenEntityIds, hideEntities,
 * updateHideConfirmation, getUserPermissions, getAnyUserPermissions,
 * updateUserPermissionOverrides, getUserGroupMemberships,
 * getUserStashInstances, updateUserStashInstances, getSetupStatus,
 * completeSetup, syncFromStash (auth/validation only).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock prisma
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    userContentRestriction: {
      findMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    userGroupMembership: {
      findMany: vi.fn(),
    },
    userStashInstance: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    stashInstance: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// Mock bcryptjs (imported by user.ts)
vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn(), compare: vi.fn() },
}));

// Mock recoveryKey utils (imported by user.ts)
vi.mock("../../utils/recoveryKey.js", () => ({
  generateRecoveryKey: vi.fn(),
  formatRecoveryKey: vi.fn(),
}));

// Mock passwordValidation (imported by user.ts)
vi.mock("../../utils/passwordValidation.js", () => ({
  validatePassword: vi.fn(),
}));

// Mock PermissionService
vi.mock("../../services/PermissionService.js", () => ({
  resolveUserPermissions: vi.fn(),
}));

// Mock ExclusionComputationService
vi.mock("../../services/ExclusionComputationService.js", () => ({
  exclusionComputationService: {
    recomputeForUser: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock UserHiddenEntityService (dynamically imported)
vi.mock("../../services/UserHiddenEntityService.js", () => ({
  userHiddenEntityService: {
    hideEntity: vi.fn().mockResolvedValue(undefined),
    unhideEntity: vi.fn().mockResolvedValue(undefined),
    unhideAll: vi.fn().mockResolvedValue(5),
    getHiddenEntities: vi.fn().mockResolvedValue([]),
    getHiddenEntityIds: vi.fn().mockResolvedValue({
      scenes: new Set(),
      performers: new Set(),
      studios: new Set(),
      tags: new Set(),
      groups: new Set(),
      galleries: new Set(),
      images: new Set(),
    }),
  },
}));

// Mock StashInstanceManager (dynamically imported by hideEntity/unhideEntity)
vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    getConfig: vi.fn().mockReturnValue({ id: "inst-1" }),
    getAll: vi.fn().mockReturnValue([]),
  },
}));

import prisma from "../../prisma/singleton.js";
import { resolveUserPermissions } from "../../services/PermissionService.js";
import { exclusionComputationService } from "../../services/ExclusionComputationService.js";
import {
  getFilterPresets,
  saveFilterPreset,
  deleteFilterPreset,
  getDefaultFilterPresets,
  setDefaultFilterPreset,
  getUserRestrictions,
  updateUserRestrictions,
  deleteUserRestrictions,
  hideEntity,
  unhideEntity,
  unhideAllEntities,
  getHiddenEntities,
  getHiddenEntityIds,
  hideEntities,
  updateHideConfirmation,
  getUserPermissions,
  getAnyUserPermissions,
  updateUserPermissionOverrides,
  getUserGroupMemberships,
  getUserStashInstances,
  updateUserStashInstances,
  getSetupStatus,
  completeSetup,
  syncFromStash,
} from "../../controllers/user.js";
import { mockReq, mockRes } from "../helpers/controllerTestUtils.js";

const mockPrisma = vi.mocked(prisma);
const mockResolvePermissions = vi.mocked(resolveUserPermissions);
const mockExclusionService = vi.mocked(exclusionComputationService);

const ADMIN = { id: 1, username: "admin", role: "ADMIN" };
const USER = { id: 2, username: "testuser", role: "USER" };

describe("User Controller — Features", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Filter Presets ───

  describe("getFilterPresets", () => {
    it("returns 401 when user has no id", async () => {
      const req = mockReq({}, {}, {} as any);
      const res = mockRes();
      await getFilterPresets(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns 404 when user not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const req = mockReq({}, {}, USER);
      const res = mockRes();
      await getFilterPresets(req, res);
      expect(res._getStatus()).toBe(404);
    });

    it("returns empty preset structure when none exist", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ filterPresets: null } as any);
      const req = mockReq({}, {}, USER);
      const res = mockRes();
      await getFilterPresets(req, res);
      const body = res._getBody();
      expect(body.presets).toEqual({
        scene: [],
        performer: [],
        studio: [],
        tag: [],
      });
    });

    it("returns existing presets", async () => {
      const presets = { scene: [{ id: "1", name: "Test" }] };
      mockPrisma.user.findUnique.mockResolvedValue({ filterPresets: presets } as any);
      const req = mockReq({}, {}, USER);
      const res = mockRes();
      await getFilterPresets(req, res);
      expect(res._getBody().presets).toEqual(presets);
    });
  });

  describe("saveFilterPreset", () => {
    it("returns 401 when user has no id", async () => {
      const req = mockReq({}, {}, {} as any);
      const res = mockRes();
      await saveFilterPreset(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns 400 when required fields missing", async () => {
      const req = mockReq({ artifactType: "scene" }, {}, USER);
      const res = mockRes();
      await saveFilterPreset(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody().error).toMatch(/Missing required/);
    });

    it("returns 400 for invalid artifact type", async () => {
      const req = mockReq(
        {
          artifactType: "invalid",
          name: "Test",
          filters: {},
          sort: "title",
          direction: "ASC",
        },
        {},
        USER
      );
      const res = mockRes();
      await saveFilterPreset(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody().error).toMatch(/Invalid artifact type/);
    });

    it("returns 400 for invalid context", async () => {
      const req = mockReq(
        {
          artifactType: "scene",
          context: "invalid_context",
          name: "Test",
          filters: {},
          sort: "title",
          direction: "ASC",
        },
        {},
        USER
      );
      const res = mockRes();
      await saveFilterPreset(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody().error).toMatch(/Invalid context/);
    });

    it("saves preset with defaults for optional fields", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        filterPresets: {},
        defaultFilterPresets: {},
      } as any);
      mockPrisma.user.update.mockResolvedValue({} as any);

      const req = mockReq(
        {
          artifactType: "scene",
          name: "My Filter",
          filters: { rating: 80 },
          sort: "rating",
          direction: "DESC",
        },
        {},
        USER
      );
      const res = mockRes();
      await saveFilterPreset(req, res);
      const body = res._getBody();
      expect(body.success).toBe(true);
      expect(body.preset.name).toBe("My Filter");
      expect(body.preset.viewMode).toBe("grid");
      expect(body.preset.zoomLevel).toBe("medium");
      expect(body.preset.gridDensity).toBe("comfortable");
      expect(body.preset.id).toBeDefined();
      expect(body.preset.createdAt).toBeDefined();
    });

    it("sets preset as default when setAsDefault is true", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        filterPresets: {},
        defaultFilterPresets: {},
      } as any);
      mockPrisma.user.update.mockResolvedValue({} as any);

      const req = mockReq(
        {
          artifactType: "scene",
          context: "scene_performer",
          name: "Fav Filter",
          filters: {},
          sort: "name",
          direction: "ASC",
          setAsDefault: true,
        },
        {},
        USER
      );
      const res = mockRes();
      await saveFilterPreset(req, res);

      // Check that defaultFilterPresets was updated in the prisma call
      const updateCall = mockPrisma.user.update.mock.calls[0][0];
      const defaults = updateCall.data.defaultFilterPresets as Record<string, unknown>;
      expect(defaults.scene_performer).toBeDefined();
    });
  });

  describe("deleteFilterPreset", () => {
    it("returns 400 for invalid artifact type", async () => {
      const req = mockReq({}, { artifactType: "invalid", presetId: "1" }, USER);
      const res = mockRes();
      await deleteFilterPreset(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns 404 when user not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const req = mockReq({}, { artifactType: "scene", presetId: "1" }, USER);
      const res = mockRes();
      await deleteFilterPreset(req, res);
      expect(res._getStatus()).toBe(404);
    });

    it("deletes preset and clears default if it was default", async () => {
      const presetId = "preset-to-delete";
      mockPrisma.user.findUnique.mockResolvedValue({
        filterPresets: { scene: [{ id: presetId, name: "Test" }] },
        defaultFilterPresets: { scene: presetId },
      } as any);
      mockPrisma.user.update.mockResolvedValue({} as any);

      const req = mockReq({}, { artifactType: "scene", presetId }, USER);
      const res = mockRes();
      await deleteFilterPreset(req, res);
      expect(res._getBody().success).toBe(true);

      const updateCall = mockPrisma.user.update.mock.calls[0][0];
      const presets = updateCall.data.filterPresets as Record<string, unknown[]>;
      const defaults = updateCall.data.defaultFilterPresets as Record<string, unknown>;
      expect(presets.scene).toEqual([]);
      expect(defaults.scene).toBeUndefined();
    });
  });

  describe("getDefaultFilterPresets", () => {
    it("returns 401 when user has no id", async () => {
      const req = mockReq({}, {}, {} as any);
      const res = mockRes();
      await getDefaultFilterPresets(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns empty object when no defaults set", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ defaultFilterPresets: null } as any);
      const req = mockReq({}, {}, USER);
      const res = mockRes();
      await getDefaultFilterPresets(req, res);
      expect(res._getBody().defaults).toEqual({});
    });
  });

  describe("setDefaultFilterPreset", () => {
    it("returns 400 when context missing", async () => {
      const req = mockReq({}, {}, USER);
      const res = mockRes();
      await setDefaultFilterPreset(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody().error).toMatch(/Missing context/);
    });

    it("returns 400 for invalid context", async () => {
      const req = mockReq({ context: "bogus" }, {}, USER);
      const res = mockRes();
      await setDefaultFilterPreset(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns 400 when preset not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        defaultFilterPresets: {},
        filterPresets: { scene: [] },
      } as any);
      const req = mockReq({ context: "scene", presetId: "nonexistent" }, {}, USER);
      const res = mockRes();
      await setDefaultFilterPreset(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody().error).toMatch(/Preset not found/);
    });

    it("clears default when presetId is null", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        defaultFilterPresets: { scene: "some-id" },
        filterPresets: {},
      } as any);
      mockPrisma.user.update.mockResolvedValue({} as any);
      const req = mockReq({ context: "scene" }, {}, USER);
      const res = mockRes();
      await setDefaultFilterPreset(req, res);
      expect(res._getBody().success).toBe(true);
    });

    it("validates scene grid contexts against scene presets", async () => {
      const presetId = "existing-preset";
      mockPrisma.user.findUnique.mockResolvedValue({
        defaultFilterPresets: {},
        filterPresets: { scene: [{ id: presetId, name: "Test" }] },
      } as any);
      mockPrisma.user.update.mockResolvedValue({} as any);
      const req = mockReq({ context: "scene_performer", presetId }, {}, USER);
      const res = mockRes();
      await setDefaultFilterPreset(req, res);
      expect(res._getBody().success).toBe(true);
    });
  });

  // ─── Content Restrictions ───

  describe("getUserRestrictions", () => {
    it("returns 401 when user missing", async () => {
      const req = { params: { userId: "2" }, user: undefined } as any;
      const res = mockRes();
      await getUserRestrictions(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns 403 when non-admin", async () => {
      const req = mockReq({}, { userId: "2" }, USER);
      const res = mockRes();
      await getUserRestrictions(req, res);
      expect(res._getStatus()).toBe(403);
    });

    it("returns restrictions for user", async () => {
      const restrictions = [{ id: 1, entityType: "tags", mode: "EXCLUDE", entityIds: "[]" }];
      mockPrisma.userContentRestriction.findMany.mockResolvedValue(restrictions as any);
      const req = mockReq({}, { userId: "2" }, ADMIN);
      const res = mockRes();
      await getUserRestrictions(req, res);
      expect(res._getBody().restrictions).toEqual(restrictions);
    });
  });

  describe("updateUserRestrictions", () => {
    it("returns 403 when non-admin", async () => {
      const req = mockReq({ restrictions: [] }, { userId: "2" }, USER);
      const res = mockRes();
      await updateUserRestrictions(req, res);
      expect(res._getStatus()).toBe(403);
    });

    it("returns 400 when restrictions not an array", async () => {
      const req = mockReq({ restrictions: "bad" }, { userId: "2" }, ADMIN);
      const res = mockRes();
      await updateUserRestrictions(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns 400 for invalid entity type", async () => {
      const req = mockReq(
        { restrictions: [{ entityType: "users", mode: "EXCLUDE", entityIds: [] }] },
        { userId: "2" },
        ADMIN
      );
      const res = mockRes();
      await updateUserRestrictions(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns 400 for invalid mode", async () => {
      const req = mockReq(
        { restrictions: [{ entityType: "tags", mode: "BLOCK", entityIds: [] }] },
        { userId: "2" },
        ADMIN
      );
      const res = mockRes();
      await updateUserRestrictions(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns 400 when entityIds not an array", async () => {
      const req = mockReq(
        { restrictions: [{ entityType: "tags", mode: "EXCLUDE", entityIds: "1,2" }] },
        { userId: "2" },
        ADMIN
      );
      const res = mockRes();
      await updateUserRestrictions(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("replaces all restrictions and recomputes exclusions", async () => {
      mockPrisma.userContentRestriction.deleteMany.mockResolvedValue({ count: 1 } as any);
      mockPrisma.userContentRestriction.create.mockResolvedValue({ id: 1 } as any);
      const req = mockReq(
        {
          restrictions: [
            { entityType: "tags", mode: "EXCLUDE", entityIds: ["1", "2"] },
          ],
        },
        { userId: "2" },
        ADMIN
      );
      const res = mockRes();
      await updateUserRestrictions(req, res);
      expect(res._getBody().success).toBe(true);
      expect(mockPrisma.userContentRestriction.deleteMany).toHaveBeenCalledWith({
        where: { userId: 2 },
      });
      expect(mockExclusionService.recomputeForUser).toHaveBeenCalledWith(2);
    });
  });

  describe("deleteUserRestrictions", () => {
    it("returns 403 when non-admin", async () => {
      const req = mockReq({}, { userId: "2" }, USER);
      const res = mockRes();
      await deleteUserRestrictions(req, res);
      expect(res._getStatus()).toBe(403);
    });

    it("deletes all restrictions and recomputes exclusions", async () => {
      mockPrisma.userContentRestriction.deleteMany.mockResolvedValue({ count: 3 } as any);
      const req = mockReq({}, { userId: "2" }, ADMIN);
      const res = mockRes();
      await deleteUserRestrictions(req, res);
      expect(res._getBody().success).toBe(true);
      expect(mockExclusionService.recomputeForUser).toHaveBeenCalledWith(2);
    });
  });

  // ─── Hidden Entities ───

  describe("hideEntity", () => {
    it("returns 401 when user has no id", async () => {
      const req = mockReq({ entityType: "scene", entityId: "1" }, {}, {} as any);
      const res = mockRes();
      await hideEntity(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns 400 when entityType or entityId missing", async () => {
      const req = mockReq({}, {}, USER);
      const res = mockRes();
      await hideEntity(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns 400 for invalid entity type", async () => {
      const req = mockReq({ entityType: "user", entityId: "1" }, {}, USER);
      const res = mockRes();
      await hideEntity(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("hides entity successfully", async () => {
      const req = mockReq({ entityType: "scene", entityId: "42" }, {}, USER);
      const res = mockRes();
      await hideEntity(req, res);
      expect(res._getBody().success).toBe(true);
    });
  });

  describe("unhideEntity", () => {
    it("returns 401 when user has no id", async () => {
      const req = mockReq({}, { entityType: "scene", entityId: "1" }, {} as any);
      const res = mockRes();
      await unhideEntity(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns 400 for invalid entity type", async () => {
      const req = mockReq({}, { entityType: "invalid", entityId: "1" }, USER, {});
      const res = mockRes();
      await unhideEntity(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("unhides entity successfully", async () => {
      const req = mockReq({}, { entityType: "scene", entityId: "42" }, USER, {});
      const res = mockRes();
      await unhideEntity(req, res);
      expect(res._getBody().success).toBe(true);
    });
  });

  describe("unhideAllEntities", () => {
    it("returns 401 when user has no id", async () => {
      const req = mockReq({}, {}, {} as any, {});
      const res = mockRes();
      await unhideAllEntities(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns 400 for invalid entity type filter", async () => {
      const req = mockReq({}, {}, USER, { entityType: "invalid" });
      const res = mockRes();
      await unhideAllEntities(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("unhides all and returns count", async () => {
      const req = mockReq({}, {}, USER, {});
      const res = mockRes();
      await unhideAllEntities(req, res);
      expect(res._getBody().success).toBe(true);
      expect(res._getBody().count).toBe(5);
    });
  });

  describe("getHiddenEntities", () => {
    it("returns hidden entities list", async () => {
      const req = mockReq({}, {}, USER, {});
      const res = mockRes();
      await getHiddenEntities(req, res);
      expect(res._getBody().hiddenEntities).toEqual([]);
    });
  });

  describe("getHiddenEntityIds", () => {
    it("returns hidden IDs organized by type", async () => {
      const req = mockReq({}, {}, USER, {});
      const res = mockRes();
      await getHiddenEntityIds(req, res);
      const ids = res._getBody().hiddenIds;
      expect(ids.scenes).toEqual([]);
      expect(ids.performers).toEqual([]);
    });
  });

  describe("hideEntities (bulk)", () => {
    it("returns 400 when entities not an array", async () => {
      const req = mockReq({ entities: "bad" }, {}, USER);
      const res = mockRes();
      await hideEntities(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns 400 when entities is empty", async () => {
      const req = mockReq({ entities: [] }, {}, USER);
      const res = mockRes();
      await hideEntities(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns 400 for missing entityType/entityId", async () => {
      const req = mockReq({ entities: [{ entityType: "scene" }] }, {}, USER);
      const res = mockRes();
      await hideEntities(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns 400 for invalid entity type in bulk", async () => {
      const req = mockReq(
        { entities: [{ entityType: "invalid", entityId: "1" }] },
        {},
        USER
      );
      const res = mockRes();
      await hideEntities(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("hides multiple entities and reports counts", async () => {
      const req = mockReq(
        {
          entities: [
            { entityType: "scene", entityId: "1" },
            { entityType: "performer", entityId: "2" },
          ],
        },
        {},
        USER
      );
      const res = mockRes();
      await hideEntities(req, res);
      expect(res._getBody().success).toBe(true);
      expect(res._getBody().successCount).toBe(2);
      expect(res._getBody().failCount).toBe(0);
    });
  });

  describe("updateHideConfirmation", () => {
    it("returns 400 when value not boolean", async () => {
      const req = mockReq({ hideConfirmationDisabled: "yes" }, {}, USER);
      const res = mockRes();
      await updateHideConfirmation(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("updates preference successfully", async () => {
      mockPrisma.user.update.mockResolvedValue({} as any);
      const req = mockReq({ hideConfirmationDisabled: true }, {}, USER);
      const res = mockRes();
      await updateHideConfirmation(req, res);
      expect(res._getBody().success).toBe(true);
      expect(res._getBody().hideConfirmationDisabled).toBe(true);
    });
  });

  // ─── Permissions ───

  describe("getUserPermissions", () => {
    it("returns 401 when user missing", async () => {
      const req = { user: undefined } as any;
      const res = mockRes();
      await getUserPermissions(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns 404 when permissions null", async () => {
      mockResolvePermissions.mockResolvedValue(null as any);
      const req = mockReq({}, {}, USER);
      const res = mockRes();
      await getUserPermissions(req, res);
      expect(res._getStatus()).toBe(404);
    });

    it("returns resolved permissions", async () => {
      const perms = { canShare: true, canDownloadFiles: false };
      mockResolvePermissions.mockResolvedValue(perms as any);
      const req = mockReq({}, {}, USER);
      const res = mockRes();
      await getUserPermissions(req, res);
      expect(res._getBody().permissions).toEqual(perms);
    });
  });

  describe("getAnyUserPermissions", () => {
    it("returns 403 when non-admin", async () => {
      const req = mockReq({}, { userId: "3" }, USER);
      const res = mockRes();
      await getAnyUserPermissions(req, res);
      expect(res._getStatus()).toBe(403);
    });

    it("returns 400 for invalid user ID", async () => {
      const req = mockReq({}, { userId: "abc" }, ADMIN);
      const res = mockRes();
      await getAnyUserPermissions(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns permissions for specified user", async () => {
      const perms = { canShare: false };
      mockResolvePermissions.mockResolvedValue(perms as any);
      const req = mockReq({}, { userId: "3" }, ADMIN);
      const res = mockRes();
      await getAnyUserPermissions(req, res);
      expect(res._getBody().permissions).toEqual(perms);
    });
  });

  describe("updateUserPermissionOverrides", () => {
    it("returns 403 when non-admin", async () => {
      const req = mockReq({ canShareOverride: true }, { userId: "3" }, USER);
      const res = mockRes();
      await updateUserPermissionOverrides(req, res);
      expect(res._getStatus()).toBe(403);
    });

    it("returns 400 for invalid user ID", async () => {
      const req = mockReq({ canShareOverride: true }, { userId: "abc" }, ADMIN);
      const res = mockRes();
      await updateUserPermissionOverrides(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns 400 when no valid updates", async () => {
      const req = mockReq({}, { userId: "3" }, ADMIN);
      const res = mockRes();
      await updateUserPermissionOverrides(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody().error).toMatch(/No valid updates/);
    });

    it("returns 400 for invalid override value", async () => {
      const req = mockReq({ canShareOverride: "yes" }, { userId: "3" }, ADMIN);
      const res = mockRes();
      await updateUserPermissionOverrides(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("updates overrides and returns permissions", async () => {
      mockPrisma.user.update.mockResolvedValue({} as any);
      mockResolvePermissions.mockResolvedValue({ canShare: true } as any);
      const req = mockReq({ canShareOverride: true }, { userId: "3" }, ADMIN);
      const res = mockRes();
      await updateUserPermissionOverrides(req, res);
      expect(res._getBody().success).toBe(true);
      expect(res._getBody().permissions).toEqual({ canShare: true });
    });

    it("accepts null to clear overrides", async () => {
      mockPrisma.user.update.mockResolvedValue({} as any);
      mockResolvePermissions.mockResolvedValue({} as any);
      const req = mockReq({ canShareOverride: null }, { userId: "3" }, ADMIN);
      const res = mockRes();
      await updateUserPermissionOverrides(req, res);
      expect(res._getBody().success).toBe(true);
    });
  });

  describe("getUserGroupMemberships", () => {
    it("returns 403 when non-admin", async () => {
      const req = mockReq({}, { userId: "3" }, USER);
      const res = mockRes();
      await getUserGroupMemberships(req, res);
      expect(res._getStatus()).toBe(403);
    });

    it("returns mapped groups", async () => {
      mockPrisma.userGroupMembership.findMany.mockResolvedValue([
        { group: { id: 1, name: "Group A", description: null, canShare: true, canDownloadFiles: false, canDownloadPlaylists: false } },
      ] as any);
      const req = mockReq({}, { userId: "3" }, ADMIN);
      const res = mockRes();
      await getUserGroupMemberships(req, res);
      expect(res._getBody().groups).toHaveLength(1);
      expect(res._getBody().groups[0].name).toBe("Group A");
    });
  });

  // ─── Stash Instance Selection ───

  describe("getUserStashInstances", () => {
    it("returns 401 when user has no id", async () => {
      const req = mockReq({}, {}, {} as any);
      const res = mockRes();
      await getUserStashInstances(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns selected and available instances", async () => {
      mockPrisma.userStashInstance.findMany.mockResolvedValue([
        { instanceId: "inst-1" },
      ] as any);
      mockPrisma.stashInstance.findMany.mockResolvedValue([
        { id: "inst-1", name: "Stash 1", description: null },
        { id: "inst-2", name: "Stash 2", description: null },
      ] as any);
      const req = mockReq({}, {}, USER);
      const res = mockRes();
      await getUserStashInstances(req, res);
      const body = res._getBody();
      expect(body.selectedInstanceIds).toEqual(["inst-1"]);
      expect(body.availableInstances).toHaveLength(2);
    });
  });

  describe("updateUserStashInstances", () => {
    it("returns 400 when instanceIds not an array", async () => {
      const req = mockReq({ instanceIds: "inst-1" }, {}, USER);
      const res = mockRes();
      await updateUserStashInstances(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns 400 for invalid instance IDs", async () => {
      mockPrisma.stashInstance.findMany.mockResolvedValue([{ id: "inst-1" }] as any);
      const req = mockReq({ instanceIds: ["inst-1", "inst-99"] }, {}, USER);
      const res = mockRes();
      await updateUserStashInstances(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody().error).toBe("Invalid instance IDs");
      expect(res._getBody().details).toBe("inst-99");
    });

    it("clears selections when empty array", async () => {
      mockPrisma.userStashInstance.deleteMany.mockResolvedValue({ count: 1 } as any);
      const req = mockReq({ instanceIds: [] }, {}, USER);
      const res = mockRes();
      await updateUserStashInstances(req, res);
      expect(res._getBody().success).toBe(true);
      expect(res._getBody().selectedInstanceIds).toEqual([]);
      expect(mockPrisma.userStashInstance.createMany).not.toHaveBeenCalled();
    });

    it("replaces selections with valid IDs", async () => {
      mockPrisma.stashInstance.findMany.mockResolvedValue([{ id: "inst-2" }] as any);
      mockPrisma.userStashInstance.deleteMany.mockResolvedValue({ count: 0 } as any);
      mockPrisma.userStashInstance.createMany.mockResolvedValue({ count: 1 } as any);
      const req = mockReq({ instanceIds: ["inst-2"] }, {}, USER);
      const res = mockRes();
      await updateUserStashInstances(req, res);
      expect(res._getBody().success).toBe(true);
      expect(mockPrisma.userStashInstance.createMany).toHaveBeenCalledWith({
        data: [{ userId: 2, instanceId: "inst-2" }],
      });
    });
  });

  // ─── Setup ───

  describe("getSetupStatus", () => {
    it("returns 401 when user has no id", async () => {
      const req = mockReq({}, {}, {} as any);
      const res = mockRes();
      await getSetupStatus(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns 404 when user not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const req = mockReq({}, {}, USER);
      const res = mockRes();
      await getSetupStatus(req, res);
      expect(res._getStatus()).toBe(404);
    });

    it("returns setup status with instances", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        setupCompleted: false,
        recoveryKey: "KEY123",
      } as any);
      mockPrisma.stashInstance.findMany.mockResolvedValue([
        { id: "inst-1", name: "Stash 1", description: null },
      ] as any);
      const req = mockReq({}, {}, USER);
      const res = mockRes();
      await getSetupStatus(req, res);
      const body = res._getBody();
      expect(body.setupCompleted).toBe(false);
      expect(body.recoveryKey).toBe("KEY123");
      expect(body.instances).toHaveLength(1);
      expect(body.instanceCount).toBe(1);
    });
  });

  describe("completeSetup", () => {
    it("returns 401 when user has no id", async () => {
      const req = mockReq({}, {}, {} as any);
      const res = mockRes();
      await completeSetup(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("completes setup for single instance without selections", async () => {
      mockPrisma.stashInstance.count.mockResolvedValue(1);
      mockPrisma.user.update.mockResolvedValue({} as any);
      const req = mockReq({}, {}, USER);
      const res = mockRes();
      await completeSetup(req, res);
      expect(res._getBody().success).toBe(true);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ setupCompleted: true }),
        })
      );
    });

    it("returns 400 for multi-instance with no selections", async () => {
      mockPrisma.stashInstance.count.mockResolvedValue(3);
      const req = mockReq({}, {}, USER);
      const res = mockRes();
      await completeSetup(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody().error).toMatch(/At least one/);
    });

    it("completes setup for multi-instance with valid selections", async () => {
      mockPrisma.stashInstance.count.mockResolvedValue(3);
      mockPrisma.stashInstance.findMany.mockResolvedValue([{ id: "inst-1" }] as any);
      mockPrisma.userStashInstance.deleteMany.mockResolvedValue({ count: 0 } as any);
      mockPrisma.userStashInstance.createMany.mockResolvedValue({ count: 1 } as any);
      mockPrisma.user.update.mockResolvedValue({} as any);
      const req = mockReq({ selectedInstanceIds: ["inst-1"] }, {}, USER);
      const res = mockRes();
      await completeSetup(req, res);
      expect(res._getBody().success).toBe(true);
    });
  });

  // ─── syncFromStash (auth/validation only, not the complex pagination logic) ───

  describe("syncFromStash", () => {
    it("returns 403 when non-admin", async () => {
      const req = mockReq({}, { userId: "2" }, USER);
      const res = mockRes();
      await syncFromStash(req, res);
      expect(res._getStatus()).toBe(403);
    });

    it("returns 400 for invalid user ID", async () => {
      const req = mockReq({}, { userId: "abc" }, ADMIN);
      const res = mockRes();
      await syncFromStash(req, res);
      expect(res._getStatus()).toBe(400);
    });
  });
});
