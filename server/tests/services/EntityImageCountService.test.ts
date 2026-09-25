/**
 * Unit tests for EntityImageCountService: which statements a full and a
 * scoped rebuild run and what they bind, and how `countedThrough` reads the
 * links of images and galleries. What the counts come to is pinned against
 * real SQLite in `integration/services/StashSyncService.postSync.integration.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import { entityImageCountService } from "../../services/EntityImageCountService.js";
import { must } from "../helpers/must.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

const mockPrisma = vi.mocked(prisma, true);

const ref = (id: string, instanceId = "a") => ({ id, instanceId });

/** Each $executeRawUnsafe call as [statement, ...params]. */
const executed = () =>
  mockPrisma.$executeRawUnsafe.mock.calls.map(([sql, ...params]) => ({
    sql,
    params,
  }));

describe("EntityImageCountService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$executeRawUnsafe.mockResolvedValue(0);
  });

  describe("rebuildAllImageCounts", () => {
    it("a full rebuild runs one UPDATE per type over every live row", async () => {
      await entityImageCountService.rebuildAllImageCounts();

      const calls = executed();
      expect(calls.map(({ sql }) => /UPDATE (\w+)/.exec(sql)?.[1])).toEqual([
        "StashPerformer",
        "StashStudio",
        "StashTag",
      ]);
      for (const { sql, params } of calls) {
        expect(sql).not.toContain("json_each");
        expect(params).toEqual([]);
      }
    });

    it("a scoped rebuild binds each type's refs once each and skips a type with none", async () => {
      await entityImageCountService.rebuildAllImageCounts({
        performers: [ref("1"), ref("1"), ref("1", "b")],
        studios: [],
        tags: [ref("7")],
      });

      const calls = executed();
      expect(calls).toHaveLength(2);
      const [performers, tags] = [must(calls[0]), must(calls[1])];
      expect(performers.sql).toContain("UPDATE StashPerformer");
      expect(performers.sql).toContain("StashPerformer.rowid IN");
      expect(performers.params).toEqual([
        JSON.stringify([
          ["1", "a"],
          ["1", "b"],
        ]),
      ]);
      expect(tags.sql).toContain("UPDATE StashTag");
      expect(tags.params).toEqual([JSON.stringify([["7", "a"]])]);
    });

    it("an empty scope writes nothing", async () => {
      await entityImageCountService.rebuildAllImageCounts({
        performers: [],
        studios: [],
        tags: [],
      });

      expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
    });
  });

  describe("countedThrough", () => {
    it("reads the images' links, then the links of the given galleries and the images' galleries", async () => {
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([
          { kind: "performer", id: "1", instanceId: "a" },
          { kind: "tag", id: "2", instanceId: "a" },
          { kind: "studio", id: "3", instanceId: "a" },
          { kind: "gallery", id: "10", instanceId: "a" },
        ])
        .mockResolvedValueOnce([
          { kind: "performer", id: "1", instanceId: "a" },
          { kind: "performer", id: "4", instanceId: "a" },
          { kind: "studio", id: "5", instanceId: "a" },
        ]);

      const scope = await entityImageCountService.countedThrough({
        images: [ref("100"), ref("100")],
        galleries: [ref("11")],
      });

      expect(scope).toEqual({
        performers: [ref("1"), ref("4")],
        studios: [ref("3"), ref("5")],
        tags: [ref("2")],
      });
      const [images, galleries] = mockPrisma.$queryRawUnsafe.mock.calls;
      // One JSON parameter per part of each statement
      const imagesJson = JSON.stringify([["100", "a"]]);
      expect(must(images).slice(1)).toEqual(Array(4).fill(imagesJson));
      const galleriesJson = JSON.stringify([
        ["11", "a"],
        ["10", "a"],
      ]);
      expect(must(galleries).slice(1)).toEqual(Array(3).fill(galleriesJson));
    });

    it("reads nothing when given nothing", async () => {
      const scope = await entityImageCountService.countedThrough({
        images: [],
        galleries: [],
      });

      expect(scope).toEqual({ performers: [], studios: [], tags: [] });
      expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });
  });
});
