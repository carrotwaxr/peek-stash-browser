import type { UserHiddenEntity } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import { resolveVisibleApartFromOwnHides } from "../../services/EntityAccessService.js";
import { exclusionComputationService } from "../../services/ExclusionComputationService.js";
import {
  HIDEABLE_ENTITY_TYPES,
  isHideableEntityType,
  userHiddenEntityService,
} from "../../services/UserHiddenEntityService.js";
import { entityKey } from "../../utils/entityRef.js";
import { objectContaining } from "../helpers/matchers.js";
import { must } from "../helpers/must.js";
import { partialRow, prismaImpl } from "../helpers/prismaMock.js";

// Mock prisma before importing service
vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

// The access check is mocked
vi.mock("../../services/EntityAccessService.js", () => ({
  resolveVisibleApartFromOwnHides: vi.fn(),
}));

// Mock ExclusionComputationService
vi.mock("../../services/ExclusionComputationService.js", () => ({
  exclusionComputationService: {
    addHiddenEntities: vi.fn().mockResolvedValue(undefined),
    recomputeForUser: vi.fn().mockResolvedValue(undefined),
  },
}));

const mockPrisma = vi.mocked(prisma, true);
const mockExclusion = vi.mocked(exclusionComputationService);
const mockResolveVisible = vi.mocked(resolveVisibleApartFromOwnHides);

/** Every ref visible: on its own instance, or "shown-instance" for "". */
function everyRefVisible() {
  mockResolveVisible.mockImplementation((_userId, _type, refs) =>
    Promise.resolve(
      new Map(
        refs.map((r) => [
          entityKey(r.id, r.instanceId),
          r.instanceId || "shown-instance",
        ])
      )
    )
  );
}

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

describe("HIDEABLE_ENTITY_TYPES", () => {
  it("lists the eight types a user can hide (clips included)", () => {
    expect(HIDEABLE_ENTITY_TYPES).toEqual(HIDEABLE_TYPES);
  });

  it.each(HIDEABLE_TYPES)("isHideableEntityType(%j) is true", (type) => {
    expect(isHideableEntityType(type)).toBe(true);
  });

  it.each(["marker", "Scene", "scenes", "", "toString"])(
    "isHideableEntityType(%j) is false",
    (type) => {
      expect(isHideableEntityType(type)).toBe(false);
    }
  );

  // One row per case: it.each spreads an array row into arguments
  it.each([[undefined], [null], [1], [["scene"]], [{ scene: true }]])(
    "isHideableEntityType(%j), not a string, is false",
    (value: unknown) => {
      expect(isHideableEntityType(value)).toBe(false);
    }
  );
});

describe("UserHiddenEntityService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── hideEntity ───────────────────────────────────────────────────

  describe("hideEntity", () => {
    it("hides one target through addHiddenEntities, the row and its exclusions together", async () => {
      await userHiddenEntityService.hideEntity(5, "studio", "10", "inst-b");

      expect(mockExclusion.addHiddenEntities).toHaveBeenCalledExactlyOnceWith(
        5,
        [{ entityType: "studio", entityId: "10", instanceId: "inst-b" }]
      );
      // The service writes no row of its own
      expect(mockPrisma.userHiddenEntity.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.userHiddenEntity.create).not.toHaveBeenCalled();
    });

    it("defaults instanceId to empty string when not provided", async () => {
      await userHiddenEntityService.hideEntity(5, "tag", "3");

      expect(mockExclusion.addHiddenEntities).toHaveBeenCalledWith(5, [
        { entityType: "tag", entityId: "3", instanceId: "" },
      ]);
    });

    it("rejects when the write fails", async () => {
      mockExclusion.addHiddenEntities.mockRejectedValueOnce(
        new Error("merge failed")
      );

      await expect(
        userHiddenEntityService.hideEntity(1, "scene", "1", "inst")
      ).rejects.toThrow("merge failed");
    });
  });

  // ─── hideEntities ─────────────────────────────────────────────────

  describe("hideEntities", () => {
    it("hides every target with one addHiddenEntities call", async () => {
      const targets = [
        { entityType: "scene" as const, entityId: "1", instanceId: "inst" },
        { entityType: "performer" as const, entityId: "2", instanceId: "" },
        { entityType: "image" as const, entityId: "3", instanceId: "inst" },
      ];

      await userHiddenEntityService.hideEntities(4, targets);

      expect(mockExclusion.addHiddenEntities).toHaveBeenCalledExactlyOnceWith(
        4,
        targets
      );
    });
  });

  // ─── unhideEntity ─────────────────────────────────────────────────

  describe("unhideEntity", () => {
    it("deletes the hidden entity record with correct filters", async () => {
      mockPrisma.userHiddenEntity.deleteMany.mockResolvedValue({ count: 1 });

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
      mockPrisma.userHiddenEntity.deleteMany.mockResolvedValue({ count: 1 });

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

    it("resolves only after the user's recompute, which runs after the delete", async () => {
      const order: string[] = [];
      mockPrisma.userHiddenEntity.deleteMany.mockImplementation(
        prismaImpl(() => {
          order.push("delete");
          return { count: 1 };
        })
      );
      let finishRecompute!: () => void;
      mockExclusion.recomputeForUser.mockImplementationOnce(() => {
        order.push("recompute");
        return new Promise<void>((resolve) => {
          finishRecompute = resolve;
        });
      });

      let resolved = false;
      const unhide = userHiddenEntityService
        .unhideEntity(3, "tag", "8", "inst-c")
        .then(() => {
          resolved = true;
        });
      await vi.waitFor(() => {
        expect(order).toEqual(["delete", "recompute"]);
      });
      expect(resolved).toBe(false);

      finishRecompute();
      await unhide;
      expect(resolved).toBe(true);
      expect(mockExclusion.recomputeForUser).toHaveBeenCalledExactlyOnceWith(3);
    });

    it("rejects when the recompute fails", async () => {
      mockPrisma.userHiddenEntity.deleteMany.mockResolvedValue({ count: 1 });
      mockExclusion.recomputeForUser.mockRejectedValueOnce(
        new Error("recompute failed")
      );

      await expect(
        userHiddenEntityService.unhideEntity(3, "tag", "8", "inst-c")
      ).rejects.toThrow("recompute failed");
    });
  });

  // ─── unhideAll ────────────────────────────────────────────────────

  describe("unhideAll", () => {
    it("deletes all hidden entities for a user and returns the count", async () => {
      mockPrisma.userHiddenEntity.deleteMany.mockResolvedValue({ count: 5 });

      const result = await userHiddenEntityService.unhideAll(1);

      expect(mockPrisma.userHiddenEntity.deleteMany).toHaveBeenCalledWith({
        where: { userId: 1 },
      });
      expect(result).toBe(5);
    });

    it("filters by entityType when provided", async () => {
      mockPrisma.userHiddenEntity.deleteMany.mockResolvedValue({ count: 2 });

      const result = await userHiddenEntityService.unhideAll(1, "performer");

      expect(mockPrisma.userHiddenEntity.deleteMany).toHaveBeenCalledWith({
        where: { userId: 1, entityType: "performer" },
      });
      expect(result).toBe(2);
    });

    it("triggers full recompute when entities were actually unhidden", async () => {
      mockPrisma.userHiddenEntity.deleteMany.mockResolvedValue({ count: 3 });

      await userHiddenEntityService.unhideAll(4);

      expect(mockExclusion.recomputeForUser).toHaveBeenCalledWith(4);
    });

    it("does NOT trigger recompute when no entities were unhidden", async () => {
      mockPrisma.userHiddenEntity.deleteMany.mockResolvedValue({ count: 0 });

      await userHiddenEntityService.unhideAll(4);

      expect(mockExclusion.recomputeForUser).not.toHaveBeenCalled();
    });
  });

  // ─── getHiddenEntities ────────────────────────────────────────────

  describe("getHiddenEntities", () => {
    const PAGE = { entityType: undefined, page: 1, perPage: 50 };

    const hidden = (
      id: number,
      entityType: string,
      entityId: string,
      instanceId: string
    ) =>
      partialRow<UserHiddenEntity>({
        id,
        userId: 1,
        entityType,
        entityId,
        instanceId,
        hiddenAt: new Date(Date.UTC(2026, 0, id)),
      });

    /** The summary statement's rows for the refs it was given */
    function summaryRowsFor(
      rows: (refs: Array<[string, string]>) => Array<Record<string, unknown>>
    ) {
      mockPrisma.$queryRawUnsafe.mockImplementation((_sql, ...params) => {
        const refs = JSON.parse(String(params[0])) as Array<[string, string]>;
        return Promise.resolve(rows(refs)) as never;
      });
    }

    function groups(counts: Record<string, number>) {
      mockPrisma.userHiddenEntity.groupBy.mockResolvedValue(
        Object.entries(counts).map(([entityType, n]) => ({
          entityType,
          _count: { _all: n },
        })) as never
      );
    }

    beforeEach(() => {
      groups({});
      mockPrisma.userHiddenEntity.findMany.mockResolvedValue([]);
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    });

    it("counts the hideable types in one groupBy and pages the rows newest first", async () => {
      groups({ scene: 120, performer: 3 });

      const result = await userHiddenEntityService.getHiddenEntities(1, {
        entityType: undefined,
        page: 3,
        perPage: 50,
      });

      expect(mockPrisma.userHiddenEntity.groupBy).toHaveBeenCalledWith({
        by: ["entityType"],
        where: { userId: 1, entityType: { in: HIDEABLE_TYPES } },
        _count: { _all: true },
      });
      expect(mockPrisma.userHiddenEntity.findMany).toHaveBeenCalledWith({
        where: { userId: 1, entityType: { in: HIDEABLE_TYPES } },
        orderBy: [{ hiddenAt: "desc" }, { id: "desc" }],
        skip: 100,
        take: 50,
      });
      expect(result.total).toBe(123);
      expect(result.counts).toEqual({
        scene: 120,
        performer: 3,
        studio: 0,
        tag: 0,
        group: 0,
        gallery: 0,
        image: 0,
        clip: 0,
      });
    });

    it("a type narrows the page and the total, not the counts", async () => {
      groups({ scene: 120, performer: 3 });

      const result = await userHiddenEntityService.getHiddenEntities(1, {
        entityType: "performer",
        page: 1,
        perPage: 2,
      });

      expect(mockPrisma.userHiddenEntity.findMany).toHaveBeenCalledWith(
        objectContaining({
          where: { userId: 1, entityType: "performer" },
          skip: 0,
          take: 2,
        })
      );
      expect(result.total).toBe(3);
      expect(result.counts.scene).toBe(120);
    });

    it("checks visibility once per entity type with each row's stored instance", async () => {
      everyRefVisible();
      mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
        hidden(1, "scene", "10", "inst-a"),
        hidden(2, "performer", "20", ""),
        hidden(3, "tag", "30", "inst-b"),
        hidden(4, "scene", "11", ""),
      ]);

      await userHiddenEntityService.getHiddenEntities(7, PAGE);

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

    it("reads each type's summaries in one statement, by the instance each row shows from", async () => {
      everyRefVisible();
      mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
        hidden(1, "scene", "10", "inst-a"),
        hidden(2, "scene", "11", ""),
        hidden(3, "performer", "20", "inst-a"),
      ]);

      await userHiddenEntityService.getHiddenEntities(1, PAGE);

      const calls = mockPrisma.$queryRawUnsafe.mock.calls;
      expect(calls).toHaveLength(2);
      const sceneCall: readonly unknown[] = must(calls[0]);
      const [sceneSql, sceneRefs] = sceneCall;
      expect(sceneSql).toContain("FROM page pg");
      expect(sceneSql).toContain(
        "CROSS JOIN StashScene x ON x.id = pg.pid AND x.stashInstanceId = pg.pinst"
      );
      expect(JSON.parse(String(sceneRefs))).toEqual([
        ["10", "inst-a"],
        ["11", "shown-instance"],
      ]);
      expect(must(calls[1])[0]).toContain("CROSS JOIN StashPerformer x");
    });

    it("names each entity and builds its thumbnail on its own instance", async () => {
      everyRefVisible();
      mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
        hidden(1, "scene", "10", ""),
        hidden(2, "scene", "11", "inst-a"),
      ]);
      summaryRowsFor((refs) =>
        refs.map(([id, instanceId]) => ({
          id,
          instanceId,
          name: id === "10" ? "Scene Ten" : "",
          fallbackA: "/videos/eleven.mp4",
          fallbackB: null,
          imagePath:
            id === "10" ? "/scene/10/screenshot" : "/api/proxy/stash?path=x",
        }))
      );

      const result = await userHiddenEntityService.getHiddenEntities(1, PAGE);

      expect(result.items).toEqual([
        {
          id: 1,
          entityType: "scene",
          entityId: "10",
          instanceId: "",
          hiddenAt: new Date(Date.UTC(2026, 0, 1)).toISOString(),
          restricted: false,
          summary: {
            id: "10",
            instanceId: "shown-instance",
            name: "Scene Ten",
            imageUrl: `/api/proxy/stash?path=${encodeURIComponent("/scene/10/screenshot")}&instanceId=shown-instance`,
          },
        },
        {
          id: 2,
          entityType: "scene",
          entityId: "11",
          instanceId: "inst-a",
          hiddenAt: new Date(Date.UTC(2026, 0, 2)).toISOString(),
          restricted: false,
          // An empty title falls back to the file name; a proxy URL is kept
          summary: {
            id: "11",
            instanceId: "inst-a",
            name: "eleven",
            imageUrl: "/api/proxy/stash?path=x",
          },
        },
      ]);
    });

    it.each([
      ["scene", "StashScene", "x.pathScreenshot"],
      ["performer", "StashPerformer", "x.imagePath"],
      ["studio", "StashStudio", "x.imagePath"],
      ["tag", "StashTag", "x.imagePath"],
      ["group", "StashGroup", "x.frontImagePath"],
      ["gallery", "StashGallery", "x.coverPath"],
      ["image", "StashImage", "x.pathThumbnail"],
    ])("a %s's summary reads %s and its %s", async (type, table, image) => {
      everyRefVisible();
      mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
        hidden(1, type, "1", "i"),
      ]);

      await userHiddenEntityService.getHiddenEntities(1, PAGE);

      const sql = must(mockPrisma.$queryRawUnsafe.mock.calls[0])[0];
      expect(sql).toContain(`CROSS JOIN ${table} x`);
      expect(sql).toContain(`${image} AS imagePath`);
      expect(sql).toContain("x.deletedAt IS NULL");
    });

    it("falls back to a gallery's folder name and an image's file name", async () => {
      everyRefVisible();
      mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
        hidden(1, "gallery", "1", "i"),
        hidden(2, "image", "2", "i"),
      ]);
      summaryRowsFor((refs) =>
        refs.map(([id, instanceId]) => ({
          id,
          instanceId,
          name: null,
          fallbackA: id === "1" ? "/photos/Summer Trip" : "/photos/pic.jpg",
          fallbackB: null,
          imagePath: null,
        }))
      );

      const result = await userHiddenEntityService.getHiddenEntities(1, PAGE);

      expect(result.items.map((i) => i.summary?.name)).toEqual([
        "Summer Trip",
        "pic",
      ]);
      expect(result.items.map((i) => i.summary?.imageUrl)).toEqual([
        null,
        null,
      ]);
    });

    it("returns a row the user may not see as restricted, with no summary and no summary read", async () => {
      mockResolveVisible.mockResolvedValue(new Map());
      mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
        hidden(1, "scene", "99", "i"),
      ]);

      const result = await userHiddenEntityService.getHiddenEntities(1, PAGE);

      expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
      expect(result.items).toEqual([
        {
          id: 1,
          entityType: "scene",
          entityId: "99",
          instanceId: "i",
          hiddenAt: new Date(Date.UTC(2026, 0, 1)).toISOString(),
          restricted: true,
          summary: null,
        },
      ]);
    });

    it("keeps a row whose entity left the cache after the check, as restricted", async () => {
      everyRefVisible();
      mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
        hidden(1, "scene", "99", "i"),
      ]);
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      const result = await userHiddenEntityService.getHiddenEntities(1, PAGE);

      expect(result.items).toEqual([
        objectContaining({ entityId: "99", restricted: true, summary: null }),
      ]);
    });

    it("leaves out a stored row of a type no one can hide, without checking it", async () => {
      everyRefVisible();
      mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
        hidden(1, "marker", "5", "i"),
      ]);

      const result = await userHiddenEntityService.getHiddenEntities(1, PAGE);

      expect(mockResolveVisible).not.toHaveBeenCalled();
      expect(result.items).toEqual([]);
    });

    it("counts no row of a type no one can hide", async () => {
      groups({ scene: 2, marker: 4 });

      const result = await userHiddenEntityService.getHiddenEntities(1, PAGE);

      expect(result.total).toBe(2);
      expect(result.counts).not.toHaveProperty("marker");
    });
  });

  // ─── findAlreadyHidden ────────────────────────────────────────────

  describe("findAlreadyHidden", () => {
    it("reads the user's hides of the whole batch in one query", async () => {
      mockPrisma.userHiddenEntity.findMany.mockResolvedValue([]);

      await userHiddenEntityService.findAlreadyHidden(1, [
        { entityType: "scene", entityId: "42", instanceId: "A" },
        { entityType: "tag", entityId: "42", instanceId: "" },
        { entityType: "scene", entityId: "43", instanceId: "" },
      ]);

      expect(mockPrisma.userHiddenEntity.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.userHiddenEntity.findMany).toHaveBeenCalledWith({
        where: { userId: 1, entityId: { in: ["42", "43"] } },
        select: { entityType: true, entityId: true, instanceId: true },
      });
    });

    it("an instance matches its own hide or one stored for every instance; no instance matches any hide", async () => {
      mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
        partialRow({ entityType: "scene", entityId: "1", instanceId: "" }),
        partialRow({ entityType: "scene", entityId: "2", instanceId: "A" }),
        partialRow({ entityType: "scene", entityId: "3", instanceId: "B" }),
        partialRow({ entityType: "tag", entityId: "4", instanceId: "A" }),
      ]);

      const hidden = await userHiddenEntityService.findAlreadyHidden(1, [
        { entityType: "scene", entityId: "1", instanceId: "A" }, // "" covers A
        { entityType: "scene", entityId: "2", instanceId: "A" }, // same instance
        { entityType: "scene", entityId: "2", instanceId: "" }, // any hide
        { entityType: "scene", entityId: "3", instanceId: "A" }, // other instance
        { entityType: "scene", entityId: "4", instanceId: "" }, // other type
        { entityType: "scene", entityId: "5", instanceId: "" }, // not hidden
      ]);

      expect(hidden).toEqual([true, true, true, false, false, false]);
    });

    it("returns [] without a query for no targets", async () => {
      await expect(
        userHiddenEntityService.findAlreadyHidden(1, [])
      ).resolves.toEqual([]);
      expect(mockPrisma.userHiddenEntity.findMany).not.toHaveBeenCalled();
    });
  });
});
