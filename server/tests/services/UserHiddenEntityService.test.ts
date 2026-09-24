import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import {
  entityRefKey,
  resolveVisibleApartFromOwnHides,
} from "../../services/EntityAccessService.js";
import { exclusionComputationService } from "../../services/ExclusionComputationService.js";
import { stashEntityService } from "../../services/StashEntityService.js";
import { userHiddenEntityService } from "../../services/UserHiddenEntityService.js";
import type { EntityType } from "../../services/UserHiddenEntityService.js";

// Mock prisma before importing service
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    userHiddenEntity: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

// The access check is mocked; entityRefKey stays real
vi.mock("../../services/EntityAccessService.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../services/EntityAccessService.js")
  >("../../services/EntityAccessService.js");
  return {
    entityRefKey: actual.entityRefKey,
    resolveVisibleApartFromOwnHides: vi.fn(),
  };
});

// Mock ExclusionComputationService
vi.mock("../../services/ExclusionComputationService.js", () => ({
  exclusionComputationService: {
    addHiddenEntity: vi.fn().mockResolvedValue(undefined),
    removeHiddenEntity: vi.fn(),
    recomputeForUser: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock StashEntityService
vi.mock("../../services/StashEntityService.js", () => ({
  stashEntityService: {
    getScene: vi.fn(),
    getPerformer: vi.fn(),
    getStudio: vi.fn(),
    getTag: vi.fn(),
    getGroup: vi.fn(),
    getGallery: vi.fn(),
    getImage: vi.fn(),
  },
}));

const mockPrisma = vi.mocked(prisma);
const mockExclusion = vi.mocked(exclusionComputationService);
const mockEntity = vi.mocked(stashEntityService);
const mockResolveVisible = vi.mocked(resolveVisibleApartFromOwnHides);

/** Every ref visible: on its own instance, or "shown-instance" for "". */
function everyRefVisible() {
  mockResolveVisible.mockImplementation(async (_userId, _type, refs) => {
    return new Map(
      refs.map((r) => [
        entityRefKey(r.id, r.instanceId),
        r.instanceId || "shown-instance",
      ])
    );
  });
}

describe("UserHiddenEntityService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear internal cache between tests
    userHiddenEntityService.clearAllCache();
  });

  // ─── hideEntity ───────────────────────────────────────────────────

  describe("hideEntity", () => {
    it("upserts the hidden entity record with correct composite key", async () => {
      (
        mockPrisma.userHiddenEntity.upsert as ReturnType<typeof vi.fn>
      ).mockResolvedValue({});

      await userHiddenEntityService.hideEntity(1, "scene", "42", "inst-a");

      expect(mockPrisma.userHiddenEntity.upsert).toHaveBeenCalledWith({
        where: {
          userId_entityType_entityId_instanceId: {
            userId: 1,
            entityType: "scene",
            entityId: "42",
            instanceId: "inst-a",
          },
        },
        create: {
          userId: 1,
          entityType: "scene",
          entityId: "42",
          instanceId: "inst-a",
        },
        update: {
          hiddenAt: expect.any(Date),
        },
      });
    });

    it("defaults instanceId to empty string when not provided", async () => {
      (
        mockPrisma.userHiddenEntity.upsert as ReturnType<typeof vi.fn>
      ).mockResolvedValue({});

      await userHiddenEntityService.hideEntity(1, "performer", "7");

      expect(mockPrisma.userHiddenEntity.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_entityType_entityId_instanceId: {
              userId: 1,
              entityType: "performer",
              entityId: "7",
              instanceId: "",
            },
          },
        })
      );
    });

    it("triggers exclusion computation with correct arguments", async () => {
      (
        mockPrisma.userHiddenEntity.upsert as ReturnType<typeof vi.fn>
      ).mockResolvedValue({});

      await userHiddenEntityService.hideEntity(5, "studio", "10", "inst-b");

      expect(mockExclusion.addHiddenEntity).toHaveBeenCalledWith(
        5,
        "studio",
        "10",
        "inst-b"
      );
    });

    it("passes empty instanceId to exclusion computation when not provided", async () => {
      (
        mockPrisma.userHiddenEntity.upsert as ReturnType<typeof vi.fn>
      ).mockResolvedValue({});

      await userHiddenEntityService.hideEntity(5, "tag", "3");

      expect(mockExclusion.addHiddenEntity).toHaveBeenCalledWith(
        5,
        "tag",
        "3",
        ""
      );
    });

    it("invalidates the cached hidden IDs for the user", async () => {
      (
        mockPrisma.userHiddenEntity.upsert as ReturnType<typeof vi.fn>
      ).mockResolvedValue({});

      // Prime the cache
      (
        mockPrisma.userHiddenEntity.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([]);
      await userHiddenEntityService.getHiddenEntityIds(1);
      expect(mockPrisma.userHiddenEntity.findMany).toHaveBeenCalledTimes(1);

      // hideEntity should invalidate cache
      await userHiddenEntityService.hideEntity(1, "scene", "1", "");

      // Next call should hit DB again
      await userHiddenEntityService.getHiddenEntityIds(1);
      expect(mockPrisma.userHiddenEntity.findMany).toHaveBeenCalledTimes(2);
    });

    it("works for all entity types", async () => {
      (
        mockPrisma.userHiddenEntity.upsert as ReturnType<typeof vi.fn>
      ).mockResolvedValue({});

      const types: EntityType[] = [
        "scene",
        "performer",
        "studio",
        "tag",
        "group",
        "gallery",
        "image",
      ];
      for (const type of types) {
        await userHiddenEntityService.hideEntity(1, type, "1", "inst");
      }

      expect(mockPrisma.userHiddenEntity.upsert).toHaveBeenCalledTimes(
        types.length
      );
      expect(mockExclusion.addHiddenEntity).toHaveBeenCalledTimes(types.length);
    });
  });

  // ─── unhideEntity ─────────────────────────────────────────────────

  describe("unhideEntity", () => {
    it("deletes the hidden entity record with correct filters", async () => {
      (
        mockPrisma.userHiddenEntity.deleteMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ count: 1 });

      await userHiddenEntityService.unhideEntity(
        2,
        "performer",
        "15",
        "inst-a"
      );

      expect(mockPrisma.userHiddenEntity.deleteMany).toHaveBeenCalledWith({
        where: {
          userId: 2,
          entityType: "performer",
          entityId: "15",
          instanceId: "inst-a",
        },
      });
    });

    it("defaults instanceId to empty string when not provided", async () => {
      (
        mockPrisma.userHiddenEntity.deleteMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ count: 1 });

      await userHiddenEntityService.unhideEntity(2, "scene", "5");

      expect(mockPrisma.userHiddenEntity.deleteMany).toHaveBeenCalledWith({
        where: {
          userId: 2,
          entityType: "scene",
          entityId: "5",
          instanceId: "",
        },
      });
    });

    it("triggers removeHiddenEntity on the exclusion service", async () => {
      (
        mockPrisma.userHiddenEntity.deleteMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ count: 1 });

      await userHiddenEntityService.unhideEntity(3, "tag", "8", "inst-c");

      expect(mockExclusion.removeHiddenEntity).toHaveBeenCalledWith(
        3,
        "tag",
        "8",
        "inst-c"
      );
    });

    it("invalidates the cached hidden IDs for the user", async () => {
      (
        mockPrisma.userHiddenEntity.deleteMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ count: 1 });

      // Prime the cache
      (
        mockPrisma.userHiddenEntity.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([{ entityType: "scene", entityId: "1" }]);
      await userHiddenEntityService.getHiddenEntityIds(3);
      expect(mockPrisma.userHiddenEntity.findMany).toHaveBeenCalledTimes(1);

      // unhideEntity should invalidate cache
      await userHiddenEntityService.unhideEntity(3, "scene", "1", "");

      // Next call should hit DB again
      (
        mockPrisma.userHiddenEntity.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([]);
      await userHiddenEntityService.getHiddenEntityIds(3);
      expect(mockPrisma.userHiddenEntity.findMany).toHaveBeenCalledTimes(2);
    });
  });

  // ─── unhideAll ────────────────────────────────────────────────────

  describe("unhideAll", () => {
    it("deletes all hidden entities for a user and returns the count", async () => {
      (
        mockPrisma.userHiddenEntity.deleteMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ count: 5 });

      const result = await userHiddenEntityService.unhideAll(1);

      expect(mockPrisma.userHiddenEntity.deleteMany).toHaveBeenCalledWith({
        where: { userId: 1 },
      });
      expect(result).toBe(5);
    });

    it("filters by entityType when provided", async () => {
      (
        mockPrisma.userHiddenEntity.deleteMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ count: 2 });

      const result = await userHiddenEntityService.unhideAll(1, "performer");

      expect(mockPrisma.userHiddenEntity.deleteMany).toHaveBeenCalledWith({
        where: { userId: 1, entityType: "performer" },
      });
      expect(result).toBe(2);
    });

    it("triggers full recompute when entities were actually unhidden", async () => {
      (
        mockPrisma.userHiddenEntity.deleteMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ count: 3 });

      await userHiddenEntityService.unhideAll(4);

      expect(mockExclusion.recomputeForUser).toHaveBeenCalledWith(4);
    });

    it("does NOT trigger recompute when no entities were unhidden", async () => {
      (
        mockPrisma.userHiddenEntity.deleteMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ count: 0 });

      await userHiddenEntityService.unhideAll(4);

      expect(mockExclusion.recomputeForUser).not.toHaveBeenCalled();
    });

    it("invalidates cache even when count is 0", async () => {
      (
        mockPrisma.userHiddenEntity.deleteMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ count: 0 });

      // Prime cache
      (
        mockPrisma.userHiddenEntity.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([]);
      await userHiddenEntityService.getHiddenEntityIds(4);

      await userHiddenEntityService.unhideAll(4);

      // Cache should be invalidated
      await userHiddenEntityService.getHiddenEntityIds(4);
      expect(mockPrisma.userHiddenEntity.findMany).toHaveBeenCalledTimes(2);
    });
  });

  // ─── getHiddenEntities ────────────────────────────────────────────

  describe("getHiddenEntities", () => {
    const mockHiddenRecords = [
      {
        id: 1,
        entityType: "scene",
        entityId: "10",
        instanceId: "inst-a",
        hiddenAt: new Date("2026-01-01"),
      },
      {
        id: 2,
        entityType: "performer",
        entityId: "20",
        instanceId: "",
        hiddenAt: new Date("2026-01-02"),
      },
      {
        id: 3,
        entityType: "tag",
        entityId: "30",
        instanceId: "inst-b",
        hiddenAt: new Date("2026-01-03"),
      },
    ];

    it("fetches hidden entities ordered by hiddenAt descending", async () => {
      (
        mockPrisma.userHiddenEntity.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([]);

      await userHiddenEntityService.getHiddenEntities(1);

      expect(mockPrisma.userHiddenEntity.findMany).toHaveBeenCalledWith({
        where: { userId: 1 },
        orderBy: { hiddenAt: "desc" },
      });
    });

    it("filters by entityType when provided", async () => {
      (
        mockPrisma.userHiddenEntity.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([]);

      await userHiddenEntityService.getHiddenEntities(1, "scene");

      expect(mockPrisma.userHiddenEntity.findMany).toHaveBeenCalledWith({
        where: { userId: 1, entityType: "scene" },
        orderBy: { hiddenAt: "desc" },
      });
    });

    it("enriches each visible row from the instance the access check resolved", async () => {
      everyRefVisible();
      (
        mockPrisma.userHiddenEntity.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockHiddenRecords);
      (mockEntity.getScene as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "10",
        title: "Scene 10",
      });
      (mockEntity.getPerformer as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "20",
        name: "Performer 20",
      });
      (mockEntity.getTag as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "30",
        name: "Tag 30",
      });

      const result = await userHiddenEntityService.getHiddenEntities(1);

      expect(mockEntity.getScene).toHaveBeenCalledWith("10", "inst-a");
      // A hide stored for every instance shows the instance that was resolved
      expect(mockEntity.getPerformer).toHaveBeenCalledWith(
        "20",
        "shown-instance"
      );
      expect(mockEntity.getTag).toHaveBeenCalledWith("30", "inst-b");
      expect(result).toHaveLength(3);
      expect(result[0]).toMatchObject({
        entityId: "10",
        restricted: false,
        entity: { id: "10", title: "Scene 10" },
      });
    });

    it("checks visibility once per entity type with each row's stored instance", async () => {
      everyRefVisible();
      (
        mockPrisma.userHiddenEntity.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        ...mockHiddenRecords,
        {
          id: 4,
          entityType: "scene",
          entityId: "11",
          instanceId: "",
          hiddenAt: new Date("2026-01-04"),
        },
      ]);

      await userHiddenEntityService.getHiddenEntities(7);

      expect(mockResolveVisible).toHaveBeenCalledTimes(3);
      expect(mockResolveVisible).toHaveBeenCalledWith(7, "scene", [
        { id: "10", instanceId: "inst-a" },
        { id: "11", instanceId: "" },
      ]);
      expect(mockResolveVisible).toHaveBeenCalledWith(7, "performer", [
        { id: "20", instanceId: "" },
      ]);
      expect(mockResolveVisible).toHaveBeenCalledWith(7, "tag", [
        { id: "30", instanceId: "inst-b" },
      ]);
    });

    it("returns a row the user may not see as restricted, without its entity", async () => {
      mockResolveVisible.mockResolvedValue(
        new Map([[entityRefKey("10", "i"), "i"]])
      );
      (
        mockPrisma.userHiddenEntity.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        {
          id: 1,
          entityType: "scene",
          entityId: "10",
          instanceId: "i",
          hiddenAt: new Date("2026-01-01"),
        },
        {
          id: 2,
          entityType: "scene",
          entityId: "99",
          instanceId: "i",
          hiddenAt: new Date("2026-01-02"),
        },
      ]);
      (mockEntity.getScene as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "10",
        title: "Visible",
      });

      const result = await userHiddenEntityService.getHiddenEntities(1);

      expect(mockEntity.getScene).toHaveBeenCalledTimes(1);
      expect(mockEntity.getScene).toHaveBeenCalledWith("10", "i");
      expect(result).toEqual([
        {
          id: 1,
          entityType: "scene",
          entityId: "10",
          instanceId: "i",
          hiddenAt: new Date("2026-01-01"),
          restricted: false,
          entity: { id: "10", title: "Visible" },
        },
        {
          id: 2,
          entityType: "scene",
          entityId: "99",
          instanceId: "i",
          hiddenAt: new Date("2026-01-02"),
          restricted: true,
          entity: null,
        },
      ]);
    });

    it("keeps a row whose entity left the cache, as restricted", async () => {
      everyRefVisible();
      (
        mockPrisma.userHiddenEntity.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        {
          id: 2,
          entityType: "scene",
          entityId: "99",
          instanceId: "i",
          hiddenAt: new Date(),
        },
      ]);
      (mockEntity.getScene as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await userHiddenEntityService.getHiddenEntities(1);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        entityId: "99",
        restricted: true,
        entity: null,
      });
    });

    it("calls the correct StashEntityService method per entity type", async () => {
      everyRefVisible();
      const allTypes = [
        "scene",
        "performer",
        "studio",
        "tag",
        "group",
        "gallery",
        "image",
      ].map((entityType, i) => ({
        id: i + 1,
        entityType,
        entityId: String(i + 1),
        instanceId: "i",
        hiddenAt: new Date(),
      }));
      (
        mockPrisma.userHiddenEntity.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue(allTypes);
      for (const getter of [
        mockEntity.getScene,
        mockEntity.getPerformer,
        mockEntity.getStudio,
        mockEntity.getTag,
        mockEntity.getGroup,
        mockEntity.getGallery,
        mockEntity.getImage,
      ]) {
        (getter as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });
      }

      const result = await userHiddenEntityService.getHiddenEntities(1);

      expect(mockEntity.getScene).toHaveBeenCalledWith("1", "i");
      expect(mockEntity.getPerformer).toHaveBeenCalledWith("2", "i");
      expect(mockEntity.getStudio).toHaveBeenCalledWith("3", "i");
      expect(mockEntity.getTag).toHaveBeenCalledWith("4", "i");
      expect(mockEntity.getGroup).toHaveBeenCalledWith("5", "i");
      expect(mockEntity.getGallery).toHaveBeenCalledWith("6", "i");
      expect(mockEntity.getImage).toHaveBeenCalledWith("7", "i");
      expect(result).toHaveLength(7);
      expect(result.every((r) => r.restricted === false)).toBe(true);
    });

    it("returns instanceId as stored", async () => {
      everyRefVisible();
      (
        mockPrisma.userHiddenEntity.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        {
          id: 1,
          entityType: "scene",
          entityId: "10",
          instanceId: "inst-x",
          hiddenAt: new Date(),
        },
        {
          id: 2,
          entityType: "scene",
          entityId: "11",
          instanceId: "",
          hiddenAt: new Date(),
        },
      ]);
      (mockEntity.getScene as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "10",
      });

      const result = await userHiddenEntityService.getHiddenEntities(1);

      expect(result.map((r) => r.instanceId)).toEqual(["inst-x", ""]);
    });
  });

  // ─── isHiddenByUser ───────────────────────────────────────────────

  describe("isHiddenByUser", () => {
    it("matches the instance or a hide stored for every instance", async () => {
      (
        mockPrisma.userHiddenEntity.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ id: 1 });

      const hidden = await userHiddenEntityService.isHiddenByUser(
        1,
        "scene",
        "42",
        "inst-a"
      );

      expect(hidden).toBe(true);
      expect(mockPrisma.userHiddenEntity.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 1,
          entityType: "scene",
          entityId: "42",
          instanceId: { in: ["inst-a", ""] },
        },
        select: { id: true },
      });
    });

    it("without an instance, matches only a hide stored for every instance", async () => {
      (
        mockPrisma.userHiddenEntity.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      const hidden = await userHiddenEntityService.isHiddenByUser(
        1,
        "tag",
        "7",
        ""
      );

      expect(hidden).toBe(false);
      expect(mockPrisma.userHiddenEntity.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ instanceId: { in: [""] } }),
        })
      );
    });
  });

  // ─── getHiddenEntityIds ───────────────────────────────────────────

  describe("getHiddenEntityIds", () => {
    it("returns Sets organized by entity type", async () => {
      (
        mockPrisma.userHiddenEntity.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        { entityType: "scene", entityId: "1" },
        { entityType: "scene", entityId: "2" },
        { entityType: "performer", entityId: "10" },
        { entityType: "tag", entityId: "5" },
        { entityType: "studio", entityId: "3" },
        { entityType: "group", entityId: "7" },
        { entityType: "gallery", entityId: "11" },
        { entityType: "image", entityId: "15" },
      ]);

      const result = await userHiddenEntityService.getHiddenEntityIds(1);

      expect(result.scenes).toEqual(new Set(["1", "2"]));
      expect(result.performers).toEqual(new Set(["10"]));
      expect(result.tags).toEqual(new Set(["5"]));
      expect(result.studios).toEqual(new Set(["3"]));
      expect(result.groups).toEqual(new Set(["7"]));
      expect(result.galleries).toEqual(new Set(["11"]));
      expect(result.images).toEqual(new Set(["15"]));
    });

    it("returns empty Sets when user has no hidden entities", async () => {
      (
        mockPrisma.userHiddenEntity.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([]);

      const result = await userHiddenEntityService.getHiddenEntityIds(1);

      expect(result.scenes.size).toBe(0);
      expect(result.performers.size).toBe(0);
      expect(result.studios.size).toBe(0);
      expect(result.tags.size).toBe(0);
      expect(result.groups.size).toBe(0);
      expect(result.galleries.size).toBe(0);
      expect(result.images.size).toBe(0);
    });

    it("queries only userId and entityType+entityId columns", async () => {
      (
        mockPrisma.userHiddenEntity.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([]);

      await userHiddenEntityService.getHiddenEntityIds(7);

      expect(mockPrisma.userHiddenEntity.findMany).toHaveBeenCalledWith({
        where: { userId: 7 },
        select: { entityType: true, entityId: true },
      });
    });

    it("caches results and serves from cache on second call", async () => {
      (
        mockPrisma.userHiddenEntity.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([{ entityType: "scene", entityId: "1" }]);

      const result1 = await userHiddenEntityService.getHiddenEntityIds(1);
      const result2 = await userHiddenEntityService.getHiddenEntityIds(1);

      // Only one DB call — second served from cache
      expect(mockPrisma.userHiddenEntity.findMany).toHaveBeenCalledTimes(1);
      expect(result1).toBe(result2); // Same reference
    });

    it("maintains separate caches per user", async () => {
      (mockPrisma.userHiddenEntity.findMany as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([{ entityType: "scene", entityId: "1" }])
        .mockResolvedValueOnce([{ entityType: "performer", entityId: "2" }]);

      const user1 = await userHiddenEntityService.getHiddenEntityIds(1);
      const user2 = await userHiddenEntityService.getHiddenEntityIds(2);

      expect(user1.scenes).toEqual(new Set(["1"]));
      expect(user1.performers.size).toBe(0);
      expect(user2.scenes.size).toBe(0);
      expect(user2.performers).toEqual(new Set(["2"]));
      expect(mockPrisma.userHiddenEntity.findMany).toHaveBeenCalledTimes(2);
    });
  });

  // ─── isEntityHidden ───────────────────────────────────────────────

  describe("isEntityHidden", () => {
    beforeEach(() => {
      (
        mockPrisma.userHiddenEntity.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        { entityType: "scene", entityId: "10" },
        { entityType: "performer", entityId: "20" },
        { entityType: "studio", entityId: "30" },
        { entityType: "tag", entityId: "40" },
        { entityType: "group", entityId: "50" },
        { entityType: "gallery", entityId: "60" },
        { entityType: "image", entityId: "70" },
      ]);
    });

    it("returns true for a hidden scene", async () => {
      expect(
        await userHiddenEntityService.isEntityHidden(1, "scene", "10")
      ).toBe(true);
    });

    it("returns false for a non-hidden scene", async () => {
      expect(
        await userHiddenEntityService.isEntityHidden(1, "scene", "999")
      ).toBe(false);
    });

    it("checks the correct Set for each entity type", async () => {
      expect(
        await userHiddenEntityService.isEntityHidden(1, "performer", "20")
      ).toBe(true);
      expect(
        await userHiddenEntityService.isEntityHidden(1, "studio", "30")
      ).toBe(true);
      expect(await userHiddenEntityService.isEntityHidden(1, "tag", "40")).toBe(
        true
      );
      expect(
        await userHiddenEntityService.isEntityHidden(1, "group", "50")
      ).toBe(true);
      expect(
        await userHiddenEntityService.isEntityHidden(1, "gallery", "60")
      ).toBe(true);
      expect(
        await userHiddenEntityService.isEntityHidden(1, "image", "70")
      ).toBe(true);
    });

    it("returns false for an unknown entity type", async () => {
      expect(
        await userHiddenEntityService.isEntityHidden(
          1,
          "unknown" as EntityType,
          "1"
        )
      ).toBe(false);
    });

    it("leverages the cache (single DB call for multiple checks)", async () => {
      await userHiddenEntityService.isEntityHidden(1, "scene", "10");
      await userHiddenEntityService.isEntityHidden(1, "performer", "20");
      await userHiddenEntityService.isEntityHidden(1, "tag", "40");

      // All checks should use the same cached data
      expect(mockPrisma.userHiddenEntity.findMany).toHaveBeenCalledTimes(1);
    });
  });

  // ─── clearCache / clearAllCache ───────────────────────────────────

  describe("clearCache", () => {
    it("invalidates cache for a specific user", async () => {
      (
        mockPrisma.userHiddenEntity.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([]);

      // Prime caches for two users
      await userHiddenEntityService.getHiddenEntityIds(1);
      await userHiddenEntityService.getHiddenEntityIds(2);
      expect(mockPrisma.userHiddenEntity.findMany).toHaveBeenCalledTimes(2);

      // Clear only user 1
      userHiddenEntityService.clearCache(1);

      // User 1 hits DB again, user 2 still cached
      await userHiddenEntityService.getHiddenEntityIds(1);
      await userHiddenEntityService.getHiddenEntityIds(2);
      expect(mockPrisma.userHiddenEntity.findMany).toHaveBeenCalledTimes(3); // only 1 new call
    });
  });

  describe("clearAllCache", () => {
    it("invalidates cache for all users", async () => {
      (
        mockPrisma.userHiddenEntity.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([]);

      // Prime caches for two users
      await userHiddenEntityService.getHiddenEntityIds(1);
      await userHiddenEntityService.getHiddenEntityIds(2);
      expect(mockPrisma.userHiddenEntity.findMany).toHaveBeenCalledTimes(2);

      // Clear all
      userHiddenEntityService.clearAllCache();

      // Both users should hit DB again
      await userHiddenEntityService.getHiddenEntityIds(1);
      await userHiddenEntityService.getHiddenEntityIds(2);
      expect(mockPrisma.userHiddenEntity.findMany).toHaveBeenCalledTimes(4);
    });
  });
});
