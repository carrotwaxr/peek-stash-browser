/**
 * Unit tests for UserStatsAggregationService: the statements the stats page
 * sends (every entity looked up by its (id, instance), live, with the
 * viewer's exclusions on its instance and their allowed instances), each
 * sort's order, and how raw rows become the response. The same behaviour
 * against real SQLite is in
 * integration/services/UserStatsAggregationService.integration.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import {
  type TopListSortBy,
  userStatsAggregationService,
} from "../../services/UserStatsAggregationService.js";
import { toProxyUrl } from "../../utils/proxyUrl.js";
import { must } from "../helpers/must.js";
import { prismaImpl } from "../helpers/prismaMock.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

const mockPrisma = vi.mocked(prisma, true);

const USER = 7;
const ALLOWED = ["inst-a", "inst-b"];
const AVERAGE_DURATION = 1000;

/** What each statement answers, by what it reads */
interface Answers {
  performer?: unknown[];
  studio?: unknown[];
  tag?: unknown[];
  topScenes?: unknown[];
  sceneTotals?: unknown[];
  imageTotals?: unknown[];
  mostWatchedScene?: unknown[];
  mostOdScene?: unknown[];
  mostViewedImage?: unknown[];
  mostOdPerformer?: unknown[];
}

const flat = (sql: string) => sql.replace(/\s+/g, " ").trim();

function answer(answers: Answers): void {
  mockPrisma.$queryRawUnsafe.mockImplementation(
    prismaImpl((sql: string, ...params: unknown[]) => {
      const text = flat(sql);
      if (text.includes("FROM UserEntityRanking r")) {
        const type = params.find(
          (p) => p === "performer" || p === "studio" || p === "tag"
        );
        return answers[type as "performer" | "studio" | "tag"] ?? [];
      }
      if (text.startsWith("WITH engaged")) return answers.topScenes ?? [];
      if (text.includes("AS uniqueScenesWatched"))
        return answers.sceneTotals ?? [];
      if (text.includes("AS totalImagesViewed"))
        return answers.imageTotals ?? [];
      if (text.includes("h.playCount AS count"))
        return answers.mostWatchedScene ?? [];
      if (text.includes("h.oCount AS count")) return answers.mostOdScene ?? [];
      if (text.includes("h.viewCount AS count"))
        return answers.mostViewedImage ?? [];
      if (text.includes("h.oCounter AS count"))
        return answers.mostOdPerformer ?? [];
      throw new Error(`unexpected statement: ${text}`);
    })
  );
}

/** Every statement sent, as [flattened sql, ...params] */
function statements(): Array<[string, ...unknown[]]> {
  return mockPrisma.$queryRawUnsafe.mock.calls.map(
    ([sql, ...params]: [string, ...unknown[]]) => [flat(sql), ...params]
  );
}

function statementFor(part: string): [string, ...unknown[]] {
  return must(
    statements().find(([sql]) => sql.includes(part)),
    `the statement with ${part}`
  );
}

const stats = (
  sortBy: TopListSortBy = "engagement",
  allowedInstanceIds: string[] = ALLOWED
) =>
  userStatsAggregationService.getUserStats(USER, {
    sortBy,
    allowedInstanceIds,
  });

describe("UserStatsAggregationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    answer({});
    // The average scene duration, read by RankingComputeService
    mockPrisma.$queryRaw.mockResolvedValue([{ avgDuration: AVERAGE_DURATION }]);
    mockPrisma.userEntityStats.findMany.mockResolvedValue([]);
  });

  describe("lookups", () => {
    it("the top performer is looked up by (id, instance), live, with the viewer's exclusions on its instance and allowed instances", async () => {
      answer({
        performer: [
          {
            id: "12",
            instanceId: "inst-b",
            name: "B-12",
            imagePath: "/performer/12/image",
            playCount: 3,
            playDuration: 100.6,
            oCount: 1,
            percentileRank: 100,
          },
        ],
      });

      const { topPerformers } = await stats();

      const [sql, ...params] = statementFor("r.entityType = ?");
      expect(sql).toContain(
        "FROM UserEntityRanking r CROSS JOIN StashPerformer x ON x.id = r.entityId AND x.stashInstanceId = r.instanceId AND x.deletedAt IS NULL"
      );
      expect(sql).toContain(
        "LEFT JOIN UserExcludedEntity e ON e.userId = ? AND e.entityType = 'performer' AND e.entityId = r.entityId AND (e.instanceId = '' OR e.instanceId = r.instanceId)"
      );
      expect(sql).toContain(
        "WHERE r.userId = ? AND r.entityType = ? AND e.id IS NULL AND x.stashInstanceId IN (?, ?)"
      );
      expect(sql).toContain(
        "ORDER BY r.percentileRank DESC, r.entityId, r.instanceId LIMIT ?"
      );
      expect(params).toEqual([USER, USER, "performer", ...ALLOWED, 10]);
      expect(topPerformers).toEqual([
        {
          id: "12",
          instanceId: "inst-b",
          name: "B-12",
          imageUrl: toProxyUrl("/performer/12/image", "inst-b"),
          playCount: 3,
          playDuration: 101,
          oCount: 1,
          score: 100,
        },
      ]);
    });

    it("every statement keeps only live entities on allowed instances with no exclusion row on the entity's instance", async () => {
      await stats();

      // Two totals, top scenes, three top lists, four highlights
      expect(statements()).toHaveLength(10);
      for (const [sql, ...params] of statements()) {
        expect(sql).toMatch(
          /CROSS JOIN Stash\w+ x ON x\.id = \w+\.\w+ AND x\.stashInstanceId = \w+\.instanceId AND x\.deletedAt IS NULL/
        );
        expect(sql).toMatch(
          /\(e\.instanceId = '' OR e\.instanceId = \w+\.instanceId\)/
        );
        expect(sql).toContain("e.id IS NULL AND x.stashInstanceId IN (?, ?)");
        expect(params).toEqual(expect.arrayContaining(ALLOWED));
      }
    });

    it("with no allowed instance every statement matches nothing", async () => {
      await stats("engagement", []);

      for (const [sql] of statements()) {
        expect(sql).toContain("e.id IS NULL AND 1 = 0");
      }
    });
  });

  describe("sorts", () => {
    it.each([
      ["engagement", "r.percentileRank", "engagement"],
      ["oCount", "r.oCount", "oCount"],
      ["playCount", "r.playCount", "playCount"],
    ] as const)(
      "%s orders the rankings by %s and the scenes by %s",
      async (sortBy, rankingColumn, sceneColumn) => {
        await stats(sortBy);

        for (const type of ["performer", "studio", "tag"]) {
          const [sql] = must(
            statements().find(
              ([text, ...params]) =>
                text.includes("FROM UserEntityRanking r") &&
                params.includes(type)
            ),
            `the ${type} top list`
          );
          expect(sql).toContain(
            `ORDER BY ${rankingColumn} DESC, r.entityId, r.instanceId LIMIT ?`
          );
        }
        const [scenes] = statementFor("WITH engaged");
        expect(scenes).toContain(
          `SELECT * FROM ranked ORDER BY ${sceneColumn} DESC, id, instanceId LIMIT ?`
        );
        expect(scenes).toContain(
          `ORDER BY top.${sceneColumn} DESC, top.id, top.instanceId`
        );
      }
    );
  });

  describe("top scenes", () => {
    it("rank every engaged scene by the ranking weights, and take the percentile from the scene's rank", async () => {
      const scene = (id: string, position: bigint, total: bigint) => ({
        id,
        instanceId: "inst-a",
        title: `Scene ${id}`,
        filePath: `/scenes/${id}.mp4`,
        imagePath: `/scene/${id}/screenshot`,
        playCount: 2,
        oCount: 1,
        playDuration: 599.5,
        position,
        total,
      });
      // Two tied at the top, one last, of three
      answer({
        topScenes: [scene("1", 1n, 3n), scene("2", 1n, 3n), scene("3", 3n, 3n)],
      });

      const { topScenes } = await stats();

      const [sql, ...params] = statementFor("WITH engaged");
      expect(sql).toContain(
        "w.oCount * ? + w.playDuration / ? * ? + w.playCount * ? AS engagement"
      );
      expect(sql).toContain(
        "FROM WatchHistory w CROSS JOIN StashScene x ON x.id = w.sceneId AND x.stashInstanceId = w.instanceId AND x.deletedAt IS NULL"
      );
      expect(sql).toContain(
        "AND (w.playCount > 0 OR w.oCount > 0 OR w.playDuration > 0)"
      );
      expect(sql).toContain(
        "RANK() OVER (ORDER BY engagement DESC) AS position, COUNT(*) OVER () AS total"
      );
      // Weights (O, duration over the average, plays), then the joins' and
      // the conditions' parameters, then the limit
      expect(params).toEqual([
        5,
        AVERAGE_DURATION,
        1,
        1,
        USER,
        USER,
        ...ALLOWED,
        10,
      ]);
      expect(topScenes.map((s) => [s.id, s.score])).toEqual([
        ["1", 100],
        ["2", 100],
        ["3", 0],
      ]);
      expect(must(topScenes[0])).toEqual({
        id: "1",
        instanceId: "inst-a",
        title: "Scene 1",
        filePath: "/scenes/1.mp4",
        imageUrl: toProxyUrl("/scene/1/screenshot", "inst-a"),
        playCount: 2,
        playDuration: 600,
        oCount: 1,
        score: 100,
      });
    });

    it("a scene ranked alone has percentile 0, as a stored ranking alone does", async () => {
      answer({
        topScenes: [
          {
            id: "1",
            instanceId: "inst-a",
            title: null,
            filePath: null,
            imagePath: null,
            playCount: 1,
            oCount: 0,
            playDuration: 10,
            position: 1,
            total: 1,
          },
        ],
      });

      const { topScenes } = await stats();

      expect(topScenes.map((s) => [s.score, s.imageUrl])).toEqual([[0, null]]);
    });
  });

  describe("totals", () => {
    it("sum the visible scenes and images, bigint sums as numbers, image Os added to scene Os", async () => {
      answer({
        sceneTotals: [
          {
            totalWatchTime: 250.5,
            totalPlayCount: 3n,
            totalOCount: 2n,
            uniqueScenesWatched: 2n,
          },
        ],
        imageTotals: [{ totalImagesViewed: 1n, imageOCount: 4n }],
      });

      const { engagement } = await stats();

      expect(engagement).toEqual({
        totalWatchTime: 250.5,
        totalPlayCount: 3,
        totalOCount: 6,
        totalImagesViewed: 1,
        uniqueScenesWatched: 2,
      });
      // One row per (scene, instance) the viewer watched: two servers'
      // same id count twice
      const [scenes] = statementFor("AS uniqueScenesWatched");
      expect(scenes).toContain("COUNT(*) AS uniqueScenesWatched");
      const [images] = statementFor("AS totalImagesViewed");
      expect(images).toContain(
        "FROM ImageViewHistory iv CROSS JOIN StashImage x ON x.id = iv.imageId AND x.stashInstanceId = iv.instanceId"
      );
    });
  });

  describe("highlights", () => {
    it("name the entity on its own instance, with the source's count", async () => {
      answer({
        mostWatchedScene: [
          {
            id: "5",
            instanceId: "inst-b",
            count: 9,
            title: "Five",
            filePath: "/5.mp4",
            imagePath: "/scene/5/screenshot",
          },
        ],
        mostOdScene: [
          {
            id: "6",
            instanceId: "inst-a",
            count: 4,
            title: null,
            filePath: "/6.mp4",
            imagePath: null,
          },
        ],
        mostViewedImage: [
          {
            id: "8",
            instanceId: "inst-b",
            count: 2,
            title: "Eight",
            filePath: "/8.jpg",
            imagePath: "/image/8/thumbnail",
          },
        ],
        mostOdPerformer: [
          {
            id: "12",
            instanceId: "inst-b",
            count: 3,
            name: "B-12",
            imagePath: "/performer/12/image",
          },
        ],
      });

      const result = await stats();

      expect(result.mostWatchedScene).toEqual({
        id: "5",
        instanceId: "inst-b",
        title: "Five",
        filePath: "/5.mp4",
        imageUrl: toProxyUrl("/scene/5/screenshot", "inst-b"),
        playCount: 9,
      });
      expect(result.mostOdScene).toEqual({
        id: "6",
        instanceId: "inst-a",
        title: null,
        filePath: "/6.mp4",
        imageUrl: null,
        oCount: 4,
      });
      expect(result.mostViewedImage).toEqual({
        id: "8",
        instanceId: "inst-b",
        title: "Eight",
        filePath: "/8.jpg",
        imageUrl: toProxyUrl("/image/8/thumbnail", "inst-b"),
        viewCount: 2,
      });
      expect(result.mostOdPerformer).toEqual({
        id: "12",
        instanceId: "inst-b",
        name: "B-12",
        imageUrl: toProxyUrl("/performer/12/image", "inst-b"),
        oCount: 3,
      });

      const [sql, ...params] = statementFor("h.oCounter AS count");
      expect(sql).toContain(
        "FROM UserPerformerStats h CROSS JOIN StashPerformer x ON x.id = h.performerId AND x.stashInstanceId = h.instanceId AND x.deletedAt IS NULL"
      );
      expect(sql).toContain(
        "WHERE h.userId = ? AND h.oCounter > 0 AND e.id IS NULL"
      );
      expect(sql).toContain(
        "ORDER BY h.oCounter DESC, h.performerId, h.instanceId LIMIT 1"
      );
      expect(params).toEqual([USER, USER, ...ALLOWED]);
    });

    it("are null when the viewer has nothing to show", async () => {
      const result = await stats();

      expect(result.mostWatchedScene).toBeNull();
      expect(result.mostOdScene).toBeNull();
      expect(result.mostViewedImage).toBeNull();
      expect(result.mostOdPerformer).toBeNull();
      expect(result.engagement).toEqual({
        totalWatchTime: 0,
        totalPlayCount: 0,
        totalOCount: 0,
        totalImagesViewed: 0,
        uniqueScenesWatched: 0,
      });
    });
  });

  describe("library", () => {
    it("reads the precomputed visible counts, 0 for a type with none", async () => {
      mockPrisma.userEntityStats.findMany.mockResolvedValue([
        { entityType: "scene", visibleCount: 40 },
        { entityType: "tag", visibleCount: 3 },
      ] as never);

      const { library } = await stats();

      expect(library).toEqual({
        sceneCount: 40,
        performerCount: 0,
        studioCount: 0,
        tagCount: 3,
        galleryCount: 0,
        imageCount: 0,
        clipCount: 0,
      });
    });
  });
});
