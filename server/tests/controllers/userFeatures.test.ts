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
import type { UserContentRestriction } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  completeSetup,
  deleteFilterPreset,
  deleteUserRestrictions,
  getAnyUserPermissions,
  getDefaultFilterPresets,
  getFilterPresets,
  getHiddenEntities,
  getHiddenEntityIds,
  getSetupStatus,
  getUserGroupMemberships,
  getUserPermissions,
  getUserRestrictions,
  getUserStashInstances,
  hideEntities,
  hideEntity,
  saveFilterPreset,
  setDefaultFilterPreset,
  syncFromStash,
  unhideAllEntities,
  unhideEntity,
  updateHideConfirmation,
  updateUserPermissionOverrides,
  updateUserRestrictions,
  updateUserStashInstances,
} from "../../controllers/user.js";
import prisma from "../../prisma/singleton.js";
import type * as entityAccessModule from "../../services/EntityAccessService.js";
import {
  getIdsVisibleOnAnyInstance,
  getVisibleEntityKeys,
} from "../../services/EntityAccessService.js";
import { exclusionComputationService } from "../../services/ExclusionComputationService.js";
import { resolveUserPermissions } from "../../services/PermissionService.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import { userHiddenEntityService } from "../../services/UserHiddenEntityService.js";
import {
  formatRecoveryKey,
  generateRecoveryKey,
  hashRecoveryKey,
} from "../../utils/recoveryKey.js";
import { malformed, reqFor, resFor } from "../helpers/controllerTestUtils.js";
import {
  type MembershipWithGroup,
  userPermissions,
  userRow,
} from "../helpers/fixtures.js";
import { objectContaining } from "../helpers/matchers.js";
import { must } from "../helpers/must.js";
import { partialRow } from "../helpers/prismaMock.js";

// Mock prisma
vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

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
  hashRecoveryKey: vi.fn(),
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

// Mock EntityAccessService (hiding requires visibility); entityRefKey stays real
vi.mock("../../services/EntityAccessService.js", async () => {
  const actual = await vi.importActual<typeof entityAccessModule>(
    "../../services/EntityAccessService.js"
  );
  return {
    entityRefKey: actual.entityRefKey,
    getVisibleEntityKeys: vi.fn(),
    getIdsVisibleOnAnyInstance: vi.fn(),
  };
});

// Mock UserHiddenEntityService (dynamically imported)
vi.mock("../../services/UserHiddenEntityService.js", () => ({
  userHiddenEntityService: {
    findAlreadyHidden: vi.fn(),
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

const mockPrisma = vi.mocked(prisma, true);
const mockVisibleKeys = vi.mocked(getVisibleEntityKeys);
const mockVisibleIds = vi.mocked(getIdsVisibleOnAnyInstance);
const mockAlreadyHidden = vi.mocked(userHiddenEntityService.findAlreadyHidden);

/** Only these ids are visible, on any instance and on a named one. */
function visibleIds(...ids: string[]) {
  mockVisibleIds.mockImplementation((_userId, _type, requested) =>
    Promise.resolve(new Set(requested.filter((id) => ids.includes(id))))
  );
  mockVisibleKeys.mockImplementation((_userId, _type, refs) =>
    Promise.resolve(
      new Set(
        refs
          .filter((r) => ids.includes(r.id))
          .map((r) => `${r.id}\0${r.instanceId}`)
      )
    )
  );
}
const mockResolvePermissions = vi.mocked(resolveUserPermissions);
const mockExclusionService = vi.mocked(exclusionComputationService);

const ADMIN = { id: 1, username: "admin", role: "ADMIN" };
const USER = { id: 2, username: "testuser", role: "USER" };

describe("User Controller — Features", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Every entity is visible and not yet hidden unless a test says otherwise
    mockAlreadyHidden.mockImplementation((_userId, targets) =>
      Promise.resolve(targets.map(() => false))
    );
    mockVisibleIds.mockImplementation((_userId, _type, ids) =>
      Promise.resolve(new Set(ids))
    );
    mockVisibleKeys.mockImplementation((_userId, _type, refs) =>
      Promise.resolve(new Set(refs.map((r) => `${r.id}\0${r.instanceId}`)))
    );
  });

  // ─── Filter Presets ───

  describe("getFilterPresets", () => {
    it("returns 401 when user has no id", async () => {
      const req = reqFor(getFilterPresets, { user: malformed({}) });
      const res = resFor(getFilterPresets);
      await getFilterPresets(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns 404 when user not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const req = reqFor(getFilterPresets, { user: USER });
      const res = resFor(getFilterPresets);
      await getFilterPresets(req, res);
      expect(res._getStatus()).toBe(404);
    });

    it("returns empty preset structure when none exist", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          filterPresets: null,
        })
      );
      const req = reqFor(getFilterPresets, { user: USER });
      const res = resFor(getFilterPresets);
      await getFilterPresets(req, res);
      const body = res._getOkBody();
      expect(body.presets).toEqual({
        scene: [],
        performer: [],
        studio: [],
        tag: [],
      });
    });

    it("returns existing presets", async () => {
      const presets = { scene: [{ id: "1", name: "Test" }] };
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          filterPresets: presets,
        })
      );
      const req = reqFor(getFilterPresets, { user: USER });
      const res = resFor(getFilterPresets);
      await getFilterPresets(req, res);
      expect(res._getOkBody().presets).toEqual(presets);
    });
  });

  describe("saveFilterPreset", () => {
    it("returns 401 when user has no id", async () => {
      const req = reqFor(saveFilterPreset, { user: malformed({}) });
      const res = resFor(saveFilterPreset);
      await saveFilterPreset(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns 400 when required fields missing", async () => {
      const req = reqFor(saveFilterPreset, {
        body: malformed({ artifactType: "scene" }),
        user: USER,
      });
      const res = resFor(saveFilterPreset);
      await saveFilterPreset(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toMatch(/Missing required/);
    });

    it("returns 400 for invalid artifact type", async () => {
      const req = reqFor(saveFilterPreset, {
        body: {
          artifactType: "invalid",
          name: "Test",
          filters: {},
          sort: "title",
          direction: "ASC",
        },
        user: USER,
      });
      const res = resFor(saveFilterPreset);
      await saveFilterPreset(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toMatch(/Invalid artifact type/);
    });

    it("returns 400 for invalid context", async () => {
      const req = reqFor(saveFilterPreset, {
        body: {
          artifactType: "scene",
          context: "invalid_context",
          name: "Test",
          filters: {},
          sort: "title",
          direction: "ASC",
        },
        user: USER,
      });
      const res = resFor(saveFilterPreset);
      await saveFilterPreset(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toMatch(/Invalid context/);
    });

    it("saves preset with defaults for optional fields", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          filterPresets: {},
          defaultFilterPresets: {},
        })
      );
      mockPrisma.user.update.mockResolvedValue(userRow());

      const req = reqFor(saveFilterPreset, {
        body: {
          artifactType: "scene",
          name: "My Filter",
          filters: { rating: 80 },
          sort: "rating",
          direction: "DESC",
        },
        user: USER,
      });
      const res = resFor(saveFilterPreset);
      await saveFilterPreset(req, res);
      const body = res._getOkBody();
      expect(body.success).toBe(true);
      expect(body.preset.name).toBe("My Filter");
      expect(body.preset.viewMode).toBe("grid");
      expect(body.preset.zoomLevel).toBe("medium");
      expect(body.preset.gridDensity).toBe("comfortable");
      expect(body.preset.id).toBeDefined();
      expect(body.preset.createdAt).toBeDefined();
    });

    it("sets preset as default when setAsDefault is true", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          filterPresets: {},
          defaultFilterPresets: {},
        })
      );
      mockPrisma.user.update.mockResolvedValue(userRow());

      const req = reqFor(saveFilterPreset, {
        body: {
          artifactType: "scene",
          context: "scene_performer",
          name: "Fav Filter",
          filters: {},
          sort: "name",
          direction: "ASC",
          setAsDefault: true,
        },
        user: USER,
      });
      const res = resFor(saveFilterPreset);
      await saveFilterPreset(req, res);

      // Check that defaultFilterPresets was updated in the prisma call
      const updateCall = mockPrisma.user.update.mock.calls[0]?.[0];
      const defaults = updateCall?.data.defaultFilterPresets as Record<
        string,
        unknown
      >;
      expect(defaults.scene_performer).toBeDefined();
    });
  });

  describe("deleteFilterPreset", () => {
    it("returns 400 for invalid artifact type", async () => {
      const req = reqFor(deleteFilterPreset, {
        params: { artifactType: "invalid", presetId: "1" },
        user: USER,
      });
      const res = resFor(deleteFilterPreset);
      await deleteFilterPreset(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns 404 when user not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const req = reqFor(deleteFilterPreset, {
        params: { artifactType: "scene", presetId: "1" },
        user: USER,
      });
      const res = resFor(deleteFilterPreset);
      await deleteFilterPreset(req, res);
      expect(res._getStatus()).toBe(404);
    });

    it("deletes preset and clears default if it was default", async () => {
      const presetId = "preset-to-delete";
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          filterPresets: { scene: [{ id: presetId, name: "Test" }] },
          defaultFilterPresets: { scene: presetId },
        })
      );
      mockPrisma.user.update.mockResolvedValue(userRow());

      const req = reqFor(deleteFilterPreset, {
        params: { artifactType: "scene", presetId },
        user: USER,
      });
      const res = resFor(deleteFilterPreset);
      await deleteFilterPreset(req, res);
      expect(res._getOkBody().success).toBe(true);

      const updateCall = mockPrisma.user.update.mock.calls[0]?.[0];
      const presets = updateCall?.data.filterPresets as Record<
        string,
        unknown[]
      >;
      const defaults = updateCall?.data.defaultFilterPresets as Record<
        string,
        unknown
      >;
      expect(presets.scene).toEqual([]);
      expect(defaults.scene).toBeUndefined();
    });
  });

  describe("getDefaultFilterPresets", () => {
    it("returns 401 when user has no id", async () => {
      const req = reqFor(getDefaultFilterPresets, { user: malformed({}) });
      const res = resFor(getDefaultFilterPresets);
      await getDefaultFilterPresets(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns empty object when no defaults set", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          defaultFilterPresets: null,
        })
      );
      const req = reqFor(getDefaultFilterPresets, { user: USER });
      const res = resFor(getDefaultFilterPresets);
      await getDefaultFilterPresets(req, res);
      expect(res._getOkBody().defaults).toEqual({});
    });
  });

  describe("setDefaultFilterPreset", () => {
    it("returns 400 when context missing", async () => {
      const req = reqFor(setDefaultFilterPreset, { user: USER });
      const res = resFor(setDefaultFilterPreset);
      await setDefaultFilterPreset(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toMatch(/Missing context/);
    });

    it("returns 400 for invalid context", async () => {
      const req = reqFor(setDefaultFilterPreset, {
        body: { context: "bogus" },
        user: USER,
      });
      const res = resFor(setDefaultFilterPreset);
      await setDefaultFilterPreset(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns 400 when preset not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          defaultFilterPresets: {},
          filterPresets: { scene: [] },
        })
      );
      const req = reqFor(setDefaultFilterPreset, {
        body: { context: "scene", presetId: "nonexistent" },
        user: USER,
      });
      const res = resFor(setDefaultFilterPreset);
      await setDefaultFilterPreset(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toMatch(/Preset not found/);
    });

    it("clears default when presetId is null", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          defaultFilterPresets: { scene: "some-id" },
          filterPresets: {},
        })
      );
      mockPrisma.user.update.mockResolvedValue(userRow());
      const req = reqFor(setDefaultFilterPreset, {
        body: { context: "scene" },
        user: USER,
      });
      const res = resFor(setDefaultFilterPreset);
      await setDefaultFilterPreset(req, res);
      expect(res._getOkBody().success).toBe(true);
    });

    it("validates scene grid contexts against scene presets", async () => {
      const presetId = "existing-preset";
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          defaultFilterPresets: {},
          filterPresets: { scene: [{ id: presetId, name: "Test" }] },
        })
      );
      mockPrisma.user.update.mockResolvedValue(userRow());
      const req = reqFor(setDefaultFilterPreset, {
        body: { context: "scene_performer", presetId },
        user: USER,
      });
      const res = resFor(setDefaultFilterPreset);
      await setDefaultFilterPreset(req, res);
      expect(res._getOkBody().success).toBe(true);
    });
  });

  // ─── Content Restrictions ───

  describe("getUserRestrictions", () => {
    it("returns 401 when user missing", async () => {
      const req = reqFor(getUserRestrictions, { params: { userId: "2" } });
      const res = resFor(getUserRestrictions);
      await getUserRestrictions(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns 403 when non-admin", async () => {
      const req = reqFor(getUserRestrictions, {
        params: { userId: "2" },
        user: USER,
      });
      const res = resFor(getUserRestrictions);
      await getUserRestrictions(req, res);
      expect(res._getStatus()).toBe(403);
    });

    it("returns restrictions for user", async () => {
      const restrictions: UserContentRestriction[] = [
        partialRow({
          id: 1,
          entityType: "tags",
          mode: "EXCLUDE",
          entityIds: "[]",
        }),
      ];
      mockPrisma.userContentRestriction.findMany.mockResolvedValue(
        restrictions
      );
      const req = reqFor(getUserRestrictions, {
        params: { userId: "2" },
        user: ADMIN,
      });
      const res = resFor(getUserRestrictions);
      await getUserRestrictions(req, res);
      expect(res._getOkBody().restrictions).toEqual(restrictions);
    });
  });

  describe("updateUserRestrictions", () => {
    it("returns 403 when non-admin", async () => {
      const req = reqFor(updateUserRestrictions, {
        body: { restrictions: [] },
        params: { userId: "2" },
        user: USER,
      });
      const res = resFor(updateUserRestrictions);
      await updateUserRestrictions(req, res);
      expect(res._getStatus()).toBe(403);
    });

    it("returns 400 when restrictions not an array", async () => {
      const req = reqFor(updateUserRestrictions, {
        body: malformed({ restrictions: "bad" }),
        params: { userId: "2" },
        user: ADMIN,
      });
      const res = resFor(updateUserRestrictions);
      await updateUserRestrictions(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns 400 for invalid entity type", async () => {
      const req = reqFor(updateUserRestrictions, {
        body: {
          restrictions: [
            { entityType: "users", mode: "EXCLUDE", entityIds: [] },
          ],
        },
        params: { userId: "2" },
        user: ADMIN,
      });
      const res = resFor(updateUserRestrictions);
      await updateUserRestrictions(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns 400 for invalid mode", async () => {
      const req = reqFor(updateUserRestrictions, {
        body: {
          restrictions: [{ entityType: "tags", mode: "BLOCK", entityIds: [] }],
        },
        params: { userId: "2" },
        user: ADMIN,
      });
      const res = resFor(updateUserRestrictions);
      await updateUserRestrictions(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns 400 when entityIds not an array", async () => {
      const req = reqFor(updateUserRestrictions, {
        body: {
          restrictions: [
            { entityType: "tags", mode: "EXCLUDE", entityIds: "1,2" },
          ],
        },
        params: { userId: "2" },
        user: ADMIN,
      });
      const res = resFor(updateUserRestrictions);
      await updateUserRestrictions(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("replaces all restrictions and recomputes exclusions", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          id: 2,
          role: "USER",
        })
      );
      mockPrisma.userContentRestriction.deleteMany.mockResolvedValue({
        count: 1,
      });
      mockPrisma.userContentRestriction.createMany.mockResolvedValue({
        count: 1,
      });
      mockPrisma.userContentRestriction.findMany.mockResolvedValue([
        partialRow({ id: 1, entityType: "tags", mode: "EXCLUDE" }),
      ]);
      const req = reqFor(updateUserRestrictions, {
        body: {
          restrictions: [
            { entityType: "tags", mode: "EXCLUDE", entityIds: ["1", "2"] },
          ],
        },
        params: { userId: "2" },
        user: ADMIN,
      });
      const res = resFor(updateUserRestrictions);
      await updateUserRestrictions(req, res);
      expect(res._getOkBody().success).toBe(true);
      expect(mockPrisma.userContentRestriction.deleteMany).toHaveBeenCalledWith(
        {
          where: { userId: 2 },
        }
      );
      expect(
        mockPrisma.userContentRestriction.createMany
      ).toHaveBeenCalledTimes(1);
      expect(mockExclusionService.recomputeForUser).toHaveBeenCalledWith(2);
      expect(res._getOkBody().restrictions).toHaveLength(1);
    });
  });

  describe("deleteUserRestrictions", () => {
    it("returns 403 when non-admin", async () => {
      const req = reqFor(deleteUserRestrictions, {
        params: { userId: "2" },
        user: USER,
      });
      const res = resFor(deleteUserRestrictions);
      await deleteUserRestrictions(req, res);
      expect(res._getStatus()).toBe(403);
    });

    it("deletes all restrictions and recomputes exclusions", async () => {
      mockPrisma.userContentRestriction.deleteMany.mockResolvedValue({
        count: 3,
      });
      const req = reqFor(deleteUserRestrictions, {
        params: { userId: "2" },
        user: ADMIN,
      });
      const res = resFor(deleteUserRestrictions);
      await deleteUserRestrictions(req, res);
      expect(res._getOkBody().success).toBe(true);
      expect(mockExclusionService.recomputeForUser).toHaveBeenCalledWith(2);
    });
  });

  // ─── Hidden Entities ───

  describe("hideEntity", () => {
    it("returns 401 when user has no id", async () => {
      const req = reqFor(hideEntity, {
        body: { entityType: "scene", entityId: "1" },
        user: malformed({}),
      });
      const res = resFor(hideEntity);
      await hideEntity(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns 400 when entityType or entityId missing", async () => {
      const req = reqFor(hideEntity, { user: USER });
      const res = resFor(hideEntity);
      await hideEntity(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns 400 for invalid entity type", async () => {
      const req = reqFor(hideEntity, {
        body: { entityType: "user", entityId: "1" },
        user: USER,
      });
      const res = resFor(hideEntity);
      await hideEntity(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("hides entity successfully", async () => {
      const req = reqFor(hideEntity, {
        body: { entityType: "scene", entityId: "42" },
        user: USER,
      });
      const res = resFor(hideEntity);
      await hideEntity(req, res);
      expect(res._getOkBody().success).toBe(true);
      // No instance: visible on some instance, stored for every instance
      expect(mockVisibleIds).toHaveBeenCalledWith(USER.id, "scene", ["42"]);
      expect(userHiddenEntityService.hideEntity).toHaveBeenCalledWith(
        USER.id,
        "scene",
        "42",
        ""
      );
    });

    it("returns 404 and writes nothing for an entity the user cannot see", async () => {
      visibleIds();
      const req = reqFor(hideEntity, {
        body: { entityType: "tag", entityId: "7" },
        user: USER,
      });
      const res = resFor(hideEntity);
      await hideEntity(req, res);
      expect(res._getStatus()).toBe(404);
      expect(res._getBody()).toEqual({ error: "Not found" });
      expect(userHiddenEntityService.hideEntity).not.toHaveBeenCalled();
    });

    it("checks the given instance when the request names one", async () => {
      visibleIds();
      const req = reqFor(hideEntity, {
        body: { entityType: "scene", entityId: "42", instanceId: "inst-1" },
        user: USER,
      });
      const res = resFor(hideEntity);
      await hideEntity(req, res);
      expect(mockVisibleKeys).toHaveBeenCalledWith(USER.id, "scene", [
        { id: "42", instanceId: "inst-1" },
      ]);
      expect(mockVisibleIds).not.toHaveBeenCalled();
      expect(res._getStatus()).toBe(404);
      expect(userHiddenEntityService.hideEntity).not.toHaveBeenCalled();
    });

    it("a repeat hide succeeds without writing", async () => {
      mockAlreadyHidden.mockResolvedValueOnce([true]);
      // Hidden entities are excluded for their owner, so access says no
      visibleIds();
      const req = reqFor(hideEntity, {
        body: { entityType: "scene", entityId: "42" },
        user: USER,
      });
      const res = resFor(hideEntity);
      await hideEntity(req, res);
      expect(res._getStatus()).toBe(200);
      expect(res._getOkBody().success).toBe(true);
      expect(mockAlreadyHidden).toHaveBeenCalledWith(USER.id, [
        { entityType: "scene", entityId: "42", instanceId: "" },
      ]);
      expect(userHiddenEntityService.hideEntity).not.toHaveBeenCalled();
    });

    it("returns 400 when entityId is not a numeric Stash id", async () => {
      const req = reqFor(hideEntity, {
        body: { entityType: "tag", entityId: "x') OR 1=1 --" },
        user: USER,
      });
      const res = resFor(hideEntity);
      await hideEntity(req, res);
      expect(res._getStatus()).toBe(400);
      expect(userHiddenEntityService.hideEntity).not.toHaveBeenCalled();
    });

    it("returns 400 when entityId is not a string", async () => {
      const req = reqFor(hideEntity, {
        body: malformed({ entityType: "scene", entityId: 42 }),
        user: USER,
      });
      const res = resFor(hideEntity);
      await hideEntity(req, res);
      expect(res._getStatus()).toBe(400);
    });
  });

  describe("unhideEntity", () => {
    it("returns 401 when user has no id", async () => {
      const req = reqFor(unhideEntity, {
        params: { entityType: "scene", entityId: "1" },
        user: malformed({}),
      });
      const res = resFor(unhideEntity);
      await unhideEntity(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns 400 for invalid entity type", async () => {
      const req = reqFor(unhideEntity, {
        params: { entityType: "invalid", entityId: "1" },
        user: USER,
      });
      const res = resFor(unhideEntity);
      await unhideEntity(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("unhides entity successfully", async () => {
      const req = reqFor(unhideEntity, {
        params: { entityType: "scene", entityId: "42" },
        user: USER,
      });
      const res = resFor(unhideEntity);
      await unhideEntity(req, res);
      expect(res._getOkBody().success).toBe(true);
    });
  });

  describe("unhideAllEntities", () => {
    it("returns 401 when user has no id", async () => {
      const req = reqFor(unhideAllEntities, { user: malformed({}) });
      const res = resFor(unhideAllEntities);
      await unhideAllEntities(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns 400 for invalid entity type filter", async () => {
      const req = reqFor(unhideAllEntities, {
        user: USER,
        query: { entityType: "invalid" },
      });
      const res = resFor(unhideAllEntities);
      await unhideAllEntities(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("unhides all and returns count", async () => {
      const req = reqFor(unhideAllEntities, { user: USER });
      const res = resFor(unhideAllEntities);
      await unhideAllEntities(req, res);
      expect(res._getOkBody().success).toBe(true);
      expect(res._getOkBody().count).toBe(5);
    });
  });

  describe("getHiddenEntities", () => {
    it("returns hidden entities list", async () => {
      const req = reqFor(getHiddenEntities, { user: USER });
      const res = resFor(getHiddenEntities);
      await getHiddenEntities(req, res);
      expect(res._getOkBody().hiddenEntities).toEqual([]);
    });
  });

  describe("getHiddenEntityIds", () => {
    it("returns hidden IDs organized by type", async () => {
      const req = reqFor(getHiddenEntityIds, { user: USER });
      const res = resFor(getHiddenEntityIds);
      await getHiddenEntityIds(req, res);
      const ids = res._getOkBody().hiddenIds;
      expect(ids.scenes).toEqual([]);
      expect(ids.performers).toEqual([]);
    });
  });

  describe("hideEntities (bulk)", () => {
    it("returns 400 when entities not an array", async () => {
      const req = reqFor(hideEntities, {
        body: malformed({ entities: "bad" }),
        user: USER,
      });
      const res = resFor(hideEntities);
      await hideEntities(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns 400 when entities is empty", async () => {
      const req = reqFor(hideEntities, { body: { entities: [] }, user: USER });
      const res = resFor(hideEntities);
      await hideEntities(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns 400 for missing entityType/entityId", async () => {
      const req = reqFor(hideEntities, {
        body: malformed({ entities: [{ entityType: "scene" }] }),
        user: USER,
      });
      const res = resFor(hideEntities);
      await hideEntities(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns 400 for invalid entity type in bulk", async () => {
      const req = reqFor(hideEntities, {
        body: { entities: [{ entityType: "invalid", entityId: "1" }] },
        user: USER,
      });
      const res = resFor(hideEntities);
      await hideEntities(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("hides multiple entities and reports counts", async () => {
      const req = reqFor(hideEntities, {
        body: {
          entities: [
            { entityType: "scene", entityId: "1" },
            { entityType: "performer", entityId: "2" },
          ],
        },
        user: USER,
      });
      const res = resFor(hideEntities);
      await hideEntities(req, res);
      expect(res._getOkBody().success).toBe(true);
      expect(res._getOkBody().successCount).toBe(2);
      expect(res._getOkBody().failCount).toBe(0);
      expect(userHiddenEntityService.hideEntity).toHaveBeenCalledTimes(2);
    });

    it("returns 404 naming the first target not visible, and hides nothing", async () => {
      visibleIds("1", "3");
      const req = reqFor(hideEntities, {
        body: {
          entities: [
            { entityType: "scene", entityId: "1" },
            { entityType: "tag", entityId: "2" },
            { entityType: "performer", entityId: "3" },
          ],
        },
        user: USER,
      });
      const res = resFor(hideEntities);
      await hideEntities(req, res);
      expect(res._getStatus()).toBe(404);
      expect(res._getBody()).toEqual({ error: "entities[1]: Not found" });
      expect(userHiddenEntityService.hideEntity).not.toHaveBeenCalled();
    });

    it("counts a target already hidden as hidden without writing it again", async () => {
      mockAlreadyHidden.mockResolvedValueOnce([true, false]);
      visibleIds("2");
      const req = reqFor(hideEntities, {
        body: {
          entities: [
            { entityType: "scene", entityId: "1" },
            { entityType: "scene", entityId: "2" },
          ],
        },
        user: USER,
      });
      const res = resFor(hideEntities);
      await hideEntities(req, res);
      expect(res._getOkBody().successCount).toBe(2);
      expect(res._getOkBody().failCount).toBe(0);
      expect(userHiddenEntityService.hideEntity).toHaveBeenCalledTimes(1);
      expect(userHiddenEntityService.hideEntity).toHaveBeenCalledWith(
        USER.id,
        "scene",
        "2",
        ""
      );
    });

    it("checks a 200-target bulk hide in a bounded number of queries", async () => {
      const entities = Array.from({ length: 200 }, (_, i) =>
        i % 2 === 0
          ? { entityType: "scene", entityId: String(i), instanceId: "inst-1" }
          : { entityType: "performer", entityId: String(i) }
      );
      const req = reqFor(hideEntities, { body: { entities }, user: USER });
      const res = resFor(hideEntities);
      await hideEntities(req, res);

      expect(res._getOkBody().successCount).toBe(200);
      // One read of the user's hides, one visibility query per type and form
      expect(mockAlreadyHidden).toHaveBeenCalledTimes(1);
      expect(mockVisibleKeys).toHaveBeenCalledTimes(1);
      expect(must(mockVisibleKeys.mock.calls[0])[2]).toHaveLength(100);
      expect(mockVisibleIds).toHaveBeenCalledTimes(1);
      expect(must(mockVisibleIds.mock.calls[0])[2]).toHaveLength(100);
      expect(userHiddenEntityService.hideEntity).toHaveBeenCalledTimes(200);
    });

    it("returns 400 and hides nothing when any entityId is not a numeric Stash id", async () => {
      const req = reqFor(hideEntities, {
        body: {
          entities: [
            { entityType: "scene", entityId: "1" },
            { entityType: "tag", entityId: "1' OR '1'='1" },
          ],
        },
        user: USER,
      });
      const res = resFor(hideEntities);
      await hideEntities(req, res);
      expect(res._getStatus()).toBe(400);
      expect(userHiddenEntityService.hideEntity).not.toHaveBeenCalled();
    });

    it("returns 400 for an unknown instanceId in bulk", async () => {
      vi.mocked(stashInstanceManager.getConfig).mockReturnValueOnce(undefined);
      const req = reqFor(hideEntities, {
        body: {
          entities: [
            { entityType: "scene", entityId: "1", instanceId: "nope" },
          ],
        },
        user: USER,
      });
      const res = resFor(hideEntities);
      await hideEntities(req, res);
      expect(res._getStatus()).toBe(400);
    });
  });

  describe("updateHideConfirmation", () => {
    it("returns 400 when value not boolean", async () => {
      const req = reqFor(updateHideConfirmation, {
        body: malformed({ hideConfirmationDisabled: "yes" }),
        user: USER,
      });
      const res = resFor(updateHideConfirmation);
      await updateHideConfirmation(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("updates preference successfully", async () => {
      mockPrisma.user.update.mockResolvedValue(userRow());
      const req = reqFor(updateHideConfirmation, {
        body: { hideConfirmationDisabled: true },
        user: USER,
      });
      const res = resFor(updateHideConfirmation);
      await updateHideConfirmation(req, res);
      expect(res._getOkBody().success).toBe(true);
      expect(res._getOkBody().hideConfirmationDisabled).toBe(true);
    });
  });

  // ─── Permissions ───

  describe("getUserPermissions", () => {
    it("returns 401 when user missing", async () => {
      const req = reqFor(getUserPermissions);
      const res = resFor(getUserPermissions);
      await getUserPermissions(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns 404 when permissions null", async () => {
      mockResolvePermissions.mockResolvedValue(null);
      const req = reqFor(getUserPermissions, { user: USER });
      const res = resFor(getUserPermissions);
      await getUserPermissions(req, res);
      expect(res._getStatus()).toBe(404);
    });

    it("returns resolved permissions", async () => {
      const perms = userPermissions({
        canShare: true,
        canDownloadFiles: false,
      });
      mockResolvePermissions.mockResolvedValue(perms);
      const req = reqFor(getUserPermissions, { user: USER });
      const res = resFor(getUserPermissions);
      await getUserPermissions(req, res);
      expect(res._getOkBody().permissions).toEqual(perms);
    });
  });

  describe("getAnyUserPermissions", () => {
    it("returns 403 when non-admin", async () => {
      const req = reqFor(getAnyUserPermissions, {
        params: { userId: "3" },
        user: USER,
      });
      const res = resFor(getAnyUserPermissions);
      await getAnyUserPermissions(req, res);
      expect(res._getStatus()).toBe(403);
    });

    it("returns 400 for invalid user ID", async () => {
      const req = reqFor(getAnyUserPermissions, {
        params: { userId: "abc" },
        user: ADMIN,
      });
      const res = resFor(getAnyUserPermissions);
      await getAnyUserPermissions(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns permissions for specified user", async () => {
      const perms = userPermissions({ canShare: false });
      mockResolvePermissions.mockResolvedValue(perms);
      const req = reqFor(getAnyUserPermissions, {
        params: { userId: "3" },
        user: ADMIN,
      });
      const res = resFor(getAnyUserPermissions);
      await getAnyUserPermissions(req, res);
      expect(res._getOkBody().permissions).toEqual(perms);
    });
  });

  describe("updateUserPermissionOverrides", () => {
    it("returns 403 when non-admin", async () => {
      const req = reqFor(updateUserPermissionOverrides, {
        body: { canShareOverride: true },
        params: { userId: "3" },
        user: USER,
      });
      const res = resFor(updateUserPermissionOverrides);
      await updateUserPermissionOverrides(req, res);
      expect(res._getStatus()).toBe(403);
    });

    it("returns 400 for invalid user ID", async () => {
      const req = reqFor(updateUserPermissionOverrides, {
        body: { canShareOverride: true },
        params: { userId: "abc" },
        user: ADMIN,
      });
      const res = resFor(updateUserPermissionOverrides);
      await updateUserPermissionOverrides(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns 400 when no valid updates", async () => {
      const req = reqFor(updateUserPermissionOverrides, {
        params: { userId: "3" },
        user: ADMIN,
      });
      const res = resFor(updateUserPermissionOverrides);
      await updateUserPermissionOverrides(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toMatch(/No valid updates/);
    });

    it("returns 400 for invalid override value", async () => {
      const req = reqFor(updateUserPermissionOverrides, {
        body: malformed({ canShareOverride: "yes" }),
        params: { userId: "3" },
        user: ADMIN,
      });
      const res = resFor(updateUserPermissionOverrides);
      await updateUserPermissionOverrides(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("updates overrides and returns permissions", async () => {
      mockPrisma.user.update.mockResolvedValue(userRow());
      const perms = userPermissions({ canShare: true });
      mockResolvePermissions.mockResolvedValue(perms);
      const req = reqFor(updateUserPermissionOverrides, {
        body: { canShareOverride: true },
        params: { userId: "3" },
        user: ADMIN,
      });
      const res = resFor(updateUserPermissionOverrides);
      await updateUserPermissionOverrides(req, res);
      expect(res._getOkBody().success).toBe(true);
      expect(res._getOkBody().permissions).toEqual(perms);
    });

    it("accepts null to clear overrides", async () => {
      mockPrisma.user.update.mockResolvedValue(userRow());
      mockResolvePermissions.mockResolvedValue(userPermissions());
      const req = reqFor(updateUserPermissionOverrides, {
        body: { canShareOverride: null },
        params: { userId: "3" },
        user: ADMIN,
      });
      const res = resFor(updateUserPermissionOverrides);
      await updateUserPermissionOverrides(req, res);
      expect(res._getOkBody().success).toBe(true);
    });
  });

  describe("getUserGroupMemberships", () => {
    it("returns 403 when non-admin", async () => {
      const req = reqFor(getUserGroupMemberships, {
        params: { userId: "3" },
        user: USER,
      });
      const res = resFor(getUserGroupMemberships);
      await getUserGroupMemberships(req, res);
      expect(res._getStatus()).toBe(403);
    });

    it("returns mapped groups", async () => {
      mockPrisma.userGroupMembership.findMany.mockResolvedValue([
        partialRow<MembershipWithGroup>({
          group: partialRow({
            id: 1,
            name: "Group A",
            description: null,
            canShare: true,
            canDownloadFiles: false,
            canDownloadPlaylists: false,
          }),
        }),
      ]);
      const req = reqFor(getUserGroupMemberships, {
        params: { userId: "3" },
        user: ADMIN,
      });
      const res = resFor(getUserGroupMemberships);
      await getUserGroupMemberships(req, res);
      expect(res._getOkBody().groups).toHaveLength(1);
      expect(res._getOkBody().groups[0]).toHaveProperty("name", "Group A");
    });
  });

  // ─── Stash Instance Selection ───

  describe("getUserStashInstances", () => {
    it("returns 401 when user has no id", async () => {
      const req = reqFor(getUserStashInstances, { user: malformed({}) });
      const res = resFor(getUserStashInstances);
      await getUserStashInstances(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns selected and available instances", async () => {
      mockPrisma.userStashInstance.findMany.mockResolvedValue([
        partialRow({ instanceId: "inst-1" }),
      ]);
      mockPrisma.stashInstance.findMany.mockResolvedValue([
        partialRow({ id: "inst-1", name: "Stash 1", description: null }),
        partialRow({ id: "inst-2", name: "Stash 2", description: null }),
      ]);
      const req = reqFor(getUserStashInstances, { user: USER });
      const res = resFor(getUserStashInstances);
      await getUserStashInstances(req, res);
      const body = res._getOkBody();
      expect(body.selectedInstanceIds).toEqual(["inst-1"]);
      expect(body.availableInstances).toHaveLength(2);
    });
  });

  describe("updateUserStashInstances", () => {
    it("returns 400 when instanceIds not an array", async () => {
      const req = reqFor(updateUserStashInstances, {
        body: malformed({ instanceIds: "inst-1" }),
        user: USER,
      });
      const res = resFor(updateUserStashInstances);
      await updateUserStashInstances(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("returns 400 for invalid instance IDs", async () => {
      mockPrisma.stashInstance.findMany.mockResolvedValue([
        partialRow({ id: "inst-1" }),
      ]);
      const req = reqFor(updateUserStashInstances, {
        body: { instanceIds: ["inst-1", "inst-99"] },
        user: USER,
      });
      const res = resFor(updateUserStashInstances);
      await updateUserStashInstances(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toBe("Invalid instance IDs");
      expect(res._getErrorBody().details).toBe("inst-99");
    });

    it("clears selections when empty array", async () => {
      mockPrisma.userStashInstance.deleteMany.mockResolvedValue({
        count: 1,
      });
      const req = reqFor(updateUserStashInstances, {
        body: { instanceIds: [] },
        user: USER,
      });
      const res = resFor(updateUserStashInstances);
      await updateUserStashInstances(req, res);
      expect(res._getOkBody().success).toBe(true);
      expect(res._getOkBody().selectedInstanceIds).toEqual([]);
      expect(mockPrisma.userStashInstance.createMany).not.toHaveBeenCalled();
    });

    it("replaces selections with valid IDs", async () => {
      mockPrisma.stashInstance.findMany.mockResolvedValue([
        partialRow({ id: "inst-2" }),
      ]);
      mockPrisma.userStashInstance.deleteMany.mockResolvedValue({
        count: 0,
      });
      mockPrisma.userStashInstance.createMany.mockResolvedValue({
        count: 1,
      });
      const req = reqFor(updateUserStashInstances, {
        body: { instanceIds: ["inst-2"] },
        user: USER,
      });
      const res = resFor(updateUserStashInstances);
      await updateUserStashInstances(req, res);
      expect(res._getOkBody().success).toBe(true);
      expect(mockPrisma.userStashInstance.createMany).toHaveBeenCalledWith({
        data: [{ userId: 2, instanceId: "inst-2" }],
      });
    });
  });

  // ─── Setup ───

  describe("getSetupStatus", () => {
    it("returns 401 when user has no id", async () => {
      const req = reqFor(getSetupStatus, { user: malformed({}) });
      const res = resFor(getSetupStatus);
      await getSetupStatus(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("returns 404 when user not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const req = reqFor(getSetupStatus, { user: USER });
      const res = resFor(getSetupStatus);
      await getSetupStatus(req, res);
      expect(res._getStatus()).toBe(404);
    });

    it("returns setup status with instances and no recovery key", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          setupCompleted: false,
        })
      );
      mockPrisma.stashInstance.findMany.mockResolvedValue([
        partialRow({ id: "inst-1", name: "Stash 1", description: null }),
      ]);
      const req = reqFor(getSetupStatus, { user: USER });
      const res = resFor(getSetupStatus);
      await getSetupStatus(req, res);
      const body = res._getOkBody();
      expect(body.setupCompleted).toBe(false);
      expect(body).not.toHaveProperty("recoveryKey");
      expect(body.instances).toHaveLength(1);
      expect(body.instanceCount).toBe(1);
    });
  });

  describe("completeSetup", () => {
    it("returns 401 when user has no id", async () => {
      const req = reqFor(completeSetup, { user: malformed({}) });
      const res = resFor(completeSetup);
      await completeSetup(req, res);
      expect(res._getStatus()).toBe(401);
    });

    it("completes setup for single instance without selections", async () => {
      mockPrisma.stashInstance.count.mockResolvedValue(1);
      mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });
      vi.mocked(generateRecoveryKey).mockReturnValue("RAWKEY");
      vi.mocked(hashRecoveryKey).mockReturnValue("hashed-key");
      vi.mocked(formatRecoveryKey).mockReturnValue("RAWK-EY");
      const req = reqFor(completeSetup, { user: USER });
      const res = resFor(completeSetup);
      await completeSetup(req, res);
      expect(mockPrisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 2, setupCompleted: false },
        data: objectContaining({
          setupCompleted: true,
          recoveryKeyHash: "hashed-key",
        }),
      });
      expect(hashRecoveryKey).toHaveBeenCalledWith("RAWKEY");
      expect(res._getBody()).toEqual({ success: true, recoveryKey: "RAWK-EY" });
    });

    it("returns recoveryKey null when setup was already complete", async () => {
      mockPrisma.stashInstance.count.mockResolvedValue(1);
      mockPrisma.user.updateMany.mockResolvedValue({ count: 0 });
      vi.mocked(formatRecoveryKey).mockReturnValue("RAWK-EY");
      const req = reqFor(completeSetup, { user: USER });
      const res = resFor(completeSetup);
      await completeSetup(req, res);
      expect(res._getBody()).toEqual({ success: true, recoveryKey: null });
    });

    it("returns 400 for multi-instance with no selections", async () => {
      mockPrisma.stashInstance.count.mockResolvedValue(3);
      const req = reqFor(completeSetup, { user: USER });
      const res = resFor(completeSetup);
      await completeSetup(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toMatch(/At least one/);
    });

    it("completes setup for multi-instance with valid selections", async () => {
      mockPrisma.stashInstance.count.mockResolvedValue(3);
      mockPrisma.stashInstance.findMany.mockResolvedValue([
        partialRow({ id: "inst-1" }),
      ]);
      mockPrisma.userStashInstance.deleteMany.mockResolvedValue({
        count: 0,
      });
      mockPrisma.userStashInstance.createMany.mockResolvedValue({
        count: 1,
      });
      mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });
      const req = reqFor(completeSetup, {
        body: { selectedInstanceIds: ["inst-1"] },
        user: USER,
      });
      const res = resFor(completeSetup);
      await completeSetup(req, res);
      expect(res._getOkBody().success).toBe(true);
    });
  });

  // ─── syncFromStash (auth/validation only, not the complex pagination logic) ───

  describe("syncFromStash", () => {
    it("returns 403 when non-admin", async () => {
      const req = reqFor(syncFromStash, {
        params: { userId: "2" },
        user: USER,
      });
      const res = resFor(syncFromStash);
      await syncFromStash(req, res);
      expect(res._getStatus()).toBe(403);
    });

    it("returns 400 for invalid user ID", async () => {
      const req = reqFor(syncFromStash, {
        params: { userId: "abc" },
        user: ADMIN,
      });
      const res = resFor(syncFromStash);
      await syncFromStash(req, res);
      expect(res._getStatus()).toBe(400);
    });
  });
});
