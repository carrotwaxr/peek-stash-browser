/**
 * Unit Tests for DataMigrationService
 *
 * Tests the one-time data migration system that runs on server startup.
 * Critical for verifying that migrations like 002_rebuild_stats_multi_instance
 * execute correctly and handle failures properly.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import { entityImageCountService } from "../../services/EntityImageCountService.js";
import { exclusionComputationService } from "../../services/ExclusionComputationService.js";
import { imageGalleryInheritanceService } from "../../services/ImageGalleryInheritanceService.js";
import { linkCountService } from "../../services/LinkCountService.js";
import { sceneTagInheritanceService } from "../../services/SceneTagInheritanceService.js";
import { stashSyncService } from "../../services/StashSyncService.js";
import { userStatsService } from "../../services/UserStatsService.js";
import { objectContaining } from "../helpers/matchers.js";
import { must } from "../helpers/must.js";
import { partialRow, prismaImpl } from "../helpers/prismaMock.js";

// Mock prisma
vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
  },
}));

// Mock UserStatsService
vi.mock("../../services/UserStatsService.js", () => ({
  userStatsService: {
    rebuildAllStatsForUser: vi.fn(),
    rebuildAllStats: vi.fn(),
  },
}));

// Mock ExclusionComputationService (migration 003 recomputes every user)
vi.mock("../../services/ExclusionComputationService.js", () => ({
  exclusionComputationService: {
    recomputeAllUsers: vi.fn(),
  },
}));

// Migration 006 rebuilds what sync derives, whole library
vi.mock("../../services/SceneTagInheritanceService.js", () => ({
  sceneTagInheritanceService: { computeInheritedTags: vi.fn() },
}));
vi.mock("../../services/ImageGalleryInheritanceService.js", () => ({
  imageGalleryInheritanceService: { applyGalleryInheritance: vi.fn() },
}));
vi.mock("../../services/EntityImageCountService.js", () => ({
  entityImageCountService: { rebuildAllImageCounts: vi.fn() },
}));
vi.mock("../../services/LinkCountService.js", () => ({
  linkCountService: { rebuildLinkCounts: vi.fn() },
}));
vi.mock("../../services/StashSyncService.js", () => ({
  stashSyncService: { computeTagSceneCountsViaPerformers: vi.fn() },
}));

const mockPrisma = vi.mocked(prisma, true);
const mockStatsService = vi.mocked(userStatsService);
const mockExclusionService = vi.mocked(exclusionComputationService);
const mockSceneTags = vi.mocked(sceneTagInheritanceService, true);
const mockGalleryInheritance = vi.mocked(imageGalleryInheritanceService, true);
const mockImageCounts = vi.mocked(entityImageCountService, true);
const mockSync = vi.mocked(stashSyncService, true);
const mockLinkCounts = vi.mocked(linkCountService, true);

/** Every migration, in order */
const MIGRATIONS = [
  "001_rebuild_user_stats",
  "002_rebuild_stats_multi_instance",
  "003_recompute_exclusions_restriction_semantics",
  "004_recompute_exclusions_reason_precedence",
  "005_recompute_exclusions_studio_instance",
  "006_rebuild_derived_after_sync_semantics",
  "007_drop_scene_rankings",
  "008_delete_orphaned_user_rows",
  "009_clean_stored_filters",
  "010_rebuild_link_counts",
  "011_recompute_exclusions_content_counts",
];

/** Every migration but the named ones, as applied rows */
const appliedAllBut = (...pending: string[]) =>
  MIGRATIONS.filter((name) => !pending.includes(name)).map((name, i) => ({
    id: i + 1,
    name,
    appliedAt: new Date(),
  }));

/** Every migration applied but 006 */
const APPLIED_BEFORE_006 = appliedAllBut(
  "006_rebuild_derived_after_sync_semantics"
);

describe("DataMigrationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExclusionService.recomputeAllUsers.mockResolvedValue({
      success: 0,
      failed: 0,
      errors: [],
    });
    // Migration 007: no user holds a stored scene ranking
    mockPrisma.$queryRaw.mockResolvedValue([]);
    // Migration 008: no row of a deleted user left
    mockPrisma.$executeRawUnsafe.mockResolvedValue(0);
    // Migration 009: no saved preset or carousel
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.resetModules();
  });

  async function importFresh() {
    const mod = await import("../../services/DataMigrationService.js");
    return mod.dataMigrationService;
  }

  describe("runPendingMigrations", () => {
    it("does nothing when all migrations are already applied", async () => {
      mockPrisma.dataMigration.findMany.mockResolvedValue([
        {
          id: 1,
          name: "001_rebuild_user_stats",
          appliedAt: new Date(),
        },
        {
          id: 2,
          name: "002_rebuild_stats_multi_instance",
          appliedAt: new Date(),
        },
        {
          id: 3,
          name: "003_recompute_exclusions_restriction_semantics",
          appliedAt: new Date(),
        },
        {
          id: 4,
          name: "004_recompute_exclusions_reason_precedence",
          appliedAt: new Date(),
        },
        {
          id: 5,
          name: "005_recompute_exclusions_studio_instance",
          appliedAt: new Date(),
        },
        {
          id: 6,
          name: "006_rebuild_derived_after_sync_semantics",
          appliedAt: new Date(),
        },
        {
          id: 7,
          name: "007_drop_scene_rankings",
          appliedAt: new Date(),
        },
        {
          id: 8,
          name: "008_delete_orphaned_user_rows",
          appliedAt: new Date(),
        },
        {
          id: 9,
          name: "009_clean_stored_filters",
          appliedAt: new Date(),
        },
        {
          id: 10,
          name: "010_rebuild_link_counts",
          appliedAt: new Date(),
        },
        {
          id: 11,
          name: "011_recompute_exclusions_content_counts",
          appliedAt: new Date(),
        },
      ]);

      const { logger } = await import("../../utils/logger.js");
      const service = await importFresh();
      await service.runPendingMigrations();

      expect(logger.info).toHaveBeenCalledWith(
        "[DataMigration] No pending migrations"
      );
      // Should not create any migration records
      expect(mockPrisma.dataMigration.create).not.toHaveBeenCalled();
    });

    it("runs pending migration 001 and marks it applied", async () => {
      // No migrations applied yet
      mockPrisma.dataMigration.findMany.mockResolvedValue([]);
      mockPrisma.dataMigration.create.mockResolvedValue(partialRow({}));

      // Mock 001 dependencies
      mockPrisma.user.findMany.mockResolvedValue([
        partialRow({ id: 1, username: "admin" }),
      ]);
      mockStatsService.rebuildAllStatsForUser.mockResolvedValue();
      mockStatsService.rebuildAllStats.mockResolvedValue();
      mockExclusionService.recomputeAllUsers.mockResolvedValue({
        success: 1,
        failed: 0,
        errors: [],
      });

      const service = await importFresh();
      await service.runPendingMigrations();

      // All ten migrations should be marked as applied
      expect(mockPrisma.dataMigration.create).toHaveBeenCalledTimes(11);
      expect(mockPrisma.dataMigration.create).toHaveBeenCalledWith({
        data: { name: "001_rebuild_user_stats" },
      });
      expect(mockPrisma.dataMigration.create).toHaveBeenCalledWith({
        data: { name: "002_rebuild_stats_multi_instance" },
      });
      expect(mockPrisma.dataMigration.create).toHaveBeenCalledWith({
        data: { name: "003_recompute_exclusions_restriction_semantics" },
      });
      expect(mockPrisma.dataMigration.create).toHaveBeenCalledWith({
        data: { name: "004_recompute_exclusions_reason_precedence" },
      });
      expect(mockPrisma.dataMigration.create).toHaveBeenCalledWith({
        data: { name: "005_recompute_exclusions_studio_instance" },
      });
      expect(mockPrisma.dataMigration.create).toHaveBeenCalledWith({
        data: { name: "006_rebuild_derived_after_sync_semantics" },
      });
      expect(mockPrisma.dataMigration.create).toHaveBeenCalledWith({
        data: { name: "007_drop_scene_rankings" },
      });
      expect(mockPrisma.dataMigration.create).toHaveBeenCalledWith({
        data: { name: "008_delete_orphaned_user_rows" },
      });
      expect(mockPrisma.dataMigration.create).toHaveBeenCalledWith({
        data: { name: "009_clean_stored_filters" },
      });
      expect(mockPrisma.dataMigration.create).toHaveBeenCalledWith({
        data: { name: "010_rebuild_link_counts" },
      });
      expect(mockPrisma.dataMigration.create).toHaveBeenCalledWith({
        data: { name: "011_recompute_exclusions_content_counts" },
      });
    });

    it("skips already-applied migration and only runs pending ones", async () => {
      // 001 already applied, 002 to 011 pending
      mockPrisma.dataMigration.findMany.mockResolvedValue([
        {
          id: 1,
          name: "001_rebuild_user_stats",
          appliedAt: new Date(),
        },
      ]);
      mockPrisma.dataMigration.create.mockResolvedValue(partialRow({}));
      mockStatsService.rebuildAllStats.mockResolvedValue();
      mockExclusionService.recomputeAllUsers.mockResolvedValue({
        success: 0,
        failed: 0,
        errors: [],
      });

      const service = await importFresh();
      await service.runPendingMigrations();

      // 001 is skipped; 002 to 011 are created
      expect(mockPrisma.dataMigration.create).toHaveBeenCalledTimes(10);
      expect(mockPrisma.dataMigration.create).not.toHaveBeenCalledWith({
        data: { name: "001_rebuild_user_stats" },
      });
      expect(mockPrisma.dataMigration.create).toHaveBeenCalledWith({
        data: { name: "002_rebuild_stats_multi_instance" },
      });
      expect(mockPrisma.dataMigration.create).toHaveBeenCalledWith({
        data: { name: "003_recompute_exclusions_restriction_semantics" },
      });
    });

    it("recomputes every user's exclusions in migration 003 (item 13)", async () => {
      mockPrisma.dataMigration.findMany.mockResolvedValue(
        appliedAllBut("003_recompute_exclusions_restriction_semantics")
      );
      mockPrisma.dataMigration.create.mockResolvedValue(partialRow({}));
      mockExclusionService.recomputeAllUsers.mockResolvedValue({
        success: 2,
        failed: 0,
        errors: [],
      });

      const service = await importFresh();
      await service.runPendingMigrations();

      expect(mockExclusionService.recomputeAllUsers).toHaveBeenCalledTimes(1);
      expect(mockPrisma.dataMigration.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.dataMigration.create).toHaveBeenCalledWith({
        data: { name: "003_recompute_exclusions_restriction_semantics" },
      });
    });

    it("recomputes every user's exclusions in migration 004 (reason precedence)", async () => {
      mockPrisma.dataMigration.findMany.mockResolvedValue(
        appliedAllBut("004_recompute_exclusions_reason_precedence")
      );
      mockPrisma.dataMigration.create.mockResolvedValue(partialRow({}));

      const service = await importFresh();
      await service.runPendingMigrations();

      expect(mockExclusionService.recomputeAllUsers).toHaveBeenCalledTimes(1);
      expect(mockPrisma.dataMigration.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.dataMigration.create).toHaveBeenCalledWith({
        data: { name: "004_recompute_exclusions_reason_precedence" },
      });
    });

    it("recomputes every user's exclusions in migration 005 (studio instance of galleries and images)", async () => {
      mockPrisma.dataMigration.findMany.mockResolvedValue(
        appliedAllBut("005_recompute_exclusions_studio_instance")
      );
      mockPrisma.dataMigration.create.mockResolvedValue(partialRow({}));

      const service = await importFresh();
      await service.runPendingMigrations();

      expect(mockExclusionService.recomputeAllUsers).toHaveBeenCalledTimes(1);
      expect(mockPrisma.dataMigration.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.dataMigration.create).toHaveBeenCalledWith({
        data: { name: "005_recompute_exclusions_studio_instance" },
      });
    });

    it("rebuilds what sync derives, whole library, then every user's exclusions, in migration 006", async () => {
      mockPrisma.dataMigration.findMany.mockResolvedValue(APPLIED_BEFORE_006);
      mockPrisma.dataMigration.create.mockResolvedValue(partialRow({}));

      const service = await importFresh();
      await service.runPendingMigrations();

      expect(mockPrisma.dataMigration.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.dataMigration.create).toHaveBeenCalledWith({
        data: { name: "006_rebuild_derived_after_sync_semantics" },
      });
      expect(mockSceneTags.computeInheritedTags).toHaveBeenCalledWith("all");
      expect(
        mockGalleryInheritance.applyGalleryInheritance
      ).toHaveBeenCalledWith("all");
      expect(mockImageCounts.rebuildAllImageCounts).toHaveBeenCalledWith("all");
      expect(mockSync.computeTagSceneCountsViaPerformers).toHaveBeenCalledTimes(
        1
      );
      expect(mockExclusionService.recomputeAllUsers).toHaveBeenCalledTimes(1);
      // In the post-sync steps' order: the counts after the inheritance they
      // count, the recompute last
      const order = [
        mockSceneTags.computeInheritedTags.mock,
        mockGalleryInheritance.applyGalleryInheritance.mock,
        mockImageCounts.rebuildAllImageCounts.mock,
        mockSync.computeTagSceneCountsViaPerformers.mock,
        mockExclusionService.recomputeAllUsers.mock,
      ].map((mock) => must(mock.invocationCallOrder[0]));
      expect(order).toEqual([...order].sort((a, b) => a - b));
    });

    it("does not mark 006 as applied when a rebuild throws", async () => {
      mockPrisma.dataMigration.findMany.mockResolvedValue(APPLIED_BEFORE_006);
      mockImageCounts.rebuildAllImageCounts.mockRejectedValueOnce(
        new Error("counts failed")
      );

      const service = await importFresh();
      await expect(service.runPendingMigrations()).rejects.toThrow(
        "counts failed"
      );
      expect(mockPrisma.dataMigration.create).not.toHaveBeenCalled();
      expect(mockExclusionService.recomputeAllUsers).not.toHaveBeenCalled();
    });

    it("counts every link of the library in migration 010", async () => {
      mockPrisma.dataMigration.findMany.mockResolvedValue(
        appliedAllBut("010_rebuild_link_counts")
      );
      mockPrisma.dataMigration.create.mockResolvedValue(partialRow({}));
      mockLinkCounts.rebuildLinkCounts.mockResolvedValue({});

      const service = await importFresh();
      await service.runPendingMigrations();

      expect(mockLinkCounts.rebuildLinkCounts).toHaveBeenCalledExactlyOnceWith(
        "all"
      );
      expect(mockPrisma.dataMigration.create).toHaveBeenCalledExactlyOnceWith({
        data: { name: "010_rebuild_link_counts" },
      });
    });

    it("recomputes every user's exclusions in migration 011, so the excluded counts per entity exist", async () => {
      mockPrisma.dataMigration.findMany.mockResolvedValue(
        appliedAllBut("011_recompute_exclusions_content_counts")
      );
      mockPrisma.dataMigration.create.mockResolvedValue(partialRow({}));
      mockExclusionService.recomputeAllUsers.mockResolvedValue({
        success: 3,
        failed: 0,
        errors: [],
      });

      const service = await importFresh();
      await service.runPendingMigrations();

      expect(mockExclusionService.recomputeAllUsers).toHaveBeenCalledTimes(1);
      expect(mockLinkCounts.rebuildLinkCounts).not.toHaveBeenCalled();
      expect(mockPrisma.dataMigration.create).toHaveBeenCalledExactlyOnceWith({
        data: { name: "011_recompute_exclusions_content_counts" },
      });
    });

    it("does not mark 010 as applied when the rebuild throws", async () => {
      mockPrisma.dataMigration.findMany.mockResolvedValue(
        appliedAllBut("010_rebuild_link_counts")
      );
      mockLinkCounts.rebuildLinkCounts.mockRejectedValueOnce(
        new Error("counts failed")
      );

      const service = await importFresh();
      await expect(service.runPendingMigrations()).rejects.toThrow(
        "counts failed"
      );
      expect(mockPrisma.dataMigration.create).not.toHaveBeenCalled();
    });

    it("deletes the stored scene rankings in migration 007, one write unit per user", async () => {
      mockPrisma.dataMigration.findMany.mockResolvedValue(
        appliedAllBut("007_drop_scene_rankings")
      );
      mockPrisma.dataMigration.create.mockResolvedValue(partialRow({}));
      mockPrisma.$queryRaw.mockResolvedValue([{ userId: 1 }, { userId: 4 }]);
      mockPrisma.userEntityRanking.deleteMany.mockResolvedValue({ count: 5 });

      const service = await importFresh();
      await service.runPendingMigrations();

      expect(mockPrisma.userEntityRanking.deleteMany.mock.calls).toEqual([
        [{ where: { userId: 1, entityType: "scene" } }],
        [{ where: { userId: 4, entityType: "scene" } }],
      ]);
      expect(mockPrisma.dataMigration.create).toHaveBeenCalledExactlyOnceWith({
        data: { name: "007_drop_scene_rankings" },
      });
    });

    it("does not mark 007 as applied when a delete throws", async () => {
      mockPrisma.dataMigration.findMany.mockResolvedValue(
        appliedAllBut("007_drop_scene_rankings")
      );
      mockPrisma.$queryRaw.mockResolvedValue([{ userId: 1 }]);
      mockPrisma.userEntityRanking.deleteMany.mockRejectedValue(
        new Error("disk I/O error")
      );

      const service = await importFresh();
      await expect(service.runPendingMigrations()).rejects.toThrow(
        "disk I/O error"
      );
      expect(mockPrisma.dataMigration.create).not.toHaveBeenCalled();
    });

    it("deletes the rows of users that no longer exist in migration 008, table by table, a chunk a unit until one comes back short", async () => {
      mockPrisma.dataMigration.findMany.mockResolvedValue(
        appliedAllBut("008_delete_orphaned_user_rows")
      );
      mockPrisma.dataMigration.create.mockResolvedValue(partialRow({}));
      mockPrisma.$executeRawUnsafe
        .mockResolvedValueOnce(5000)
        .mockResolvedValueOnce(3);

      const service = await importFresh();
      await service.runPendingMigrations();

      const calls = mockPrisma.$executeRawUnsafe.mock.calls.map(
        ([sql, ...params]) => ({
          table: /DELETE FROM "(\w+)"/.exec(sql)?.[1],
          sql: sql
            .replace(/\s+/g, " ")
            .replace(/\( /g, "(")
            .replace(/ \)/g, ")"),
          params,
        })
      );
      // A full chunk of performer stats, then a short one; one each for
      // the other three
      expect(calls.map((call) => call.table)).toEqual([
        "UserPerformerStats",
        "UserPerformerStats",
        "UserStudioStats",
        "UserTagStats",
        "UserEntityRanking",
      ]);
      for (const call of calls) {
        // Only rows whose user is gone, at most a chunk at a time
        expect(call.sql).toContain(
          `WHERE id IN (SELECT t.id FROM "${call.table}" t WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = t.userId) LIMIT ?)`
        );
        expect(call.params).toEqual([5000]);
      }
      expect(mockPrisma.dataMigration.create).toHaveBeenCalledExactlyOnceWith({
        data: { name: "008_delete_orphaned_user_rows" },
      });
    });

    it("does not mark 008 as applied when a delete throws", async () => {
      mockPrisma.dataMigration.findMany.mockResolvedValue(
        appliedAllBut("008_delete_orphaned_user_rows")
      );
      mockPrisma.$executeRawUnsafe.mockRejectedValue(
        new Error("disk I/O error")
      );

      const service = await importFresh();
      await expect(service.runPendingMigrations()).rejects.toThrow(
        "disk I/O error"
      );
      expect(mockPrisma.dataMigration.create).not.toHaveBeenCalled();
    });

    describe("migration 009: saved filter presets and carousel rules", () => {
      /** User 3's image preset: a bare tag and a key the panel lacks */
      const USER_3_PRESETS = JSON.stringify({
        image: [
          {
            id: "p1",
            name: "Secret name",
            filters: { tagIds: ["466"], junk: 1 },
            sort: "created_at",
            direction: "ASC",
          },
        ],
      });
      /** User 5's presets: nothing to clean */
      const USER_5_PRESETS = JSON.stringify({
        tag: [{ id: "t", filters: {}, sort: "name", direction: "ASC" }],
      });
      /** User 5's carousel: a bare tag */
      const USER_5_RULES = JSON.stringify({
        tags: { value: ["284"], modifier: "INCLUDES_ALL" },
      });
      /** User 7's carousel: nothing to clean */
      const USER_7_RULES = JSON.stringify({
        tags: { value: ["284:default"], modifier: "INCLUDES" },
      });

      /** Answers the reads by the table each names */
      function storedRows(presets: string = USER_3_PRESETS) {
        mockPrisma.$queryRawUnsafe.mockImplementation(
          prismaImpl((sql: string) => {
            if (sql.includes('FROM "User"')) {
              return [
                { userId: 3, presets },
                { userId: 5, presets: USER_5_PRESETS },
              ];
            }
            if (sql.includes('FROM "UserCarousel"')) {
              return [
                {
                  id: "c5",
                  userId: 5,
                  rules: USER_5_RULES,
                  sort: "random",
                  direction: "DESC",
                },
                {
                  id: "c7",
                  userId: 7,
                  rules: USER_7_RULES,
                  sort: "random",
                  direction: "DESC",
                },
              ];
            }
            // Every bare tag is on the one instance
            return sql.includes('"StashTag"')
              ? [
                  { id: "466", instanceId: "default" },
                  { id: "284", instanceId: "default" },
                ]
              : [];
          })
        );
      }

      beforeEach(() => {
        mockPrisma.dataMigration.findMany.mockResolvedValue(
          appliedAllBut("009_clean_stored_filters")
        );
        mockPrisma.dataMigration.create.mockResolvedValue(partialRow({}));
      });

      it("writes one unit per user with a change, each write naming the value it read, and logs each change without values", async () => {
        storedRows();
        mockPrisma.$executeRawUnsafe.mockResolvedValue(1);
        const { logger } = await import("../../utils/logger.js");

        const service = await importFresh();
        await service.runPendingMigrations();

        // Users 3 and 5; user 7 has nothing to change
        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
        const writes = mockPrisma.$executeRawUnsafe.mock.calls.map(
          ([sql, ...params]: [string, ...unknown[]]) => [
            sql.replace(/\s+/g, " "),
            ...params,
          ]
        );
        expect(writes).toEqual([
          [
            'UPDATE "User" SET "filterPresets" = ? WHERE "id" = ? AND "filterPresets" = ?',
            JSON.stringify({
              image: [
                {
                  id: "p1",
                  name: "Secret name",
                  filters: { tagIds: ["466:default"] },
                  sort: "created_at",
                  direction: "ASC",
                },
              ],
            }),
            3,
            USER_3_PRESETS,
          ],
          [
            'UPDATE "UserCarousel" SET "rules" = ?, "sort" = ?, "direction" = ? WHERE "id" = ? AND "rules" = ? AND "sort" = ? AND "direction" = ?',
            JSON.stringify({
              tags: { value: ["284:default"], modifier: "INCLUDES_ALL" },
            }),
            "random",
            "DESC",
            "c5",
            USER_5_RULES,
            "random",
            "DESC",
          ],
        ]);
        expect(mockPrisma.dataMigration.create).toHaveBeenCalledExactlyOnceWith(
          { data: { name: "009_clean_stored_filters" } }
        );

        const lines = vi
          .mocked(logger.info)
          .mock.calls.filter(([message]) => message.includes("Migration 009"));
        expect(lines.map(([message]) => message)).toEqual([
          "[Migration 009] Cleaned a saved filter preset",
          "[Migration 009] Cleaned a carousel's rules",
          "[Migration 009] Cleaned saved filter presets and carousel rules",
        ]);
        // Key names and counts: no id, name or other value a user saved
        const logged = JSON.stringify(lines);
        for (const value of ["466", "284", "Secret name"]) {
          expect(logged).not.toContain(value);
        }
        expect(lines[2]?.[1]).toEqual({
          users: 2,
          presets: 1,
          carousels: 1,
          droppedKeys: { "image.junk": 1 },
          refsRewritten: 2,
          refsLeftBare: 0,
          skipped: 0,
        });
      });

      it("leaves a row saved again since it was read as its user saved it", async () => {
        storedRows();
        mockPrisma.$executeRawUnsafe.mockResolvedValue(0);
        const { logger } = await import("../../utils/logger.js");

        const service = await importFresh();
        await service.runPendingMigrations();

        expect(logger.info).toHaveBeenCalledWith(
          "[Migration 009] Left saved filter presets changed since they were read",
          { userId: 3 }
        );
        expect(logger.info).toHaveBeenCalledWith(
          "[Migration 009] Cleaned saved filter presets and carousel rules",
          objectContaining({ users: 0, presets: 0, carousels: 0, skipped: 2 })
        );
        expect(mockPrisma.dataMigration.create).toHaveBeenCalledTimes(1);
      });

      it("leaves stored JSON it cannot read as it is", async () => {
        storedRows("{not json");
        mockPrisma.$executeRawUnsafe.mockResolvedValue(1);
        const { logger } = await import("../../utils/logger.js");

        const service = await importFresh();
        await service.runPendingMigrations();

        expect(logger.warn).toHaveBeenCalledWith(
          "[Migration 009] Left a stored value it cannot read",
          { userId: 3, column: "filterPresets" }
        );
        // User 3 is not written; user 5's carousel still is
        expect(
          mockPrisma.$executeRawUnsafe.mock.calls.map(
            ([sql, ...params]: [string, ...unknown[]]) => [
              /UPDATE "(\w+)"/.exec(sql)?.[1],
              params[3],
            ]
          )
        ).toEqual([["UserCarousel", "c5"]]);
      });

      it("does not mark 009 as applied when a write unit fails", async () => {
        storedRows();
        mockPrisma.$executeRawUnsafe.mockRejectedValue(
          new Error("disk I/O error")
        );

        const service = await importFresh();
        await expect(service.runPendingMigrations()).rejects.toThrow(
          "disk I/O error"
        );
        // The first user's one unit failed; nothing after it ran
        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
        expect(mockPrisma.dataMigration.create).not.toHaveBeenCalled();
      });
    });

    it("does not mark 004 as applied when the recompute throws", async () => {
      mockPrisma.dataMigration.findMany.mockResolvedValue([
        {
          id: 1,
          name: "001_rebuild_user_stats",
          appliedAt: new Date(),
        },
        {
          id: 2,
          name: "002_rebuild_stats_multi_instance",
          appliedAt: new Date(),
        },
        {
          id: 3,
          name: "003_recompute_exclusions_restriction_semantics",
          appliedAt: new Date(),
        },
      ]);
      mockExclusionService.recomputeAllUsers.mockRejectedValue(
        new Error("recompute failed")
      );

      const service = await importFresh();
      await expect(service.runPendingMigrations()).rejects.toThrow(
        "recompute failed"
      );
      expect(mockPrisma.dataMigration.create).not.toHaveBeenCalled();
    });

    it("calls rebuildAllStats for migration 002", async () => {
      mockPrisma.dataMigration.findMany.mockResolvedValue([
        {
          id: 1,
          name: "001_rebuild_user_stats",
          appliedAt: new Date(),
        },
      ]);
      mockPrisma.dataMigration.create.mockResolvedValue(partialRow({}));
      mockStatsService.rebuildAllStats.mockResolvedValue();

      const service = await importFresh();
      await service.runPendingMigrations();

      expect(mockStatsService.rebuildAllStats).toHaveBeenCalledTimes(1);
    });

    it("calls rebuildAllStatsForUser for each user in migration 001", async () => {
      mockPrisma.dataMigration.findMany.mockResolvedValue([]);
      mockPrisma.dataMigration.create.mockResolvedValue(partialRow({}));
      mockPrisma.user.findMany.mockResolvedValue([
        partialRow({ id: 1, username: "admin" }),
        partialRow({ id: 2, username: "user1" }),
        partialRow({ id: 3, username: "user2" }),
      ]);
      mockStatsService.rebuildAllStatsForUser.mockResolvedValue();
      mockStatsService.rebuildAllStats.mockResolvedValue();

      const service = await importFresh();
      await service.runPendingMigrations();

      expect(mockStatsService.rebuildAllStatsForUser).toHaveBeenCalledTimes(3);
      expect(mockStatsService.rebuildAllStatsForUser).toHaveBeenCalledWith(1);
      expect(mockStatsService.rebuildAllStatsForUser).toHaveBeenCalledWith(2);
      expect(mockStatsService.rebuildAllStatsForUser).toHaveBeenCalledWith(3);
    });

    it("continues with other users if one user's stats rebuild fails in 001", async () => {
      mockPrisma.dataMigration.findMany.mockResolvedValue([]);
      mockPrisma.dataMigration.create.mockResolvedValue(partialRow({}));
      mockPrisma.user.findMany.mockResolvedValue([
        partialRow({ id: 1, username: "admin" }),
        partialRow({ id: 2, username: "broken_user" }),
        partialRow({ id: 3, username: "user2" }),
      ]);
      mockStatsService.rebuildAllStatsForUser
        .mockResolvedValueOnce() // user 1 succeeds
        .mockRejectedValueOnce(new Error("DB error")) // user 2 fails
        .mockResolvedValueOnce(); // user 3 succeeds
      mockStatsService.rebuildAllStats.mockResolvedValue();

      const service = await importFresh();
      await service.runPendingMigrations();

      // All three users attempted
      expect(mockStatsService.rebuildAllStatsForUser).toHaveBeenCalledTimes(3);
      // Migration still marked as applied (001 doesn't throw on individual user failure)
      expect(mockPrisma.dataMigration.create).toHaveBeenCalledWith({
        data: { name: "001_rebuild_user_stats" },
      });
    });

    it("does not mark 002 as applied when rebuildAllStats throws", async () => {
      mockPrisma.dataMigration.findMany.mockResolvedValue([
        {
          id: 1,
          name: "001_rebuild_user_stats",
          appliedAt: new Date(),
        },
      ]);
      mockPrisma.dataMigration.create.mockResolvedValue(partialRow({}));

      mockStatsService.rebuildAllStats.mockRejectedValue(
        new Error("Stats rebuild failed")
      );

      const service = await importFresh();
      await expect(service.runPendingMigrations()).rejects.toThrow(
        "Stats rebuild failed"
      );

      // Migration should NOT be marked as applied so it retries on next startup
      expect(mockPrisma.dataMigration.create).not.toHaveBeenCalled();
    });

    it("propagates error when dataMigration.findMany fails", async () => {
      mockPrisma.dataMigration.findMany.mockRejectedValue(
        new Error("Database connection failed")
      );

      const service = await importFresh();
      await expect(service.runPendingMigrations()).rejects.toThrow(
        "Database connection failed"
      );
    });
  });

  describe("getAppliedMigrations", () => {
    it("returns list of applied migrations ordered by date", async () => {
      const migrations = [
        {
          id: 1,
          name: "001_rebuild_user_stats",
          appliedAt: new Date("2026-01-15"),
        },
        {
          id: 2,
          name: "002_rebuild_stats_multi_instance",
          appliedAt: new Date("2026-02-11"),
        },
      ];
      mockPrisma.dataMigration.findMany.mockResolvedValue(migrations);

      const service = await importFresh();
      const result = await service.getAppliedMigrations();

      expect(result).toEqual(migrations);
      expect(mockPrisma.dataMigration.findMany).toHaveBeenCalledWith({
        orderBy: { appliedAt: "asc" },
      });
    });

    it("returns empty array when no migrations applied", async () => {
      mockPrisma.dataMigration.findMany.mockResolvedValue([]);

      const service = await importFresh();
      const result = await service.getAppliedMigrations();

      expect(result).toEqual([]);
    });
  });
});
