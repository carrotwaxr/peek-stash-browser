// server/tests/services/MultiInstanceIsolation.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NormalizedScene } from "../../types/index.js";

// ─── Mocks ──────────────────────────────────────────────────────────────────
// Mock prisma before importing service
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    stashPerformer: { findFirst: vi.fn() },
    stashStudio: { findMany: vi.fn() },
    scenePerformer: { findMany: vi.fn(), count: vi.fn() },
    galleryPerformer: { count: vi.fn() },
    stashScene: { findMany: vi.fn() },
    sceneTag: { findMany: vi.fn() },
    performerTag: { findMany: vi.fn() },
    studioTag: { findMany: vi.fn() },
    groupTag: { findMany: vi.fn() },
    sceneGroup: { findMany: vi.fn() },
    sceneGallery: { findMany: vi.fn() },
    imageGallery: { findMany: vi.fn() },
    userExcludedEntity: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    userContentRestriction: { findMany: vi.fn() },
    userHiddenEntity: { findMany: vi.fn() },
    userEntityStats: { upsert: vi.fn() },
    user: { findMany: vi.fn() },
    stashTag: { count: vi.fn() },
    stashGroup: { count: vi.fn() },
    stashGallery: { count: vi.fn() },
    stashImage: { count: vi.fn() },
    stashClip: { count: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    $queryRawUnsafe: vi.fn(),
    $executeRaw: vi.fn(),
  },
}));

// Mock StashInstanceManager
vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    getInstances: vi.fn().mockReturnValue([]),
    getInstance: vi.fn(),
  },
}));

import prisma from "../../prisma/singleton.js";
import { stashEntityService } from "../../services/StashEntityService.js";
import { exclusionComputationService } from "../../services/ExclusionComputationService.js";
import {
  scoreSceneByPreferences,
  PERFORMER_FAVORITE_WEIGHT,
  STUDIO_FAVORITE_WEIGHT,
  type EntityPreferences,
} from "../../services/RecommendationScoringService.js";

const mockPrisma = vi.mocked(prisma);

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

      const performer = await stashEntityService.getPerformer("perf1", "inst-a");

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

    it("returns performer from any instance when no instanceId specified", async () => {
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

      const performer = await stashEntityService.getPerformer("perf1");

      expect(performer).not.toBeNull();
      // Without instanceId, stashInstanceId filter should not be in the query
      expect(mockPrisma.stashPerformer.findFirst).toHaveBeenCalledWith({
        where: {
          id: "perf1",
          deletedAt: null,
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

    beforeEach(() => {
      // Default empty responses for cascade-related queries
      mockPrisma.scenePerformer.findMany.mockResolvedValue([]);
      mockPrisma.stashScene.findMany.mockResolvedValue([]);
      mockPrisma.sceneTag.findMany.mockResolvedValue([]);
      mockPrisma.performerTag.findMany.mockResolvedValue([]);
      mockPrisma.studioTag.findMany.mockResolvedValue([]);
      mockPrisma.groupTag.findMany.mockResolvedValue([]);
      mockPrisma.sceneGroup.findMany.mockResolvedValue([]);
      mockPrisma.sceneGallery.findMany.mockResolvedValue([]);
      mockPrisma.imageGallery.findMany.mockResolvedValue([]);
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
      mockPrisma.userExcludedEntity.upsert.mockResolvedValue({});
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return callback(mockPrisma);
      });
    });

    it("hiding performer from instance A cascades only to instance A scenes", async () => {
      // Performer perf1 in instance A has scenes scene1 and scene2
      // Performer perf1 in instance B has scene3
      // When hiding perf1 from inst-a, only scene1 and scene2 should cascade
      mockPrisma.scenePerformer.findMany.mockResolvedValue([
        { sceneId: "scene1", sceneInstanceId: INST_A, performerId: "perf1" },
        { sceneId: "scene2", sceneInstanceId: INST_A, performerId: "perf1" },
        // scene3 from inst-b should NOT appear because the query filters by performerInstanceId
      ]);

      await exclusionComputationService.addHiddenEntity(1, "performer", "perf1", INST_A);

      // Verify the query included instance filtering
      expect(mockPrisma.scenePerformer.findMany).toHaveBeenCalledWith({
        where: { performerId: "perf1", performerInstanceId: INST_A },
        select: { sceneId: true, sceneInstanceId: true },
      });

      // Verify direct hidden entity upsert includes instanceId
      expect(mockPrisma.userExcludedEntity.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_entityType_entityId_instanceId: {
              userId: 1,
              entityType: "performer",
              entityId: "perf1",
              instanceId: INST_A,
            },
          },
          create: expect.objectContaining({
            instanceId: INST_A,
            reason: "hidden",
          }),
        })
      );

      // Verify cascade exclusion records carry the instance's sceneInstanceId
      expect(mockPrisma.userExcludedEntity.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_entityType_entityId_instanceId: {
              userId: 1,
              entityType: "scene",
              entityId: "scene1",
              instanceId: INST_A,
            },
          },
          create: expect.objectContaining({
            instanceId: INST_A,
            reason: "cascade",
          }),
        })
      );

      // 1 hidden + 2 cascade scenes = 3 upserts
      expect(mockPrisma.userExcludedEntity.upsert).toHaveBeenCalledTimes(3);
    });

    it("hiding performer without instanceId does not filter by instance", async () => {
      // When no instanceId is provided, cascade should NOT filter by instance
      mockPrisma.scenePerformer.findMany.mockResolvedValue([
        { sceneId: "scene1", sceneInstanceId: INST_A, performerId: "perf1" },
        { sceneId: "scene3", sceneInstanceId: INST_B, performerId: "perf1" },
      ]);

      await exclusionComputationService.addHiddenEntity(1, "performer", "perf1");

      // Without instanceId, query should not include instance filter
      expect(mockPrisma.scenePerformer.findMany).toHaveBeenCalledWith({
        where: { performerId: "perf1" },
        select: { sceneId: true, sceneInstanceId: true },
      });

      // Cascade exclusions should have empty instanceId (global)
      expect(mockPrisma.userExcludedEntity.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_entityType_entityId_instanceId: {
              userId: 1,
              entityType: "scene",
              entityId: "scene1",
              instanceId: "",
            },
          },
          create: expect.objectContaining({
            instanceId: "",
            reason: "cascade",
          }),
        })
      );

      // 1 hidden + 2 cascade scenes = 3 upserts
      expect(mockPrisma.userExcludedEntity.upsert).toHaveBeenCalledTimes(3);
    });

    it("hiding studio from instance A cascades only to instance A scenes", async () => {
      mockPrisma.stashScene.findMany.mockResolvedValue([
        { id: "scene1", stashInstanceId: INST_A, studioId: "studio1" },
      ]);

      await exclusionComputationService.addHiddenEntity(1, "studio", "studio1", INST_A);

      // Verify the query included instance + deletedAt filtering
      expect(mockPrisma.stashScene.findMany).toHaveBeenCalledWith({
        where: { studioId: "studio1", stashInstanceId: INST_A, deletedAt: null },
        select: { id: true, stashInstanceId: true },
      });

      // Cascade exclusion record should carry instance A
      expect(mockPrisma.userExcludedEntity.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_entityType_entityId_instanceId: {
              userId: 1,
              entityType: "scene",
              entityId: "scene1",
              instanceId: INST_A,
            },
          },
        })
      );
    });

    it("hiding tag from instance A cascades only within that instance", async () => {
      // Tag -> Scenes direct
      mockPrisma.sceneTag.findMany.mockResolvedValue([
        { sceneId: "scene1", sceneInstanceId: INST_A, tagId: "tag1" },
      ]);
      // Tag -> Scenes inherited
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ id: "scene2" }]);
      // Tag -> Performers
      mockPrisma.performerTag.findMany.mockResolvedValue([
        { performerId: "perf1", performerInstanceId: INST_A, tagId: "tag1" },
      ]);
      // Tag -> Studios
      mockPrisma.studioTag.findMany.mockResolvedValue([]);
      // Tag -> Groups
      mockPrisma.groupTag.findMany.mockResolvedValue([]);

      await exclusionComputationService.addHiddenEntity(1, "tag", "tag1", INST_A);

      // Verify all junction queries include instance filtering
      expect(mockPrisma.sceneTag.findMany).toHaveBeenCalledWith({
        where: { tagId: "tag1", tagInstanceId: INST_A },
        select: { sceneId: true, sceneInstanceId: true },
      });
      expect(mockPrisma.performerTag.findMany).toHaveBeenCalledWith({
        where: { tagId: "tag1", tagInstanceId: INST_A },
        select: { performerId: true, performerInstanceId: true },
      });

      // Inherited tag query should include instance filter in SQL
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining("stashInstanceId = ?"),
        INST_A,
        "tag1"
      );

      // 1 hidden tag + 1 direct scene + 1 inherited scene + 1 performer = 4 upserts
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
