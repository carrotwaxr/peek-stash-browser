// server/tests/services/MultiInstanceIsolation.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import { exclusionComputationService } from "../../services/ExclusionComputationService.js";
import {
  type EntityPreferences,
  PERFORMER_FAVORITE_WEIGHT,
  STUDIO_FAVORITE_WEIGHT,
  scoreSceneByPreferences,
} from "../../services/RecommendationScoringService.js";
import { stashEntityService } from "../../services/StashEntityService.js";
import type { NormalizedScene } from "../../types/index.js";

// ─── Mocks ──────────────────────────────────────────────────────────────────
// Mock prisma before importing service
vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

// Mock UserInstanceService: the exclusion compute resolves hides on the
// user's allowed instances
vi.mock("../../services/UserInstanceService.js", () => ({
  getUserAllowedInstanceIds: vi.fn().mockResolvedValue(["inst-a", "inst-b"]),
  buildInstanceFilterClause: vi
    .fn()
    .mockImplementation((ids: string[], col: string = "s.stashInstanceId") => {
      if (ids.length === 0) return { sql: "1 = 0", params: [] };
      const placeholders = ids.map(() => "?").join(", ");
      return { sql: `${col} IN (${placeholders})`, params: ids };
    }),
}));

// Mock StashInstanceManager
vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    getInstances: vi.fn().mockReturnValue([]),
    getInstance: vi.fn(),
  },
}));

const mockPrisma = vi.mocked(prisma, true);

const createEmptyPrefs = (): EntityPreferences => ({
  favoritePerformers: new Set(),
  highlyRatedPerformers: new Set(),
  favoriteStudios: new Set(),
  highlyRatedStudios: new Set(),
  favoriteTags: new Set(),
  highlyRatedTags: new Set(),
  derivedPerformerWeights: new Map(),
  derivedStudioWeights: new Map(),
  derivedTagWeights: new Map(),
  implicitPerformerWeights: new Map(),
  implicitStudioWeights: new Map(),
  implicitTagWeights: new Map(),
});

describe("Multi-Instance Isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stashEntityService.invalidateStudioNameCache();
  });

  describe("StashEntityService.getPerformer with instanceId", () => {
    it("returns the correct performer when same ID exists in two instances", async () => {
      // Instance A has performer "perf1" named "Alice"
      mockPrisma.stashPerformer.findFirst.mockResolvedValue({
        id: "perf1",
        stashInstanceId: "inst-a",
        name: "Alice",
        disambiguation: null,
        url: null,
        gender: null,
        birthdate: null,
        ethnicity: null,
        country: null,
        hair_color: null,
        eye_color: null,
        height_cm: null,
        weight: null,
        measurements: null,
        fake_tits: null,
        career_length: null,
        tattoos: null,
        piercings: null,
        alias_list: "[]",
        details: null,
        death_date: null,
        image_path: null,
        favorite: false,
        rating100: null,
        ignore_auto_tag: false,
        scene_count: 5,
        image_count: 0,
        gallery_count: 0,
        group_count: 0,
        performer_count: 0,
        o_counter: 0,
        tags: undefined,
        stash_ids: "[]",
        created_at: "2024-01-01",
        updated_at: "2024-01-01",
        deletedAt: null,
        circumcised: null,
        penis_length: null,
      } as any);
      mockPrisma.scenePerformer.count.mockResolvedValue(5);
      mockPrisma.galleryPerformer.count.mockResolvedValue(0);
      mockPrisma.$queryRaw.mockResolvedValue([{ count: 0 }]);

      const performer = await stashEntityService.getPerformer(
        "perf1",
        "inst-a"
      );

      expect(performer).not.toBeNull();
      expect(performer!.name).toBe("Alice");
      expect(performer!.instanceId).toBe("inst-a");

      // Verify the query filtered by instanceId
      expect(mockPrisma.stashPerformer.findFirst).toHaveBeenCalledWith({
        where: {
          id: "perf1",
          deletedAt: null,
          stashInstanceId: "inst-a",
        },
      });
    });

    it("always filters by instanceId when specified (required parameter)", async () => {
      mockPrisma.stashPerformer.findFirst.mockResolvedValue({
        id: "perf1",
        stashInstanceId: "inst-b",
        name: "Bob",
        disambiguation: null,
        url: null,
        gender: null,
        birthdate: null,
        ethnicity: null,
        country: null,
        hair_color: null,
        eye_color: null,
        height_cm: null,
        weight: null,
        measurements: null,
        fake_tits: null,
        career_length: null,
        tattoos: null,
        piercings: null,
        alias_list: "[]",
        details: null,
        death_date: null,
        image_path: null,
        favorite: false,
        rating100: null,
        ignore_auto_tag: false,
        scene_count: 3,
        image_count: 0,
        gallery_count: 0,
        group_count: 0,
        performer_count: 0,
        o_counter: 0,
        tags: undefined,
        stash_ids: "[]",
        created_at: "2024-01-01",
        updated_at: "2024-01-01",
        deletedAt: null,
        circumcised: null,
        penis_length: null,
      } as any);
      mockPrisma.scenePerformer.count.mockResolvedValue(3);
      mockPrisma.galleryPerformer.count.mockResolvedValue(0);
      mockPrisma.$queryRaw.mockResolvedValue([{ count: 0 }]);

      const performer = await stashEntityService.getPerformer(
        "perf1",
        "inst-b"
      );

      expect(performer).not.toBeNull();
      // instanceId is required — query must always include stashInstanceId filter
      expect(mockPrisma.stashPerformer.findFirst).toHaveBeenCalledWith({
        where: {
          id: "perf1",
          deletedAt: null,
          stashInstanceId: "inst-b",
        },
      });
    });
  });

  describe("Studio name map composite keys", () => {
    it("returns correct names when same studio ID has different names across instances", async () => {
      mockPrisma.stashStudio.findMany.mockResolvedValue([
        { id: "studio1", stashInstanceId: "inst-a", name: "Studio Alpha" },
        { id: "studio1", stashInstanceId: "inst-b", name: "Studio Beta" },
      ] as any);

      const nameMap = await stashEntityService.getStudioNameMap();

      // Composite keys should resolve to different names
      expect(nameMap.get("studio1\0inst-a")).toBe("Studio Alpha");
      expect(nameMap.get("studio1\0inst-b")).toBe("Studio Beta");

      // Plain ID lookup returns the first one encountered (backwards compat)
      expect(nameMap.get("studio1")).toBe("Studio Alpha");
    });
  });

  describe("Recommendation scoring composite keys", () => {
    const INST_A = "inst-a";
    const INST_B = "inst-b";

    const sceneFromA = {
      id: "scene1",
      title: "Scene A",
      instanceId: INST_A,
      performers: [{ id: "perf1", name: "Performer 1", tags: [] }],
      studio: { id: "studio1", name: "Studio 1", tags: [] },
      tags: [{ id: "tag1", name: "Tag 1" }],
    } as NormalizedScene;

    const sceneFromB = {
      id: "scene2",
      title: "Scene B",
      instanceId: INST_B,
      performers: [{ id: "perf1", name: "Performer 1", tags: [] }], // same performer ID
      studio: { id: "studio1", name: "Studio 1", tags: [] }, // same studio ID
      tags: [{ id: "tag1", name: "Tag 1" }],
    } as NormalizedScene;

    it("favorite from instance A does not boost scenes from instance B with same performer ID", () => {
      const prefs = createEmptyPrefs();
      // Favorite performer in instance A only
      prefs.favoritePerformers.add(`perf1\0${INST_A}`);

      const scoreA = scoreSceneByPreferences(sceneFromA, prefs);
      const scoreB = scoreSceneByPreferences(sceneFromB, prefs);

      // Scene A should get the performer favorite boost
      expect(scoreA).toBeCloseTo(PERFORMER_FAVORITE_WEIGHT, 2);
      // Scene B should NOT get the boost (different instance)
      expect(scoreB).toBe(0);
    });

    it("favorite studio from instance A does not boost scenes from instance B", () => {
      const prefs = createEmptyPrefs();
      prefs.favoriteStudios.add(`studio1\0${INST_A}`);

      const scoreA = scoreSceneByPreferences(sceneFromA, prefs);
      const scoreB = scoreSceneByPreferences(sceneFromB, prefs);

      expect(scoreA).toBe(STUDIO_FAVORITE_WEIGHT);
      expect(scoreB).toBe(0);
    });

    it("favorites from both instances correctly boost their respective scenes", () => {
      const prefs = createEmptyPrefs();
      prefs.favoritePerformers.add(`perf1\0${INST_A}`);
      prefs.favoritePerformers.add(`perf1\0${INST_B}`);

      const scoreA = scoreSceneByPreferences(sceneFromA, prefs);
      const scoreB = scoreSceneByPreferences(sceneFromB, prefs);

      // Both scenes should get the boost
      expect(scoreA).toBeCloseTo(PERFORMER_FAVORITE_WEIGHT, 2);
      expect(scoreB).toBeCloseTo(PERFORMER_FAVORITE_WEIGHT, 2);
    });
  });

  describe("ExclusionComputationService scoped cascades", () => {
    const INST_A = "inst-a";
    const INST_B = "inst-b";

    /** Route $queryRawUnsafe by SQL shape (resolution, edges); unmatched queries return nothing. */
    function fakeRaw(routes: Array<[RegExp, unknown[]]>) {
      mockPrisma.$queryRawUnsafe.mockImplementation((async (sql: string) => {
        const hit = routes.find(([re]) => re.test(sql));
        return hit ? hit[1] : [];
      }) as any);
    }

    /** The closure loaded into the temp refs table before the edge queries. */
    function refsFill(): string | undefined {
      const call = mockPrisma.$executeRawUnsafe.mock.calls.find((c) =>
        /INSERT OR IGNORE INTO _peek_refs/.test(String(c[0]))
      );
      return call ? String(call[1]) : undefined;
    }

    function upsertKeys(): string[] {
      return mockPrisma.userExcludedEntity.upsert.mock.calls.map((c: any) => {
        const w = c[0].where.userId_entityType_entityId_instanceId;
        return `${w.entityType}:${w.entityId}@${w.instanceId}:${c[0].create.reason}`;
      });
    }

    beforeEach(() => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
      mockPrisma.$executeRawUnsafe.mockResolvedValue(0);
      mockPrisma.userExcludedEntity.upsert.mockResolvedValue({} as any);
      mockPrisma.$transaction.mockImplementation((async (callback: any) => {
        return callback(mockPrisma);
      }) as any);
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

      await exclusionComputationService.addHiddenEntity(
        1,
        "performer",
        "perf1",
        INST_A
      );

      // The resolve query binds the scoped ref, never a bare id
      const resolve = mockPrisma.$queryRawUnsafe.mock.calls.find((c) =>
        /CROSS JOIN StashPerformer t ON/.test(String(c[0]))
      );
      expect(resolve).toBeDefined();
      expect(resolve!.slice(1)).toContain(
        JSON.stringify([{ id: "perf1", iid: INST_A }])
      );
      expect(resolve!.slice(1)).toContain(JSON.stringify([]));
      // The cascade source is the A-scoped ref only
      expect(refsFill()).toBe(JSON.stringify([{ id: "perf1", iid: INST_A }]));

      // Direct hidden row and the two cascades carry instance A; 3 upserts
      expect(new Set(upsertKeys())).toEqual(
        new Set([
          `performer:perf1@${INST_A}:hidden`,
          `scene:scene1@${INST_A}:cascade`,
          `scene:scene2@${INST_A}:cascade`,
        ])
      );
      expect(mockPrisma.userExcludedEntity.upsert).toHaveBeenCalledTimes(3);
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

      await exclusionComputationService.addHiddenEntity(
        1,
        "performer",
        "perf1"
      );

      const resolve = mockPrisma.$queryRawUnsafe.mock.calls.find((c) =>
        /CROSS JOIN StashPerformer t ON/.test(String(c[0]))
      );
      expect(resolve!.slice(1)).toContain(JSON.stringify(["perf1"]));

      // The stored "" row, a hidden row per instance, and scoped cascades
      expect(new Set(upsertKeys())).toEqual(
        new Set([
          "performer:perf1@:hidden",
          `performer:perf1@${INST_A}:hidden`,
          `performer:perf1@${INST_B}:hidden`,
          `scene:scene1@${INST_A}:cascade`,
          `scene:scene3@${INST_B}:cascade`,
        ])
      );
      expect(mockPrisma.userExcludedEntity.upsert).toHaveBeenCalledTimes(5);
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

      await exclusionComputationService.addHiddenEntity(
        1,
        "studio",
        "studio1",
        INST_A
      );

      // The studio edge filters deleted scenes and the allowed instances
      const edge = mockPrisma.$queryRawUnsafe.mock.calls.find((c) =>
        /FROM StashScene x[\s\S]*JOIN _peek_refs r ON r\.id = x\.studioId/.test(
          String(c[0])
        )
      );
      expect(edge).toBeDefined();
      expect(String(edge![0])).toContain("x.deletedAt IS NULL");
      expect(String(edge![0])).toContain("r.inst = x.stashInstanceId");
      expect(edge!.slice(1)).toEqual([INST_A, INST_B]);
      expect(refsFill()).toBe(JSON.stringify([{ id: "studio1", iid: INST_A }]));

      expect(upsertKeys()).toContain(`scene:scene1@${INST_A}:cascade`);
      expect(upsertKeys().some((k) => k.includes(`@${INST_B}:`))).toBe(false);
    });

    it("hiding tag from instance A cascades only within that instance", async () => {
      fakeRaw([
        [/CROSS JOIN StashTag t ON/, [{ id: "tag1", instanceId: INST_A }]],
        [/FROM SceneTag j/, [{ id: "scene1", instanceId: INST_A }]],
        [
          /FROM StashScene s[\s\S]*AND EXISTS \(SELECT 1 FROM json_each\(COALESCE\(s\.inheritedTagIds/,
          [{ id: "scene2", instanceId: INST_A }],
        ],
        [/FROM PerformerTag j/, [{ id: "perf1", instanceId: INST_A }]],
      ]);

      await exclusionComputationService.addHiddenEntity(
        1,
        "tag",
        "tag1",
        INST_A
      );

      // Every edge joins the A-scoped closure; the inherited-tag query binds
      // the allowed instances and the tag id never reaches SQL text
      expect(refsFill()).toBe(JSON.stringify([{ id: "tag1", iid: INST_A }]));
      const inherited = mockPrisma.$queryRawUnsafe.mock.calls.find((c) =>
        /AND EXISTS \(SELECT 1 FROM json_each\(COALESCE\(s\.inheritedTagIds/.test(
          String(c[0])
        )
      );
      expect(inherited).toBeDefined();
      expect(String(inherited![0])).toContain("s.stashInstanceId IN (?, ?)");
      expect(String(inherited![0])).not.toContain("tag1");
      expect(inherited!.slice(1)).toEqual([INST_A, INST_B]);

      // 1 hidden tag + 1 direct scene + 1 inherited scene + 1 performer = 4 upserts
      expect(new Set(upsertKeys())).toEqual(
        new Set([
          `tag:tag1@${INST_A}:hidden`,
          `scene:scene1@${INST_A}:cascade`,
          `scene:scene2@${INST_A}:cascade`,
          `performer:perf1@${INST_A}:cascade`,
        ])
      );
      expect(mockPrisma.userExcludedEntity.upsert).toHaveBeenCalledTimes(4);
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
        scene: sceneMap.get(`${wh.sceneId}\0${wh.instanceId || ""}`) || null,
      }));

      // inst-a scene1 → Scene A
      expect(resolved[0].scene?.title).toBe("Scene A");
      // inst-b scene1 → Scene B (different scene despite same ID)
      expect(resolved[1].scene?.title).toBe("Scene B");
      // inst-a scene2 → Scene C
      expect(resolved[2].scene?.title).toBe("Scene C");
      // inst-b scene2 → null (no scene in inst-b)
      expect(resolved[3].scene).toBeNull();
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
