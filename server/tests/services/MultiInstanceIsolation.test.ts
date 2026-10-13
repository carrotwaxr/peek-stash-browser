// server/tests/services/MultiInstanceIsolation.test.ts
import { DEFAULT_RECOMMENDATION_PREFERENCES } from "@peek/shared-types/recommendationPreferences.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import { exclusionComputationService } from "../../services/ExclusionComputationService.js";
import {
  type AffinityInput,
  LEAD_WEIGHT,
  type RatingRow,
  STUDIO_WEIGHT,
  type ScoringScene,
  TAG_WEIGHT,
  buildEntityAffinity,
  scoreScene,
} from "../../services/RecommendationScoringService.js";
import { must } from "../helpers/must.js";
import { prismaImpl } from "../helpers/prismaMock.js";

// ─── Mocks ──────────────────────────────────────────────────────────────────
// Mock prisma before importing service
vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

// The compute client (hides compute and merge their rows on it) is the same
// mocked prisma
vi.mock(
  "../../prisma/computeClient.js",
  () => import("../helpers/computeClientMock.js")
);

// Mock UserInstanceService: the exclusion compute resolves hides on the
// user's instance scope
vi.mock("../../services/UserInstanceService.js", () => ({
  getUserInstanceScope: vi.fn().mockResolvedValue(["inst-a", "inst-b"]),
}));

// Mock StashInstanceManager
vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    getInstances: vi.fn().mockReturnValue([]),
    getInstance: vi.fn(),
  },
}));

const mockPrisma = vi.mocked(prisma, true);

/** The scene's score with only these affinity inputs */
const scoreWith = (scene: ScoringScene, input: Partial<AffinityInput>) =>
  scoreScene(scene, {
    affinity: buildEntityAffinity({
      performerRatings: [],
      studioRatings: [],
      tagRatings: [],
      ratedScenes: [],
      rankings: [],
      tagParents: new Map(),
      studioParents: new Map(),
      ignoredTags: new Set(),
      ...input,
    }),
    prefs: DEFAULT_RECOMMENDATION_PREFERENCES,
    genders: new Map(),
    tagDf: new Map(),
    sceneCount: 0,
    ignoredTags: new Set(),
  });

const favorite = (id: string, instanceId: string): RatingRow => ({
  id,
  instanceId,
  rating: null,
  favorite: true,
});

describe("Multi-Instance Isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Recommendation scoring composite keys", () => {
    const INST_A = "inst-a";
    const INST_B = "inst-b";

    // The same performer, studio and tag ids on both instances
    const onInstance = (id: string, instanceId: string): ScoringScene => ({
      id,
      instanceId,
      studioId: "studio1",
      performerIds: ["12"],
      tagIds: ["tag1"],
      inheritedTagIds: [],
      oCount: 0,
      kept: false,
      hasHistory: false,
      lastPlayedAt: null,
      rating: null,
      favorite: false,
    });
    const sceneFromA = onInstance("scene1", INST_A);
    const sceneFromB = onInstance("scene2", INST_B);

    it("favoriting performer 12 on A boosts no scene on B", () => {
      const input = { performerRatings: [favorite("12", INST_A)] };

      expect(scoreWith(sceneFromA, input)).toBeCloseTo(LEAD_WEIGHT, 10);
      expect(scoreWith(sceneFromB, input)).toBe(0);
    });

    it("favorite studio from instance A does not boost scenes from instance B", () => {
      const input = { studioRatings: [favorite("studio1", INST_A)] };

      expect(scoreWith(sceneFromA, input)).toBeCloseTo(STUDIO_WEIGHT, 10);
      expect(scoreWith(sceneFromB, input)).toBe(0);
    });

    it("favorites from both instances correctly boost their respective scenes", () => {
      const input = {
        performerRatings: [favorite("12", INST_A), favorite("12", INST_B)],
      };

      expect(scoreWith(sceneFromA, input)).toBeCloseTo(LEAD_WEIGHT, 10);
      expect(scoreWith(sceneFromB, input)).toBeCloseTo(LEAD_WEIGHT, 10);
    });

    it("rated-scene and ranking affinity stay on their instance", () => {
      const input: Partial<AffinityInput> = {
        // A scene on A rated 100: S = 0.25 for its performer, studio and tag
        ratedScenes: [{ ...onInstance("scene0", INST_A), rating: 100 }],
        // Watch history on A likes performer 12 there
        rankings: [
          {
            entityType: "performer",
            entityId: "12",
            instanceId: INST_A,
            affinity: 1,
          },
        ],
      };

      expect(scoreWith(sceneFromA, input)).toBeCloseTo(
        LEAD_WEIGHT * (0.6 * 0.25 + 0.6) +
          STUDIO_WEIGHT * 0.6 * 0.25 +
          TAG_WEIGHT * 0.6 * 0.25,
        10
      );
      expect(scoreWith(sceneFromB, input)).toBe(0);
    });
  });

  describe("ExclusionComputationService scoped cascades", () => {
    const INST_A = "inst-a";
    const INST_B = "inst-b";

    /** Route $queryRawUnsafe by SQL shape (resolution, edges); unmatched queries return nothing. */
    function fakeRaw(routes: Array<[RegExp, unknown[]]>) {
      mockPrisma.$queryRawUnsafe.mockImplementation(
        prismaImpl((sql: string) => {
          const hit = routes.find(([re]) => re.test(sql));
          return hit ? hit[1] : [];
        })
      );
    }

    /** The closure loaded into the temp refs table before the edge queries. */
    function refsFill(): string | undefined {
      const call = mockPrisma.$executeRawUnsafe.mock.calls.find((c) =>
        /INSERT OR IGNORE INTO _peek_refs/.test(c[0])
      );
      return call ? String(call[1]) : undefined;
    }

    /** A row as the _peek_result fill binds it. */
    interface FillRow {
      t: string;
      id: string;
      iid: string;
      r: string;
    }

    /** The rows addHiddenEntities merges (the _peek_result fills), as keys. */
    function mergedKeys(): string[] {
      return mockPrisma.$executeRawUnsafe.mock.calls
        .filter((c) => /INSERT OR IGNORE INTO _peek_result/.test(c[0]))
        .flatMap((c) => JSON.parse(String(c[1])) as FillRow[])
        .map((r) => `${r.t}:${r.id}@${r.iid}:${r.r}`);
    }

    beforeEach(() => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
      mockPrisma.$executeRawUnsafe.mockResolvedValue(0);
    });

    it("hiding performer from instance A cascades only to instance A scenes", async () => {
      // Performer perf1 exists on A and B; the hide names A, so only A's
      // scenes cascade (the resolve is bound with the scoped ref)
      fakeRaw([
        [
          /CROSS JOIN StashPerformer t ON/,
          [{ id: "perf1", instanceId: INST_A }],
        ],
        [
          /FROM ScenePerformer j/,
          [
            { id: "scene1", instanceId: INST_A },
            { id: "scene2", instanceId: INST_A },
          ],
        ],
      ]);

      await exclusionComputationService.addHiddenEntities(1, [
        { entityType: "performer", entityId: "perf1", instanceId: INST_A },
      ]);

      // The resolve query binds the scoped ref, never a bare id
      const resolve = mockPrisma.$queryRawUnsafe.mock.calls.find((c) =>
        /CROSS JOIN StashPerformer t ON/.test(c[0])
      );
      expect(resolve).toBeDefined();
      expect(must(resolve).slice(1)).toContain(
        JSON.stringify([["perf1", INST_A]])
      );
      expect(must(resolve).slice(1)).toContain(JSON.stringify([]));
      // The cascade source is the A-scoped ref only
      expect(refsFill()).toBe(JSON.stringify([["perf1", INST_A]]));

      // Direct hidden row and the two cascades carry instance A; 3 rows
      expect(new Set(mergedKeys())).toEqual(
        new Set([
          `performer:perf1@${INST_A}:hidden`,
          `scene:scene1@${INST_A}:cascade`,
          `scene:scene2@${INST_A}:cascade`,
        ])
      );
      expect(mergedKeys()).toHaveLength(3);
    });

    it("hiding performer without instanceId cascades on every allowed instance", async () => {
      // A "" hide resolves to one ref per allowed instance where the
      // performer exists; each instance's scenes cascade with their own instance
      fakeRaw([
        [
          /CROSS JOIN StashPerformer t ON/,
          [
            { id: "perf1", instanceId: INST_A },
            { id: "perf1", instanceId: INST_B },
          ],
        ],
        [
          /FROM ScenePerformer j/,
          [
            { id: "scene1", instanceId: INST_A },
            { id: "scene3", instanceId: INST_B },
          ],
        ],
      ]);

      await exclusionComputationService.addHiddenEntities(1, [
        { entityType: "performer", entityId: "perf1", instanceId: "" },
      ]);

      const resolve = mockPrisma.$queryRawUnsafe.mock.calls.find((c) =>
        /CROSS JOIN StashPerformer t ON/.test(c[0])
      );
      expect(must(resolve).slice(1)).toContain(JSON.stringify(["perf1"]));

      // The stored "" row, a hidden row per instance, and scoped cascades
      expect(new Set(mergedKeys())).toEqual(
        new Set([
          "performer:perf1@:hidden",
          `performer:perf1@${INST_A}:hidden`,
          `performer:perf1@${INST_B}:hidden`,
          `scene:scene1@${INST_A}:cascade`,
          `scene:scene3@${INST_B}:cascade`,
        ])
      );
      expect(mergedKeys()).toHaveLength(5);
    });

    it("hiding studio from instance A cascades only to instance A scenes", async () => {
      fakeRaw([
        [
          /CROSS JOIN StashStudio t ON/,
          [{ id: "studio1", instanceId: INST_A }],
        ],
        [
          /FROM StashScene x[\s\S]*JOIN _peek_refs r ON r\.id = x\.studioId/,
          [{ id: "scene1", instanceId: INST_A }],
        ],
      ]);

      await exclusionComputationService.addHiddenEntities(1, [
        { entityType: "studio", entityId: "studio1", instanceId: INST_A },
      ]);

      // The studio edge filters deleted scenes and the allowed instances
      const edge = mockPrisma.$queryRawUnsafe.mock.calls.find((c) =>
        /FROM StashScene x[\s\S]*JOIN _peek_refs r ON r\.id = x\.studioId/.test(
          c[0]
        )
      );
      expect(edge).toBeDefined();
      expect(must(edge)[0]).toContain("x.deletedAt IS NULL");
      expect(must(edge)[0]).toContain("r.inst = x.stashInstanceId");
      expect(must(edge).slice(1)).toEqual([INST_A, INST_B]);
      expect(refsFill()).toBe(JSON.stringify([["studio1", INST_A]]));

      expect(mergedKeys()).toContain(`scene:scene1@${INST_A}:cascade`);
      expect(mergedKeys().some((k) => k.includes(`@${INST_B}:`))).toBe(false);
    });

    it("hiding tag from instance A cascades only within that instance", async () => {
      fakeRaw([
        [/CROSS JOIN StashTag t ON/, [{ id: "tag1", instanceId: INST_A }]],
        [/FROM SceneTag j/, [{ id: "scene1", instanceId: INST_A }]],
        [
          /CROSS JOIN SceneInheritedTag it ON it\.tagId = r\.id/,
          [{ id: "scene2", instanceId: INST_A }],
        ],
        [/FROM PerformerTag j/, [{ id: "perf1", instanceId: INST_A }]],
      ]);

      await exclusionComputationService.addHiddenEntities(1, [
        { entityType: "tag", entityId: "tag1", instanceId: INST_A },
      ]);

      // Every edge joins the A-scoped closure; the inherited-tag query binds
      // the allowed instances and the tag id never reaches SQL text
      expect(refsFill()).toBe(JSON.stringify([["tag1", INST_A]]));
      const inherited = mockPrisma.$queryRawUnsafe.mock.calls.find((c) =>
        /CROSS JOIN SceneInheritedTag it ON it\.tagId = r\.id/.test(c[0])
      );
      expect(inherited).toBeDefined();
      expect(must(inherited)[0]).toContain("s.stashInstanceId IN (?, ?)");
      expect(must(inherited)[0]).not.toContain("tag1");
      expect(must(inherited).slice(1)).toEqual([INST_A, INST_B]);

      // 1 hidden tag + 1 direct scene + 1 inherited scene + 1 performer = 4 rows
      expect(new Set(mergedKeys())).toEqual(
        new Set([
          `tag:tag1@${INST_A}:hidden`,
          `scene:scene1@${INST_A}:cascade`,
          `scene:scene2@${INST_A}:cascade`,
          `performer:perf1@${INST_A}:cascade`,
        ])
      );
      expect(mergedKeys()).toHaveLength(4);
    });
  });

  describe("UserStatsService composite key lookup", () => {
    it("composite sceneMap correctly matches watch history entries to instance-specific scenes", () => {
      // Simulate the composite key map pattern from UserStatsService
      const scenes = [
        { id: "scene1", instanceId: "inst-a", title: "Scene A" },
        { id: "scene1", instanceId: "inst-b", title: "Scene B" },
        { id: "scene2", instanceId: "inst-a", title: "Scene C" },
      ];

      const sceneMap = new Map(
        scenes.map((s) => [`${s.id}\0${s.instanceId || ""}`, s])
      );

      const watchHistory = [
        { sceneId: "scene1", instanceId: "inst-a" },
        { sceneId: "scene1", instanceId: "inst-b" },
        { sceneId: "scene2", instanceId: "inst-a" },
        { sceneId: "scene2", instanceId: "inst-b" }, // no matching scene
      ];

      const resolved = watchHistory.map((wh) => ({
        ...wh,
        scene: sceneMap.get(`${wh.sceneId}\0${wh.instanceId || ""}`) ?? null,
      }));

      // inst-a scene1 → Scene A
      expect(must(resolved[0]).scene?.title).toBe("Scene A");
      // inst-b scene1 → Scene B (different scene despite same ID)
      expect(must(resolved[1]).scene?.title).toBe("Scene B");
      // inst-a scene2 → Scene C
      expect(must(resolved[2]).scene?.title).toBe("Scene C");
      // inst-b scene2 → null (no scene in inst-b)
      expect(must(resolved[3]).scene).toBeNull();
    });

    it("plain ID lookup would incorrectly match cross-instance scenes", () => {
      // Demonstrate why composite keys are necessary
      const scenes = [
        { id: "scene1", instanceId: "inst-a", title: "Scene A" },
        { id: "scene1", instanceId: "inst-b", title: "Scene B" },
      ];

      // BAD: plain ID map (would cause cross-instance collision)
      const plainMap = new Map(scenes.map((s) => [s.id, s]));

      // With plain keys, scene1 from inst-a gets overwritten by inst-b
      expect(plainMap.get("scene1")?.title).toBe("Scene B"); // last write wins
      expect(plainMap.size).toBe(1); // Lost inst-a entry!

      // GOOD: composite key map (correctly isolates instances)
      const compositeMap = new Map(
        scenes.map((s) => [`${s.id}\0${s.instanceId}`, s])
      );

      expect(compositeMap.get("scene1\0inst-a")?.title).toBe("Scene A");
      expect(compositeMap.get("scene1\0inst-b")?.title).toBe("Scene B");
      expect(compositeMap.size).toBe(2); // Both entries preserved
    });
  });
});
