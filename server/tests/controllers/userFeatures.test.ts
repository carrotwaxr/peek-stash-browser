/**
 * Unit Tests for User Controller — Filter Presets, Restrictions, Hidden Entities,
 * Permissions, Instance Selection, and Setup
 *
 * Tests getFilterPresets, saveFilterPreset, deleteFilterPreset,
 * getDefaultFilterPresets, setDefaultFilterPreset, getUserRestrictions,
 * updateUserRestrictions, deleteUserRestrictions, hideEntity, unhideEntity,
 * unhideAllEntities, getHiddenEntities, hideEntities,
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
  getFilterPins,
  getFilterPresets,
  getHiddenEntities,
  getSetupStatus,
  getUserGroupMemberships,
  getUserPermissions,
  getUserRestrictions,
  getUserStashInstances,
  hideEntities,
  hideEntity,
  putFilterPins,
  resetFilterPins,
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
import {
  NotFoundError,
  ValidationError,
} from "../../middleware/errorHandler.js";
import prisma from "../../prisma/singleton.js";
import userRoutes from "../../routes/user.js";
import { getVisibleEntityKeys } from "../../services/EntityAccessService.js";
import { exclusionComputationService } from "../../services/ExclusionComputationService.js";
import { resolveUserPermissions } from "../../services/PermissionService.js";
import { userHiddenEntityService } from "../../services/UserHiddenEntityService.js";
import type * as userHiddenEntityModule from "../../services/UserHiddenEntityService.js";
import { entityKey } from "../../utils/entityRef.js";
import {
  formatRecoveryKey,
  generateRecoveryKey,
  hashRecoveryKey,
} from "../../utils/recoveryKey.js";
import { authenticated } from "../../utils/routeHelpers.js";
import {
  type UserJsonColumn,
  updateUserJson,
} from "../../utils/userJsonColumn.js";
import {
  findHandler,
  malformed,
  reqFor,
  resFor,
  runRoute,
} from "../helpers/controllerTestUtils.js";
import {
  type MembershipWithGroup,
  userPermissions,
  userRow,
} from "../helpers/fixtures.js";
import { anyOf, objectContaining } from "../helpers/matchers.js";
import { must } from "../helpers/must.js";
import { partialRow } from "../helpers/prismaMock.js";

// Mock prisma
vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

// The pins save is a compare-and-set raw write; the tests run its mutation
vi.mock("../../utils/userJsonColumn.js", () => ({
  updateUserJson: vi.fn(),
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
    saveRestrictions: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock EntityAccessService (hiding requires visibility)
vi.mock("../../services/EntityAccessService.js", () => ({
  getVisibleEntityKeys: vi.fn(),
}));

// Mock UserHiddenEntityService; its list of hideable types stays real
vi.mock(
  "../../services/UserHiddenEntityService.js",
  async (importOriginal) => ({
    ...(await importOriginal<typeof userHiddenEntityModule>()),
    userHiddenEntityService: {
      findAlreadyHidden: vi.fn(),
      hideEntity: vi.fn().mockResolvedValue(undefined),
      hideEntities: vi.fn().mockResolvedValue(undefined),
      unhideEntity: vi.fn().mockResolvedValue(undefined),
      unhideAll: vi.fn().mockResolvedValue(5),
      getHiddenEntities: vi.fn().mockResolvedValue({
        items: [],
        total: 0,
        counts: {
          scene: 0,
          performer: 0,
          studio: 0,
          tag: 0,
          group: 0,
          gallery: 0,
          image: 0,
        },
      }),
    },
  })
);

// Mock StashInstanceManager
vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    getAll: vi.fn().mockReturnValue([]),
  },
}));

const mockPrisma = vi.mocked(prisma, true);
const mockUpdateUserJson = vi.mocked(updateUserJson);
const mockVisibleKeys = vi.mocked(getVisibleEntityKeys);
const mockAlreadyHidden = vi.mocked(userHiddenEntityService.findAlreadyHidden);

/** Only these ids are visible, on the instance each target names. */
function visibleIds(...ids: string[]) {
  mockVisibleKeys.mockImplementation((_userId, _type, refs) =>
    Promise.resolve(
      new Set(
        refs
          .filter((r) => ids.includes(r.id))
          .map((r) => entityKey(r.id, r.instanceId))
      )
    )
  );
}
const mockResolvePermissions = vi.mocked(resolveUserPermissions);
const mockExclusionService = vi.mocked(exclusionComputationService);

const ADMIN = { id: 1, username: "admin", role: "ADMIN" };
const USER = { id: 2, username: "testuser", role: "USER" };

/**
 * The Views and defaults stored for the user: the compare-and-set write
 * (mocked) runs its change on them, and `written()` answers the last write
 */
function viewsStored(stored: {
  filterPresets?: unknown;
  defaultFilterPresets?: unknown;
}) {
  let last: Record<UserJsonColumn, unknown> | undefined;
  mockUpdateUserJson.mockImplementation((_userId, _columns, mutate) => {
    last = mutate({
      filterPresets: stored.filterPresets ?? null,
      defaultFilterPresets: stored.defaultFilterPresets ?? null,
      filterPins: null,
    });
    return Promise.resolve(last);
  });
  return {
    written: () => {
      if (!last) throw new Error("nothing was written");
      return last as {
        filterPresets: Record<string, Array<{ id: string }>>;
        defaultFilterPresets: Record<string, string>;
      };
    },
  };
}

describe("User Controller — Features", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Every entity is visible and not yet hidden unless a test says otherwise
    mockAlreadyHidden.mockImplementation((_userId, targets) =>
      Promise.resolve(targets.map(() => false))
    );
    // The one configured instance the hide targets name
    mockPrisma.stashInstance.findMany.mockResolvedValue([
      partialRow({ id: "inst-1" }),
    ]);
    mockVisibleKeys.mockImplementation((_userId, _type, refs) =>
      Promise.resolve(new Set(refs.map((r) => entityKey(r.id, r.instanceId))))
    );
  });

  // ─── Filter Presets ───

  describe("getFilterPresets", () => {
    it("returns 401 when user has no id", async () => {
      const req = reqFor(getFilterPresets, { user: malformed({}) });
      const res = resFor(getFilterPresets);
      await authenticated(getFilterPresets)(req, res, vi.fn());
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
      await authenticated(saveFilterPreset)(req, res, vi.fn());
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

    it("a preset saved as default on a gallery's Scenes tab (scene_gallery) is stored", async () => {
      const stored = viewsStored({
        filterPresets: {},
        defaultFilterPresets: {},
      });
      const req = reqFor(saveFilterPreset, {
        body: {
          artifactType: "scene",
          context: "scene_gallery",
          name: "Gallery default",
          filters: {},
          sort: "title",
          direction: "ASC",
          setAsDefault: true,
        },
        user: USER,
      });
      const res = resFor(saveFilterPreset);
      await saveFilterPreset(req, res);
      expect(res._getStatus()).toBe(200);
      expect(Object.keys(stored.written().defaultFilterPresets)).toEqual([
        "scene_gallery",
      ]);
    });

    it("saves preset with defaults for optional fields", async () => {
      viewsStored({ filterPresets: {}, defaultFilterPresets: {} });

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

    it("empty display fields take the defaults", async () => {
      viewsStored({ filterPresets: {}, defaultFilterPresets: {} });

      const req = reqFor(saveFilterPreset, {
        body: {
          artifactType: "scene",
          name: "Empty fields",
          filters: {},
          sort: "rating",
          direction: "DESC",
          viewMode: "",
          zoomLevel: "",
          gridDensity: "",
        },
        user: USER,
      });
      const res = resFor(saveFilterPreset);
      await saveFilterPreset(req, res);
      const body = res._getOkBody();
      expect(body.preset.viewMode).toBe("grid");
      expect(body.preset.zoomLevel).toBe("medium");
      expect(body.preset.gridDensity).toBe("comfortable");
    });

    it("a per page under 1 and a display field that is no short string answer 400 and store nothing", async () => {
      for (const [path, value] of [
        ["perPage", 0],
        ["viewMode", { mode: "grid" }],
        ["zoomLevel", 3],
        ["gridDensity", "x".repeat(33)],
      ] as const) {
        viewsStored({ filterPresets: {}, defaultFilterPresets: {} });
        const req = reqFor(saveFilterPreset, {
          body: malformed({
            artifactType: "scene",
            name: "Bad field",
            filters: {},
            sort: "rating",
            direction: "DESC",
            [path]: value,
          }),
          user: USER,
        });

        await expect(
          saveFilterPreset(req, resFor(saveFilterPreset)),
          path
        ).rejects.toMatchObject({ statusCode: 400, issues: [{ path }] });
      }
      expect(mockUpdateUserJson).not.toHaveBeenCalled();
    });

    it("an empty context makes the preset the default for its artifact type", async () => {
      const stored = viewsStored({
        filterPresets: {},
        defaultFilterPresets: {},
      });

      const req = reqFor(saveFilterPreset, {
        body: {
          artifactType: "scene",
          context: "",
          name: "Default one",
          filters: {},
          sort: "rating",
          direction: "DESC",
          setAsDefault: true,
        },
        user: USER,
      });
      const res = resFor(saveFilterPreset);
      await saveFilterPreset(req, res);
      const body = res._getOkBody();
      expect(stored.written().defaultFilterPresets).toEqual({
        scene: body.preset.id,
      });
    });

    it("sets preset as default when setAsDefault is true", async () => {
      const stored = viewsStored({
        filterPresets: {},
        defaultFilterPresets: {},
      });

      const req = reqFor(saveFilterPreset, {
        body: {
          artifactType: "scene",
          context: "scene_performer",
          name: "Fav Filter",
          filters: {},
          sort: "title",
          direction: "ASC",
          setAsDefault: true,
        },
        user: USER,
      });
      const res = resFor(saveFilterPreset);
      await saveFilterPreset(req, res);

      expect(stored.written().defaultFilterPresets).toEqual({
        scene_performer: res._getOkBody().preset.id,
      });
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

    it("a user who is gone is the write's 404", async () => {
      mockUpdateUserJson.mockRejectedValue(new NotFoundError("User not found"));
      const req = reqFor(deleteFilterPreset, {
        params: { artifactType: "scene", presetId: "1" },
        user: USER,
      });
      const res = resFor(deleteFilterPreset);
      await expect(deleteFilterPreset(req, res)).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("deletes preset and clears default if it was default", async () => {
      const presetId = "preset-to-delete";
      const stored = viewsStored({
        filterPresets: { scene: [{ id: presetId, name: "Test" }] },
        defaultFilterPresets: { scene: presetId },
      });

      const req = reqFor(deleteFilterPreset, {
        params: { artifactType: "scene", presetId },
        user: USER,
      });
      const res = resFor(deleteFilterPreset);
      await deleteFilterPreset(req, res);
      expect(res._getOkBody().success).toBe(true);

      expect(stored.written().filterPresets.scene).toEqual([]);
      expect(stored.written().defaultFilterPresets).toEqual({});
    });
  });

  describe("getDefaultFilterPresets", () => {
    it("returns 401 when user has no id", async () => {
      const req = reqFor(getDefaultFilterPresets, { user: malformed({}) });
      const res = resFor(getDefaultFilterPresets);
      await authenticated(getDefaultFilterPresets)(req, res, vi.fn());
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

    it("set-default accepts the image and clip contexts", async () => {
      for (const [context, artifactType] of [
        ["image", "image"],
        ["clip", "clip"],
        ["image_performer", "image"],
        ["image_studio", "image"],
        ["image_tag", "image"],
        ["image_gallery", "image"],
        ["scene_gallery", "scene"],
      ] as const) {
        const presetId = `preset-${context}`;
        const stored = viewsStored({
          defaultFilterPresets: {},
          filterPresets: { [artifactType]: [{ id: presetId, name: "P" }] },
        });
        const req = reqFor(setDefaultFilterPreset, {
          body: { context, presetId },
          user: USER,
        });
        const res = resFor(setDefaultFilterPreset);
        await setDefaultFilterPreset(req, res);
        expect(res._getStatus(), context).toBe(200);
        expect(stored.written().defaultFilterPresets, context).toEqual({
          [context]: presetId,
        });
      }
    });

    it("an unknown context still answers 400", async () => {
      const req = reqFor(setDefaultFilterPreset, {
        body: { context: "gallery_scenes", presetId: "x" },
        user: USER,
      });
      const res = resFor(setDefaultFilterPreset);
      await setDefaultFilterPreset(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toMatch(/Invalid context/);
    });

    it("returns 400 when preset not found", async () => {
      viewsStored({ defaultFilterPresets: {}, filterPresets: { scene: [] } });
      const req = reqFor(setDefaultFilterPreset, {
        body: { context: "scene", presetId: "nonexistent" },
        user: USER,
      });
      const res = resFor(setDefaultFilterPreset);
      await expect(setDefaultFilterPreset(req, res)).rejects.toMatchObject({
        statusCode: 400,
        message: "Preset not found",
      });
    });

    it("clears default when presetId is null", async () => {
      const stored = viewsStored({
        defaultFilterPresets: { scene: "some-id", tag: "other" },
        filterPresets: {},
      });
      const req = reqFor(setDefaultFilterPreset, {
        body: { context: "scene" },
        user: USER,
      });
      const res = resFor(setDefaultFilterPreset);
      await setDefaultFilterPreset(req, res);
      expect(res._getOkBody().success).toBe(true);
      expect(stored.written().defaultFilterPresets).toEqual({ tag: "other" });
    });

    it("validates scene grid contexts against scene presets", async () => {
      const presetId = "existing-preset";
      viewsStored({
        defaultFilterPresets: {},
        filterPresets: { scene: [{ id: presetId, name: "Test" }] },
      });
      const req = reqFor(setDefaultFilterPreset, {
        body: { context: "scene_performer", presetId },
        user: USER,
      });
      const res = resFor(setDefaultFilterPreset);
      await setDefaultFilterPreset(req, res);
      expect(res._getOkBody().success).toBe(true);
    });
  });

  // ─── Filter Pins ───

  describe("filter pins", () => {
    const SCENE_PINS = {
      fields: ["rating"],
      filters: [
        {
          id: "0123456789abcdef0123456789abcdef",
          key: "favorite",
          state: { favorite: "true" },
        },
      ],
    };

    /** Runs the mutation `updateUserJson` was given on the stored columns */
    function runMutation(stored: unknown) {
      const call =
        mockUpdateUserJson.mock.calls[mockUpdateUserJson.mock.calls.length - 1];
      if (!call) throw new Error("updateUserJson was not called");
      const [userId, columns, mutate] = call;
      const values = mutate({
        filterPresets: null,
        defaultFilterPresets: null,
        filterPins: stored,
      });
      return { userId, columns, values };
    }

    beforeEach(() => {
      mockUpdateUserJson.mockResolvedValue({
        filterPresets: null,
        defaultFilterPresets: null,
        filterPins: null,
      });
    });

    it("GET answers every list, the defaults filled in", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({ filterPins: { scene: SCENE_PINS } })
      );
      const req = reqFor(getFilterPins, { user: USER });
      const res = resFor(getFilterPins);
      await getFilterPins(req, res);

      const { pins } = res._getOkBody();
      expect(Object.keys(pins).sort()).toEqual([
        "clip",
        "gallery",
        "group",
        "image",
        "performer",
        "scene",
        "studio",
        "tag",
      ]);
      expect(pins.scene).toEqual(SCENE_PINS);
      expect(pins.performer.filters.map((filter) => filter.key)).toEqual([
        "favorite",
      ]);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: USER.id },
        select: { filterPins: true },
      });
    });

    it("GET answers the defaults for a user with none stored", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({ filterPins: null })
      );
      const res = resFor(getFilterPins);
      await getFilterPins(reqFor(getFilterPins, { user: USER }), res);
      expect(res._getOkBody().pins.scene.filters.map((f) => f.id)).toEqual([
        "default-unwatched",
        "default-favorites",
      ]);
    });

    it("GET answers 404 when the user is gone", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const res = resFor(getFilterPins);
      await getFilterPins(reqFor(getFilterPins, { user: USER }), res);
      expect(res._getStatus()).toBe(404);
    });

    it("PUT stores one list and answers it", async () => {
      const req = reqFor(putFilterPins, {
        user: USER,
        params: { list: "scene" },
        body: SCENE_PINS,
      });
      const res = resFor(putFilterPins);
      await putFilterPins(req, res);

      expect(res._getOkBody()).toEqual({ pins: SCENE_PINS });
      const { userId, columns, values } = runMutation({
        performer: { fields: [], filters: [] },
        scene: { fields: ["oCount"], filters: [] },
      });
      expect(userId).toBe(USER.id);
      expect(columns).toEqual(["filterPins"]);
      // the other lists are kept, this one replaced
      expect(values.filterPins).toEqual({
        performer: { fields: [], filters: [] },
        scene: SCENE_PINS,
      });
    });

    it("PUT stores a list over a user's first save (NULL stored)", async () => {
      const req = reqFor(putFilterPins, {
        user: USER,
        params: { list: "tag" },
        body: { fields: [], filters: [] },
      });
      await putFilterPins(req, resFor(putFilterPins));
      expect(runMutation(null).values.filterPins).toEqual({
        tag: { fields: [], filters: [] },
      });
    });

    it("PUT refuses invalid pins with their paths, and writes nothing", async () => {
      const req = reqFor(putFilterPins, {
        user: USER,
        params: { list: "scene" },
        body: { fields: ["nope"], filters: [] },
      });
      const failure = await putFilterPins(req, resFor(putFilterPins)).catch(
        (error: unknown) => error
      );
      expect(failure).toBeInstanceOf(ValidationError);
      expect((failure as ValidationError).issues).toEqual([
        { path: "fields[0]", message: anyOf(String) },
      ]);
      expect(mockUpdateUserJson).not.toHaveBeenCalled();
    });

    it("PUT and DELETE answer 400 for a list that is no list kind", async () => {
      await expect(
        putFilterPins(
          reqFor(putFilterPins, {
            user: USER,
            params: { list: "playlist" },
            body: { fields: [], filters: [] },
          }),
          resFor(putFilterPins)
        )
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        resetFilterPins(
          reqFor(resetFilterPins, { user: USER, params: { list: "x" } }),
          resFor(resetFilterPins)
        )
      ).rejects.toBeInstanceOf(ValidationError);
      expect(mockUpdateUserJson).not.toHaveBeenCalled();
    });

    it("DELETE removes that list's entry and answers its defaults", async () => {
      const req = reqFor(resetFilterPins, {
        user: USER,
        params: { list: "scene" },
      });
      const res = resFor(resetFilterPins);
      await resetFilterPins(req, res);

      expect(res._getOkBody().pins.filters.map((f) => f.id)).toEqual([
        "default-unwatched",
        "default-favorites",
      ]);
      const { columns, values } = runMutation({
        scene: SCENE_PINS,
        tag: { fields: [], filters: [] },
      });
      expect(columns).toEqual(["filterPins"]);
      expect(values.filterPins).toEqual({
        tag: { fields: [], filters: [] },
      });
      // the last entry going leaves NULL
      expect(runMutation({ scene: SCENE_PINS }).values.filterPins).toBeNull();
      expect(runMutation(null).values.filterPins).toBeNull();
    });

    it("reads and writes only the signed-in user's pins", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({ filterPins: null })
      );
      // a body or params naming another user change nothing: only req.user.id is read
      await getFilterPins(
        reqFor(getFilterPins, {
          user: USER,
          query: malformed({ userId: "1" }),
        }),
        resFor(getFilterPins)
      );
      await putFilterPins(
        reqFor(putFilterPins, {
          user: USER,
          params: malformed({ list: "scene", userId: "1" }),
          body: malformed({ ...SCENE_PINS, userId: 1 }),
        }),
        resFor(putFilterPins)
      );
      await resetFilterPins(
        reqFor(resetFilterPins, {
          user: USER,
          params: malformed({ list: "scene", userId: "1" }),
        }),
        resFor(resetFilterPins)
      );
      expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(1);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
        objectContaining({ where: { id: USER.id } })
      );
      expect(mockUpdateUserJson.mock.calls.map((call) => call[0])).toEqual([
        USER.id,
        USER.id,
      ]);
    });

    it("registers the routes behind authenticate with the list as a param", () => {
      expect(findHandler(userRoutes, "get", "/filter-pins")).toBeTypeOf(
        "function"
      );
      expect(findHandler(userRoutes, "put", "/filter-pins/:list")).toBeTypeOf(
        "function"
      );
      expect(
        findHandler(userRoutes, "delete", "/filter-pins/:list")
      ).toBeTypeOf("function");
    });
  });

  // ─── Content Restrictions ───

  describe("getUserRestrictions", () => {
    it("returns 401 when user missing", async () => {
      const req = reqFor(getUserRestrictions, { params: { userId: "2" } });
      const res = resFor(getUserRestrictions);
      await authenticated(getUserRestrictions)(req, res, vi.fn());
      expect(res._getStatus()).toBe(401);
    });

    it("returns 403 when non-admin", async () => {
      const req = reqFor(getUserRestrictions, {
        params: { userId: "2" },
        user: USER,
      });
      const res = resFor(getUserRestrictions);
      await runRoute(userRoutes, "get", "/:userId/restrictions", req, res);
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
      expect(res._getOkBody().restrictions).toEqual([
        {
          id: 1,
          entityType: "tags",
          mode: "EXCLUDE",
          entityIds: [],
          unreadable: false,
        },
      ]);
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
      await runRoute(userRoutes, "put", "/:userId/restrictions", req, res);
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

    it("replaces all restrictions through one save unit", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          id: 2,
          role: "USER",
        })
      );
      mockExclusionService.saveRestrictions.mockResolvedValue(undefined);
      mockPrisma.userContentRestriction.findMany.mockResolvedValue([
        partialRow({ id: 1, entityType: "tags", mode: "EXCLUDE" }),
      ]);
      const req = reqFor(updateUserRestrictions, {
        body: {
          restrictions: [
            {
              entityType: "tags",
              mode: "EXCLUDE",
              entityIds: ["1:inst-1", "2:inst-1"],
            },
          ],
        },
        params: { userId: "2" },
        user: ADMIN,
      });
      const res = resFor(updateUserRestrictions);
      await updateUserRestrictions(req, res);
      expect(res._getOkBody().success).toBe(true);
      expect(
        mockExclusionService.saveRestrictions
      ).toHaveBeenCalledExactlyOnceWith(2, [
        {
          entityType: "tags",
          mode: "EXCLUDE",
          entityIds: ["1:inst-1", "2:inst-1"],
          restrictEmpty: false,
        },
      ]);
      expect(res._getOkBody().restrictions).toHaveLength(1);
    });

    /** A save of one tag list holding `entityIds`, for user 2 (a USER). */
    async function saveTags(mode: "INCLUDE" | "EXCLUDE", entityIds: string[]) {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({ id: 2, role: "USER" })
      );
      mockExclusionService.saveRestrictions.mockResolvedValue(undefined);
      const req = reqFor(updateUserRestrictions, {
        body: { restrictions: [{ entityType: "tags", mode, entityIds }] },
        params: { userId: "2" },
        user: ADMIN,
      });
      const res = resFor(updateUserRestrictions);
      await updateUserRestrictions(req, res);
      return res;
    }

    it("refuses a bare id the user's stored lists do not hold, naming it and saving nothing", async () => {
      // Stored: this type's lists hold "7" bare and "5" only with an instance
      mockPrisma.userContentRestriction.findMany.mockResolvedValue([
        partialRow({
          entityType: "tags",
          mode: "EXCLUDE",
          entityIds: JSON.stringify(["7", "5:inst-1"]),
        }),
      ]);

      const res = await saveTags("INCLUDE", ["4:inst-1", "5"]);

      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toBe(
        "Entity id in tags INCLUDE needs its instance: 5"
      );
      expect(mockPrisma.userContentRestriction.findMany).toHaveBeenCalledWith({
        where: { userId: 2, entityType: { in: ["tags"] } },
        select: { entityType: true, entityIds: true },
      });
      expect(mockExclusionService.saveRestrictions).not.toHaveBeenCalled();
    });

    it("keeps a bare id a stored list of the type already holds, so an old list can be saved again", async () => {
      mockPrisma.userContentRestriction.findMany.mockResolvedValue([
        partialRow({
          entityType: "tags",
          mode: "EXCLUDE",
          entityIds: JSON.stringify(["7", "5:inst-1"]),
        }),
      ]);

      const res = await saveTags("EXCLUDE", ["7", "8:inst-1"]);

      expect(res._getOkBody().success).toBe(true);
      expect(
        mockExclusionService.saveRestrictions
      ).toHaveBeenCalledExactlyOnceWith(2, [
        {
          entityType: "tags",
          mode: "EXCLUDE",
          entityIds: ["7", "8:inst-1"],
          restrictEmpty: false,
        },
      ]);
    });
  });

  describe("deleteUserRestrictions", () => {
    it("returns 403 when non-admin", async () => {
      const req = reqFor(deleteUserRestrictions, {
        params: { userId: "2" },
        user: USER,
      });
      const res = resFor(deleteUserRestrictions);
      await runRoute(userRoutes, "delete", "/:userId/restrictions", req, res);
      expect(res._getStatus()).toBe(403);
    });

    it("deletes all restrictions through one save unit", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({ id: 2, role: "USER" })
      );
      mockExclusionService.saveRestrictions.mockResolvedValue(undefined);
      const req = reqFor(deleteUserRestrictions, {
        params: { userId: "2" },
        user: ADMIN,
      });
      const res = resFor(deleteUserRestrictions);
      await deleteUserRestrictions(req, res);
      expect(res._getOkBody().success).toBe(true);
      expect(
        mockExclusionService.saveRestrictions
      ).toHaveBeenCalledExactlyOnceWith(2, []);
    });
  });

  // ─── Hidden Entities ───

  describe("hideEntity", () => {
    it("returns 401 when user has no id", async () => {
      const req = reqFor(hideEntity, {
        body: { entityType: "scene", entityId: "1", instanceId: "inst-1" },
        user: malformed({}),
      });
      const res = resFor(hideEntity);
      await authenticated(hideEntity)(req, res, vi.fn());
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
        body: { entityType: "user", entityId: "1", instanceId: "inst-1" },
        user: USER,
      });
      const res = resFor(hideEntity);
      await hideEntity(req, res);
      expect(res._getStatus()).toBe(400);
    });

    it("hides entity successfully, on its instance", async () => {
      const req = reqFor(hideEntity, {
        body: { entityType: "scene", entityId: "42", instanceId: "inst-1" },
        user: USER,
      });
      const res = resFor(hideEntity);
      await hideEntity(req, res);
      expect(res._getOkBody().success).toBe(true);
      expect(mockVisibleKeys).toHaveBeenCalledWith(USER.id, "scene", [
        { id: "42", instanceId: "inst-1" },
      ]);
      expect(userHiddenEntityService.hideEntity).toHaveBeenCalledWith(
        USER.id,
        "scene",
        "42",
        "inst-1"
      );
    });

    it.each([
      ["no instanceId", {}, "instanceId is required"],
      ["an empty instanceId", { instanceId: "" }, "instanceId is required"],
      ["a null instanceId", { instanceId: null }, "instanceId is required"],
      ["a non-string instanceId", { instanceId: 5 }, "Invalid instanceId"],
    ])("returns 400 for %s and writes nothing", async (_, extra, error) => {
      const req = reqFor(hideEntity, {
        body: malformed({ entityType: "scene", entityId: "42", ...extra }),
        user: USER,
      });
      const res = resFor(hideEntity);
      await hideEntity(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody()).toEqual({ error });
      expect(mockVisibleKeys).not.toHaveBeenCalled();
      expect(userHiddenEntityService.hideEntity).not.toHaveBeenCalled();
    });

    it("returns 400 for an instance that is not configured", async () => {
      mockPrisma.stashInstance.findMany.mockResolvedValueOnce([]);
      const req = reqFor(hideEntity, {
        body: { entityType: "scene", entityId: "42", instanceId: "gone" },
        user: USER,
      });
      const res = resFor(hideEntity);
      await hideEntity(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody()).toEqual({ error: "Invalid instanceId" });
      expect(mockPrisma.stashInstance.findMany).toHaveBeenCalledWith({
        where: { id: { in: ["gone"] } },
        select: { id: true },
      });
      expect(userHiddenEntityService.hideEntity).not.toHaveBeenCalled();
    });

    it("returns 404 and writes nothing for an entity the user cannot see", async () => {
      visibleIds();
      const req = reqFor(hideEntity, {
        body: { entityType: "tag", entityId: "7", instanceId: "inst-1" },
        user: USER,
      });
      const res = resFor(hideEntity);
      await hideEntity(req, res);
      expect(res._getStatus()).toBe(404);
      expect(res._getBody()).toEqual({ error: "Not found" });
      expect(userHiddenEntityService.hideEntity).not.toHaveBeenCalled();
    });

    it("a repeat hide succeeds without writing", async () => {
      mockAlreadyHidden.mockResolvedValueOnce([true]);
      // Hidden entities are excluded for their owner, so access says no
      visibleIds();
      const req = reqFor(hideEntity, {
        body: { entityType: "scene", entityId: "42", instanceId: "inst-1" },
        user: USER,
      });
      const res = resFor(hideEntity);
      await hideEntity(req, res);
      expect(res._getStatus()).toBe(200);
      expect(res._getOkBody().success).toBe(true);
      expect(mockAlreadyHidden).toHaveBeenCalledWith(USER.id, [
        { entityType: "scene", entityId: "42", instanceId: "inst-1" },
      ]);
      expect(userHiddenEntityService.hideEntity).not.toHaveBeenCalled();
    });

    it("returns 400 when entityId is not a numeric Stash id", async () => {
      const req = reqFor(hideEntity, {
        body: {
          entityType: "tag",
          entityId: "x') OR 1=1 --",
          instanceId: "inst-1",
        },
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
      await authenticated(unhideEntity)(req, res, vi.fn());
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

    it("unhides on the named instance when the database knows it", async () => {
      const req = reqFor(unhideEntity, {
        params: { entityType: "scene", entityId: "42" },
        query: { instanceId: "inst-1" },
        user: USER,
      });
      const res = resFor(unhideEntity);
      await unhideEntity(req, res);
      expect(res._getOkBody().success).toBe(true);
      expect(mockPrisma.stashInstance.findMany).toHaveBeenCalledWith({
        where: { id: { in: ["inst-1"] } },
        select: { id: true },
      });
      expect(userHiddenEntityService.unhideEntity).toHaveBeenCalledWith(
        USER.id,
        "scene",
        "42",
        "inst-1"
      );
    });

    it("returns 400 for an instance the database does not hold, unhiding nothing", async () => {
      const req = reqFor(unhideEntity, {
        params: { entityType: "scene", entityId: "42" },
        query: { instanceId: "gone" },
        user: USER,
      });
      const res = resFor(unhideEntity);
      await unhideEntity(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toBe("Invalid instanceId");
      expect(userHiddenEntityService.unhideEntity).not.toHaveBeenCalled();
    });

    it("returns 400 for a repeated instanceId, reading and unhiding nothing", async () => {
      const req = reqFor(unhideEntity, {
        params: { entityType: "scene", entityId: "42" },
        query: malformed({ instanceId: ["inst-1", "inst-2"] }),
        user: USER,
      });
      const res = resFor(unhideEntity);
      await unhideEntity(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toBe("instanceId must be a string");
      expect(mockPrisma.stashInstance.findMany).not.toHaveBeenCalled();
      expect(userHiddenEntityService.unhideEntity).not.toHaveBeenCalled();
    });
  });

  describe("unhideAllEntities", () => {
    it("returns 401 when user has no id", async () => {
      const req = reqFor(unhideAllEntities, { user: malformed({}) });
      const res = resFor(unhideAllEntities);
      await authenticated(unhideAllEntities)(req, res, vi.fn());
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
    const hidden = vi.mocked(userHiddenEntityService, true);

    it("answers the service's page, asking page 1 of 50 by default", async () => {
      const req = reqFor(getHiddenEntities, { user: USER });
      const res = resFor(getHiddenEntities);
      await getHiddenEntities(req, res);
      expect(res._getOkBody()).toMatchObject({ items: [], total: 0 });
      expect(hidden.getHiddenEntities).toHaveBeenCalledWith(USER.id, {
        entityType: undefined,
        page: 1,
        perPage: 50,
      });
    });

    it("passes page and per_page", async () => {
      const req = reqFor(getHiddenEntities, {
        query: { entityType: "tag", page: "3", per_page: "100" },
        user: USER,
      });
      const res = resFor(getHiddenEntities);
      await getHiddenEntities(req, res);
      expect(res._getStatus()).toBe(200);
      expect(hidden.getHiddenEntities).toHaveBeenCalledWith(USER.id, {
        entityType: "tag",
        page: 3,
        perPage: 100,
      });
    });

    it.each([
      [{ per_page: "0" }],
      [{ per_page: "101" }],
      [{ per_page: "5x" }],
      [{ per_page: "" }],
      [{ page: "0" }],
      [{ page: "-1" }],
      [{ page: "1.5" }],
      [malformed({ page: ["1", "2"] })],
    ])("answers 400 for %j and asks nothing", async (query) => {
      const req = reqFor(getHiddenEntities, { query, user: USER });
      const res = resFor(getHiddenEntities);
      await getHiddenEntities(req, res);
      expect(res._getStatus()).toBe(400);
      expect(hidden.getHiddenEntities).not.toHaveBeenCalled();
    });
  });

  describe("the hide handlers' entity types", () => {
    const HIDEABLE_TYPES = [
      "scene",
      "performer",
      "studio",
      "tag",
      "group",
      "gallery",
      "image",
      "clip",
    ];
    const HANDLERS = [
      "hideEntity",
      "unhideEntity",
      "unhideAllEntities",
      "getHiddenEntities",
    ] as const;
    const hidden = vi.mocked(userHiddenEntityService, true);

    /**
     * Each handler called with one entity type (answering its status), and
     * the types it passed on to the service so far.
     */
    const handlers: Record<
      (typeof HANDLERS)[number],
      { call: (entityType: string) => Promise<number>; passed: () => unknown[] }
    > = {
      hideEntity: {
        call: async (entityType) => {
          const req = reqFor(hideEntity, {
            body: { entityType, entityId: "42", instanceId: "inst-1" },
            user: USER,
          });
          const res = resFor(hideEntity);
          await hideEntity(req, res);
          return res._getStatus();
        },
        passed: () => hidden.hideEntity.mock.calls.map((call) => call[1]),
      },
      unhideEntity: {
        call: async (entityType) => {
          const req = reqFor(unhideEntity, {
            params: { entityType, entityId: "42" },
            user: USER,
          });
          const res = resFor(unhideEntity);
          await unhideEntity(req, res);
          return res._getStatus();
        },
        passed: () => hidden.unhideEntity.mock.calls.map((call) => call[1]),
      },
      unhideAllEntities: {
        call: async (entityType) => {
          const req = reqFor(unhideAllEntities, {
            query: { entityType },
            user: USER,
          });
          const res = resFor(unhideAllEntities);
          await unhideAllEntities(req, res);
          return res._getStatus();
        },
        passed: () => hidden.unhideAll.mock.calls.map((call) => call[1]),
      },
      getHiddenEntities: {
        call: async (entityType) => {
          const req = reqFor(getHiddenEntities, {
            query: { entityType },
            user: USER,
          });
          const res = resFor(getHiddenEntities);
          await getHiddenEntities(req, res);
          return res._getStatus();
        },
        passed: () =>
          hidden.getHiddenEntities.mock.calls.map((call) => call[1].entityType),
      },
    };

    it.each(HANDLERS)(
      "%s answers 400 for a type outside HIDEABLE_ENTITY_TYPES",
      async (name) => {
        const handler = handlers[name];
        expect(await handler.call("marker")).toBe(400);
        expect(await handler.call("Scene")).toBe(400);
        expect(handler.passed()).toEqual([]);
      }
    );

    it.each(HANDLERS)("%s accepts each hideable type", async (name) => {
      const handler = handlers[name];
      for (const entityType of HIDEABLE_TYPES) {
        expect(await handler.call(entityType), entityType).toBe(200);
      }
      expect(handler.passed()).toEqual(HIDEABLE_TYPES);
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
        body: {
          entities: [
            { entityType: "invalid", entityId: "1", instanceId: "inst-1" },
          ],
        },
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
            { entityType: "scene", entityId: "1", instanceId: "inst-1" },
            { entityType: "performer", entityId: "2", instanceId: "inst-1" },
          ],
        },
        user: USER,
      });
      const res = resFor(hideEntities);
      await hideEntities(req, res);
      expect(res._getOkBody().success).toBe(true);
      expect(res._getOkBody().successCount).toBe(2);
      expect(res._getOkBody().failCount).toBe(0);
      // Every target in one call: one compute, one unit
      expect(
        userHiddenEntityService.hideEntities
      ).toHaveBeenCalledExactlyOnceWith(USER.id, [
        { entityType: "scene", entityId: "1", instanceId: "inst-1" },
        { entityType: "performer", entityId: "2", instanceId: "inst-1" },
      ]);
      expect(userHiddenEntityService.hideEntity).not.toHaveBeenCalled();
    });

    it("hides nothing and rejects when the write fails, for the error handler's 500", async () => {
      vi.mocked(userHiddenEntityService.hideEntities).mockRejectedValueOnce(
        new Error("merge failed")
      );
      const req = reqFor(hideEntities, {
        body: {
          entities: [
            { entityType: "scene", entityId: "1", instanceId: "inst-1" },
            { entityType: "performer", entityId: "2", instanceId: "inst-1" },
          ],
        },
        user: USER,
      });
      const res = resFor(hideEntities);
      await expect(hideEntities(req, res)).rejects.toThrow("merge failed");
      expect(res.json).not.toHaveBeenCalled();
    });

    it("returns 404 naming the first target not visible, and hides nothing", async () => {
      visibleIds("1", "3");
      const req = reqFor(hideEntities, {
        body: {
          entities: [
            { entityType: "scene", entityId: "1", instanceId: "inst-1" },
            { entityType: "tag", entityId: "2", instanceId: "inst-1" },
            { entityType: "performer", entityId: "3", instanceId: "inst-1" },
          ],
        },
        user: USER,
      });
      const res = resFor(hideEntities);
      await hideEntities(req, res);
      expect(res._getStatus()).toBe(404);
      expect(res._getBody()).toEqual({ error: "entities[1]: Not found" });
      expect(userHiddenEntityService.hideEntities).not.toHaveBeenCalled();
    });

    it("counts a target already hidden as hidden without writing it again", async () => {
      mockAlreadyHidden.mockResolvedValueOnce([true, false]);
      visibleIds("2");
      const req = reqFor(hideEntities, {
        body: {
          entities: [
            { entityType: "scene", entityId: "1", instanceId: "inst-1" },
            { entityType: "scene", entityId: "2", instanceId: "inst-1" },
          ],
        },
        user: USER,
      });
      const res = resFor(hideEntities);
      await hideEntities(req, res);
      expect(res._getOkBody().successCount).toBe(2);
      expect(res._getOkBody().failCount).toBe(0);
      expect(
        userHiddenEntityService.hideEntities
      ).toHaveBeenCalledExactlyOnceWith(USER.id, [
        { entityType: "scene", entityId: "2", instanceId: "inst-1" },
      ]);
    });

    it("writes nothing when every target is already hidden", async () => {
      mockAlreadyHidden.mockResolvedValueOnce([true, true]);
      visibleIds();
      const req = reqFor(hideEntities, {
        body: {
          entities: [
            { entityType: "scene", entityId: "1", instanceId: "inst-1" },
            { entityType: "scene", entityId: "2", instanceId: "inst-1" },
          ],
        },
        user: USER,
      });
      const res = resFor(hideEntities);
      await hideEntities(req, res);
      expect(res._getOkBody().successCount).toBe(2);
      expect(userHiddenEntityService.hideEntities).not.toHaveBeenCalled();
    });

    it("checks a 200-target bulk hide in a bounded number of queries", async () => {
      const entities = Array.from({ length: 200 }, (_, i) => ({
        entityType: i % 2 === 0 ? "scene" : "performer",
        entityId: String(i),
        instanceId: "inst-1",
      }));
      const req = reqFor(hideEntities, { body: { entities }, user: USER });
      const res = resFor(hideEntities);
      await hideEntities(req, res);

      expect(res._getOkBody().successCount).toBe(200);
      // One instance read, one read of the user's hides, one visibility
      // query per type
      expect(mockPrisma.stashInstance.findMany).toHaveBeenCalledTimes(1);
      expect(mockAlreadyHidden).toHaveBeenCalledTimes(1);
      expect(mockVisibleKeys).toHaveBeenCalledTimes(2);
      expect(must(mockVisibleKeys.mock.calls[0])[2]).toHaveLength(100);
      expect(must(mockVisibleKeys.mock.calls[1])[2]).toHaveLength(100);
      expect(userHiddenEntityService.hideEntities).toHaveBeenCalledTimes(1);
      expect(
        must(vi.mocked(userHiddenEntityService.hideEntities).mock.calls[0])[1]
      ).toHaveLength(200);
    });

    it("returns 400 and hides nothing when any entityId is not a numeric Stash id", async () => {
      const req = reqFor(hideEntities, {
        body: {
          entities: [
            { entityType: "scene", entityId: "1", instanceId: "inst-1" },
            {
              entityType: "tag",
              entityId: "1' OR '1'='1",
              instanceId: "inst-1",
            },
          ],
        },
        user: USER,
      });
      const res = resFor(hideEntities);
      await hideEntities(req, res);
      expect(res._getStatus()).toBe(400);
      expect(userHiddenEntityService.hideEntities).not.toHaveBeenCalled();
    });

    it("returns 400 naming a target on an unknown instance, and hides nothing", async () => {
      const req = reqFor(hideEntities, {
        body: {
          entities: [
            { entityType: "scene", entityId: "1", instanceId: "inst-1" },
            { entityType: "scene", entityId: "1", instanceId: "nope" },
          ],
        },
        user: USER,
      });
      const res = resFor(hideEntities);
      await hideEntities(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody()).toEqual({
        error: "entities[1]: Invalid instanceId",
      });
      expect(userHiddenEntityService.hideEntities).not.toHaveBeenCalled();
    });

    it("returns 400 naming a target without an instance, and hides nothing", async () => {
      const req = reqFor(hideEntities, {
        body: malformed({
          entities: [
            { entityType: "scene", entityId: "1", instanceId: "inst-1" },
            { entityType: "scene", entityId: "2" },
          ],
        }),
        user: USER,
      });
      const res = resFor(hideEntities);
      await hideEntities(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody()).toEqual({
        error: "entities[1]: instanceId is required",
      });
      expect(mockVisibleKeys).not.toHaveBeenCalled();
      expect(userHiddenEntityService.hideEntities).not.toHaveBeenCalled();
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
      await authenticated(getUserPermissions)(req, res, vi.fn());
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
      await runRoute(userRoutes, "get", "/:userId/permissions", req, res);
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
      await runRoute(userRoutes, "put", "/:userId/permissions", req, res);
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
      await runRoute(userRoutes, "get", "/:userId/groups", req, res);
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
      await authenticated(getUserStashInstances)(req, res, vi.fn());
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
      await expect(updateUserStashInstances(req, res)).rejects.toMatchObject({
        statusCode: 400,
      });
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
      await authenticated(getSetupStatus)(req, res, vi.fn());
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
      await authenticated(completeSetup)(req, res, vi.fn());
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

  describe("completeSetup selection", () => {
    it("replaces the selection in one transaction, each id once, and rejects a non-string id", async () => {
      mockPrisma.stashInstance.count.mockResolvedValue(3);
      mockPrisma.stashInstance.findMany.mockResolvedValue([
        partialRow({ id: "inst-1" }),
      ]);
      mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });
      const res = resFor(completeSetup);
      await completeSetup(
        reqFor(completeSetup, {
          body: { selectedInstanceIds: ["inst-1", "inst-1"] },
          user: USER,
        }),
        res
      );
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.userStashInstance.createMany).toHaveBeenCalledWith({
        data: [{ userId: USER.id, instanceId: "inst-1" }],
      });

      vi.clearAllMocks();
      await expect(
        completeSetup(
          reqFor(completeSetup, {
            body: malformed({ selectedInstanceIds: [7] }),
            user: USER,
          }),
          resFor(completeSetup)
        )
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
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
      await runRoute(userRoutes, "post", "/:userId/sync-from-stash", req, res);
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
