import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma before importing service
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    $queryRawUnsafe: vi.fn(),
    $executeRaw: vi.fn(),
    userExcludedEntity: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      upsert: vi.fn(),
    },
    userEntityStats: {
      upsert: vi.fn(),
    },
    userContentRestriction: {
      findMany: vi.fn(),
    },
    userHiddenEntity: {
      findMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
    // Cascade-related models
    scenePerformer: {
      findMany: vi.fn(),
    },
    stashScene: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    stashPerformer: {
      count: vi.fn(),
    },
    stashStudio: {
      count: vi.fn(),
    },
    stashTag: {
      count: vi.fn(),
    },
    stashGroup: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    stashGallery: {
      count: vi.fn(),
    },
    stashImage: {
      count: vi.fn(),
    },
    stashClip: {
      count: vi.fn(),
    },
    sceneTag: {
      findMany: vi.fn(),
    },
    performerTag: {
      findMany: vi.fn(),
    },
    studioTag: {
      findMany: vi.fn(),
    },
    groupTag: {
      findMany: vi.fn(),
    },
    sceneGroup: {
      findMany: vi.fn(),
    },
    sceneGallery: {
      findMany: vi.fn(),
    },
    imageGallery: {
      findMany: vi.fn(),
    },
  },
}));

import { exclusionComputationService } from "../../services/ExclusionComputationService.js";
import prisma from "../../services/../prisma/singleton.js";

const mockPrisma = prisma as any;

describe("ExclusionComputationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("recomputeForUser", () => {
    it("should be a callable method", () => {
      expect(typeof exclusionComputationService.recomputeForUser).toBe("function");
    });

    it("should re-run recompute when called while another is pending", async () => {
      // This tests the race condition fix: if a sync-triggered recompute is running
      // and the admin saves restrictions (triggering another recompute), the second
      // recompute should NOT be skipped - it must run to pick up the new restrictions.
      let computeCount = 0;
      let resolveFirst: () => void;
      const firstBlocker = new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });

      // Mock the full computation pipeline
      mockPrisma.userContentRestriction.findMany.mockResolvedValue([]);
      mockPrisma.userHiddenEntity.findMany.mockResolvedValue([]);
      mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 0 });
      mockPrisma.userExcludedEntity.count.mockResolvedValue(0);
      mockPrisma.userEntityStats.upsert.mockResolvedValue({});
      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.$executeRaw.mockResolvedValue(undefined);
      mockPrisma.stashScene.count.mockResolvedValue(0);
      mockPrisma.stashPerformer.count.mockResolvedValue(0);
      mockPrisma.stashStudio.count.mockResolvedValue(0);
      mockPrisma.stashTag.count.mockResolvedValue(0);
      mockPrisma.stashGroup.count.mockResolvedValue(0);
      mockPrisma.stashGallery.count.mockResolvedValue(0);
      mockPrisma.stashImage.count.mockResolvedValue(0);
      mockPrisma.stashClip.count.mockResolvedValue(0);

      // First call: block inside transaction to simulate slow recompute
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        computeCount++;
        if (computeCount === 1) {
          // First call: wait for blocker before completing
          await firstBlocker;
        }
        return callback(mockPrisma);
      });

      // Start first recompute (will block in transaction)
      const first = exclusionComputationService.recomputeForUser(1);

      // Wait a tick to ensure first recompute has started
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Start second recompute (should NOT just return after first completes)
      const second = exclusionComputationService.recomputeForUser(1);

      // Unblock the first recompute
      resolveFirst!();

      // Wait for both to complete
      await Promise.all([first, second]);

      // The transaction should have been called twice:
      // once for the first recompute, once for the second
      expect(computeCount).toBeGreaterThanOrEqual(2);
    });

    it("should coalesce 3+ concurrent callers to at most 2 recomputes", async () => {
      // When N callers arrive concurrently for the same user, the coalescing
      // mechanism should ensure at most 2 recomputes happen: the currently-
      // running one plus one queued recompute that picks up all pending changes.
      let computeCount = 0;
      let resolveFirst: () => void;
      const firstBlocker = new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });

      // Mock the full computation pipeline
      mockPrisma.userContentRestriction.findMany.mockResolvedValue([]);
      mockPrisma.userHiddenEntity.findMany.mockResolvedValue([]);
      mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 0 });
      mockPrisma.userExcludedEntity.count.mockResolvedValue(0);
      mockPrisma.userEntityStats.upsert.mockResolvedValue({});
      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.$executeRaw.mockResolvedValue(undefined);
      mockPrisma.stashScene.count.mockResolvedValue(0);
      mockPrisma.stashPerformer.count.mockResolvedValue(0);
      mockPrisma.stashStudio.count.mockResolvedValue(0);
      mockPrisma.stashTag.count.mockResolvedValue(0);
      mockPrisma.stashGroup.count.mockResolvedValue(0);
      mockPrisma.stashGallery.count.mockResolvedValue(0);
      mockPrisma.stashImage.count.mockResolvedValue(0);
      mockPrisma.stashClip.count.mockResolvedValue(0);

      // Block the first transaction to simulate a slow recompute
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        computeCount++;
        if (computeCount === 1) {
          await firstBlocker;
        }
        return callback(mockPrisma);
      });

      // Start first recompute (will block in transaction)
      const first = exclusionComputationService.recomputeForUser(2);

      // Wait a tick to ensure first recompute has started
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Start 4 more concurrent recomputes while first is running
      const second = exclusionComputationService.recomputeForUser(2);
      const third = exclusionComputationService.recomputeForUser(2);
      const fourth = exclusionComputationService.recomputeForUser(2);
      const fifth = exclusionComputationService.recomputeForUser(2);

      // Unblock the first recompute
      resolveFirst!();

      // Wait for all to complete
      await Promise.all([first, second, third, fourth, fifth]);

      // With coalescing: at most 2 recomputes (the running one + one queued)
      // Without coalescing: would be 5 (each caller starts its own)
      expect(computeCount).toBe(2);
    });

    it("should ensure the second recompute runs after the first completes", async () => {
      // The queued recompute must run after the first finishes, ensuring
      // it picks up the latest state (e.g., new restrictions saved mid-recompute).
      const executionOrder: string[] = [];
      let resolveFirst: () => void;
      const firstBlocker = new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });
      let computeCount = 0;

      // Mock the full computation pipeline
      mockPrisma.userContentRestriction.findMany.mockResolvedValue([]);
      mockPrisma.userHiddenEntity.findMany.mockResolvedValue([]);
      mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 0 });
      mockPrisma.userExcludedEntity.count.mockResolvedValue(0);
      mockPrisma.userEntityStats.upsert.mockResolvedValue({});
      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.$executeRaw.mockResolvedValue(undefined);
      mockPrisma.stashScene.count.mockResolvedValue(0);
      mockPrisma.stashPerformer.count.mockResolvedValue(0);
      mockPrisma.stashStudio.count.mockResolvedValue(0);
      mockPrisma.stashTag.count.mockResolvedValue(0);
      mockPrisma.stashGroup.count.mockResolvedValue(0);
      mockPrisma.stashGallery.count.mockResolvedValue(0);
      mockPrisma.stashImage.count.mockResolvedValue(0);
      mockPrisma.stashClip.count.mockResolvedValue(0);

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        computeCount++;
        const currentRun = computeCount;
        executionOrder.push(`start-${currentRun}`);
        if (currentRun === 1) {
          await firstBlocker;
        }
        const result = await callback(mockPrisma);
        executionOrder.push(`end-${currentRun}`);
        return result;
      });

      // Start first recompute (will block)
      const first = exclusionComputationService.recomputeForUser(3);
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Start second while first is running
      const second = exclusionComputationService.recomputeForUser(3);

      // Unblock the first
      resolveFirst!();

      await Promise.all([first, second]);

      // Verify sequencing: first must complete before second starts
      expect(executionOrder).toEqual(["start-1", "end-1", "start-2", "end-2"]);
    });

    it("should allow independent recomputes for different users", async () => {
      // Coalescing should only apply per-user; different users should
      // recompute independently and concurrently.
      let user1Count = 0;
      let user2Count = 0;

      // Mock the full computation pipeline
      mockPrisma.userContentRestriction.findMany.mockResolvedValue([]);
      mockPrisma.userHiddenEntity.findMany.mockResolvedValue([]);
      mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 0 });
      mockPrisma.userExcludedEntity.count.mockResolvedValue(0);
      mockPrisma.userEntityStats.upsert.mockResolvedValue({});
      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.$executeRaw.mockResolvedValue(undefined);
      mockPrisma.stashScene.count.mockResolvedValue(0);
      mockPrisma.stashPerformer.count.mockResolvedValue(0);
      mockPrisma.stashStudio.count.mockResolvedValue(0);
      mockPrisma.stashTag.count.mockResolvedValue(0);
      mockPrisma.stashGroup.count.mockResolvedValue(0);
      mockPrisma.stashGallery.count.mockResolvedValue(0);
      mockPrisma.stashImage.count.mockResolvedValue(0);
      mockPrisma.stashClip.count.mockResolvedValue(0);

      // Track per-user invocations via userContentRestriction.findMany calls
      mockPrisma.userContentRestriction.findMany.mockImplementation(
        async (args: any) => {
          if (args?.where?.userId === 10) user1Count++;
          if (args?.where?.userId === 11) user2Count++;
          return [];
        }
      );

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return callback(mockPrisma);
      });

      await Promise.all([
        exclusionComputationService.recomputeForUser(10),
        exclusionComputationService.recomputeForUser(11),
      ]);

      // Each user should get exactly 1 recompute
      expect(user1Count).toBe(1);
      expect(user2Count).toBe(1);
    });
  });

  describe("recomputeAllUsers", () => {
    it("should be a callable method", () => {
      expect(typeof exclusionComputationService.recomputeAllUsers).toBe("function");
    });
  });

  describe("addHiddenEntity", () => {
    it("should be a callable method", () => {
      expect(typeof exclusionComputationService.addHiddenEntity).toBe("function");
    });
  });

  describe("removeHiddenEntity", () => {
    it("should be a callable method", () => {
      expect(typeof exclusionComputationService.removeHiddenEntity).toBe("function");
    });
  });
});

describe("computeDirectExclusions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    mockPrisma.$queryRaw.mockResolvedValue([]);
    // Mock $executeRaw for temp table operations
    mockPrisma.$executeRaw.mockResolvedValue(undefined);
    // Default count responses for entity stats
    mockPrisma.stashScene.count.mockResolvedValue(0);
    mockPrisma.stashPerformer.count.mockResolvedValue(0);
    mockPrisma.stashStudio.count.mockResolvedValue(0);
    mockPrisma.stashTag.count.mockResolvedValue(0);
    mockPrisma.stashGroup.count.mockResolvedValue(0);
    mockPrisma.stashGallery.count.mockResolvedValue(0);
    mockPrisma.stashImage.count.mockResolvedValue(0);
    mockPrisma.userExcludedEntity.count.mockResolvedValue(0);
    mockPrisma.userEntityStats.upsert.mockResolvedValue({});
  });

  it("should process UserContentRestriction EXCLUDE mode", async () => {
    // Setup: user has restriction excluding specific tags
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      {
        userId: 1,
        entityType: "tags",
        mode: "EXCLUDE",
        entityIds: JSON.stringify(["tag1", "tag2"]),
      },
    ]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([]);
    mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 2 });

    // Mock transaction to execute callback
    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.recomputeForUser(1);

    // Verify createMany was called with the excluded tags
    expect(mockPrisma.userExcludedEntity.createMany).toHaveBeenCalled();
    const createCall = mockPrisma.userExcludedEntity.createMany.mock.calls[0][0];
    expect(createCall.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: 1,
          entityType: "tag",
          entityId: "tag1",
          reason: "restricted",
        }),
        expect.objectContaining({
          userId: 1,
          entityType: "tag",
          entityId: "tag2",
          reason: "restricted",
        }),
      ])
    );
  });

  it("should process UserHiddenEntity records", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
      { userId: 1, entityType: "performer", entityId: "perf1" },
      { userId: 1, entityType: "scene", entityId: "scene1" },
    ]);
    mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 2 });

    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.recomputeForUser(1);

    expect(mockPrisma.userExcludedEntity.createMany).toHaveBeenCalled();
    const createCall = mockPrisma.userExcludedEntity.createMany.mock.calls[0][0];
    expect(createCall.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: 1,
          entityType: "performer",
          entityId: "perf1",
          reason: "hidden",
        }),
        expect.objectContaining({
          userId: 1,
          entityType: "scene",
          entityId: "scene1",
          reason: "hidden",
        }),
      ])
    );
  });

  it("should delete existing exclusions before creating new ones", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
      { userId: 1, entityType: "scene", entityId: "scene1" },
    ]);
    mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 5 });
    mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 1 });

    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.recomputeForUser(1);

    // Verify deleteMany was called first with userId filter
    expect(mockPrisma.userExcludedEntity.deleteMany).toHaveBeenCalledWith({
      where: { userId: 1 },
    });
  });

  it("should skip createMany when no exclusions computed", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([]);
    mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 0 });

    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.recomputeForUser(1);

    // deleteMany should still be called to clear any existing
    expect(mockPrisma.userExcludedEntity.deleteMany).toHaveBeenCalled();
    // createMany should not be called if no exclusions
    expect(mockPrisma.userExcludedEntity.createMany).not.toHaveBeenCalled();
  });

  it("should combine restrictions and hidden entities", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      {
        userId: 1,
        entityType: "studios",
        mode: "EXCLUDE",
        entityIds: JSON.stringify(["studio1"]),
      },
    ]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
      { userId: 1, entityType: "performer", entityId: "perf1" },
    ]);
    mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 2 });

    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.recomputeForUser(1);

    const createCall = mockPrisma.userExcludedEntity.createMany.mock.calls[0][0];
    expect(createCall.data).toHaveLength(2);
    expect(createCall.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "studio",
          entityId: "studio1",
          reason: "restricted",
        }),
        expect.objectContaining({
          entityType: "performer",
          entityId: "perf1",
          reason: "hidden",
        }),
      ])
    );
  });
});

describe("computeCascadeExclusions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    mockPrisma.$queryRaw.mockResolvedValue([]);
    // Default count responses for entity stats
    mockPrisma.stashScene.count.mockResolvedValue(0);
    mockPrisma.stashPerformer.count.mockResolvedValue(0);
    mockPrisma.stashStudio.count.mockResolvedValue(0);
    mockPrisma.stashTag.count.mockResolvedValue(0);
    mockPrisma.stashGroup.count.mockResolvedValue(0);
    mockPrisma.stashGallery.count.mockResolvedValue(0);
    mockPrisma.stashImage.count.mockResolvedValue(0);
    mockPrisma.userExcludedEntity.count.mockResolvedValue(0);
    mockPrisma.userEntityStats.upsert.mockResolvedValue({});
  });

  it("should cascade performer exclusion to their scenes", async () => {
    // Setup: performer1 is hidden (direct exclusion)
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
      { userId: 1, entityType: "performer", entityId: "perf1" },
    ]);
    mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 3 });

    // Performer has two scenes
    mockPrisma.scenePerformer.findMany.mockResolvedValue([
      { sceneId: "scene1", performerId: "perf1" },
      { sceneId: "scene2", performerId: "perf1" },
    ]);

    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.recomputeForUser(1);

    // Verify scenes were cascade-excluded
    const calls = mockPrisma.userExcludedEntity.createMany.mock.calls;
    const allData = calls.flatMap((c: any) => c[0].data);

    expect(allData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "performer",
          entityId: "perf1",
          reason: "hidden",
        }),
        expect.objectContaining({
          entityType: "scene",
          entityId: "scene1",
          reason: "cascade",
        }),
        expect.objectContaining({
          entityType: "scene",
          entityId: "scene2",
          reason: "cascade",
        }),
      ])
    );
  });

  it("should cascade studio exclusion to their scenes", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      {
        userId: 1,
        entityType: "studios",
        mode: "EXCLUDE",
        entityIds: JSON.stringify(["studio1"]),
      },
    ]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([]);
    mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 3 });

    // Studio has two scenes
    mockPrisma.stashScene.findMany.mockResolvedValue([
      { id: "scene1", studioId: "studio1" },
      { id: "scene2", studioId: "studio1" },
    ]);

    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.recomputeForUser(1);

    const calls = mockPrisma.userExcludedEntity.createMany.mock.calls;
    const allData = calls.flatMap((c: any) => c[0].data);

    expect(allData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "studio",
          entityId: "studio1",
          reason: "restricted",
        }),
        expect.objectContaining({
          entityType: "scene",
          entityId: "scene1",
          reason: "cascade",
        }),
        expect.objectContaining({
          entityType: "scene",
          entityId: "scene2",
          reason: "cascade",
        }),
      ])
    );
  });

  it("should cascade tag exclusion to scenes, performers, studios, and groups", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      {
        userId: 1,
        entityType: "tags",
        mode: "EXCLUDE",
        entityIds: JSON.stringify(["tag1"]),
      },
    ]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([]);
    mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 5 });

    // Tag directly on a scene
    mockPrisma.sceneTag.findMany.mockResolvedValue([
      { sceneId: "scene1", tagId: "tag1" },
    ]);

    // Tag inherited by another scene (via $queryRaw)
    mockPrisma.$queryRaw.mockResolvedValue([{ id: "scene2" }]);

    // Tag on a performer
    mockPrisma.performerTag.findMany.mockResolvedValue([
      { performerId: "perf1", tagId: "tag1" },
    ]);

    // Tag on a studio
    mockPrisma.studioTag.findMany.mockResolvedValue([
      { studioId: "studio1", tagId: "tag1" },
    ]);

    // Tag on a group
    mockPrisma.groupTag.findMany.mockResolvedValue([
      { groupId: "group1", tagId: "tag1" },
    ]);

    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.recomputeForUser(1);

    const calls = mockPrisma.userExcludedEntity.createMany.mock.calls;
    const allData = calls.flatMap((c: any) => c[0].data);

    expect(allData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "tag",
          entityId: "tag1",
          reason: "restricted",
        }),
        expect.objectContaining({
          entityType: "scene",
          entityId: "scene1",
          reason: "cascade",
        }),
        expect.objectContaining({
          entityType: "scene",
          entityId: "scene2",
          reason: "cascade",
        }),
        expect.objectContaining({
          entityType: "performer",
          entityId: "perf1",
          reason: "cascade",
        }),
        expect.objectContaining({
          entityType: "studio",
          entityId: "studio1",
          reason: "cascade",
        }),
        expect.objectContaining({
          entityType: "group",
          entityId: "group1",
          reason: "cascade",
        }),
      ])
    );
  });

  it("should cascade group exclusion to their scenes", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      {
        userId: 1,
        entityType: "groups",
        mode: "EXCLUDE",
        entityIds: JSON.stringify(["group1"]),
      },
    ]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([]);
    mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 2 });

    // Group has scenes
    mockPrisma.sceneGroup.findMany.mockResolvedValue([
      { sceneId: "scene1", groupId: "group1" },
      { sceneId: "scene2", groupId: "group1" },
    ]);

    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.recomputeForUser(1);

    const calls = mockPrisma.userExcludedEntity.createMany.mock.calls;
    const allData = calls.flatMap((c: any) => c[0].data);

    expect(allData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "group",
          entityId: "group1",
          reason: "restricted",
        }),
        expect.objectContaining({
          entityType: "scene",
          entityId: "scene1",
          reason: "cascade",
        }),
        expect.objectContaining({
          entityType: "scene",
          entityId: "scene2",
          reason: "cascade",
        }),
      ])
    );
  });

  it("should cascade gallery exclusion to scenes and images", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      {
        userId: 1,
        entityType: "galleries",
        mode: "EXCLUDE",
        entityIds: JSON.stringify(["gallery1"]),
      },
    ]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([]);
    mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 3 });

    // Gallery linked to scenes
    mockPrisma.sceneGallery.findMany.mockResolvedValue([
      { sceneId: "scene1", galleryId: "gallery1" },
    ]);

    // Gallery has images
    mockPrisma.imageGallery.findMany.mockResolvedValue([
      { imageId: "image1", galleryId: "gallery1" },
      { imageId: "image2", galleryId: "gallery1" },
    ]);

    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.recomputeForUser(1);

    const calls = mockPrisma.userExcludedEntity.createMany.mock.calls;
    const allData = calls.flatMap((c: any) => c[0].data);

    expect(allData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "gallery",
          entityId: "gallery1",
          reason: "restricted",
        }),
        expect.objectContaining({
          entityType: "scene",
          entityId: "scene1",
          reason: "cascade",
        }),
        expect.objectContaining({
          entityType: "image",
          entityId: "image1",
          reason: "cascade",
        }),
        expect.objectContaining({
          entityType: "image",
          entityId: "image2",
          reason: "cascade",
        }),
      ])
    );
  });

  it("should not duplicate cascade exclusions from multiple sources", async () => {
    // Scene excluded via both performer and studio
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
      { userId: 1, entityType: "performer", entityId: "perf1" },
      { userId: 1, entityType: "studio", entityId: "studio1" },
    ]);
    mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 3 });

    // Same scene linked to both
    mockPrisma.scenePerformer.findMany.mockResolvedValue([
      { sceneId: "scene1", performerId: "perf1" },
    ]);
    mockPrisma.stashScene.findMany.mockResolvedValue([
      { id: "scene1", studioId: "studio1" },
    ]);

    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.recomputeForUser(1);

    const calls = mockPrisma.userExcludedEntity.createMany.mock.calls;
    const allData = calls.flatMap((c: any) => c[0].data);

    // Scene should only appear once due to deduplication
    const sceneExclusions = allData.filter(
      (e: any) => e.entityType === "scene" && e.entityId === "scene1"
    );
    expect(sceneExclusions).toHaveLength(1);
    expect(sceneExclusions[0].reason).toBe("cascade");
  });

  it("should handle empty cascade results gracefully", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
      { userId: 1, entityType: "performer", entityId: "perf1" },
    ]);
    mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 1 });

    // Performer has no scenes
    mockPrisma.scenePerformer.findMany.mockResolvedValue([]);

    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.recomputeForUser(1);

    const calls = mockPrisma.userExcludedEntity.createMany.mock.calls;
    const allData = calls.flatMap((c: any) => c[0].data);

    // Only the direct exclusion should exist
    expect(allData).toHaveLength(1);
    expect(allData[0]).toEqual(
      expect.objectContaining({
        entityType: "performer",
        entityId: "perf1",
        reason: "hidden",
      })
    );
  });
});

describe("composite key parsing in restrictions (#412)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockPrisma.$executeRaw.mockResolvedValue(undefined);
    mockPrisma.stashScene.count.mockResolvedValue(0);
    mockPrisma.stashPerformer.count.mockResolvedValue(0);
    mockPrisma.stashStudio.count.mockResolvedValue(0);
    mockPrisma.stashTag.count.mockResolvedValue(0);
    mockPrisma.stashGroup.count.mockResolvedValue(0);
    mockPrisma.stashGallery.count.mockResolvedValue(0);
    mockPrisma.stashImage.count.mockResolvedValue(0);
    mockPrisma.stashClip.count.mockResolvedValue(0);
    mockPrisma.userExcludedEntity.count.mockResolvedValue(0);
    mockPrisma.userEntityStats.upsert.mockResolvedValue({});
  });

  it("should parse composite keys in EXCLUDE mode and cascade group to scenes", async () => {
    // Bug #412: frontend sends composite keys ("groupId:instanceId") but
    // the exclusion service treated the whole string as entityId, causing
    // cascade queries to fail (groupId "6:inst1" never matches groupId "6")
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      {
        userId: 1,
        entityType: "groups",
        mode: "EXCLUDE",
        entityIds: JSON.stringify(["6:inst1"]),
      },
    ]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([]);
    mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 3 });

    // SceneGroup junction has scenes for group "6" in instance "inst1"
    mockPrisma.sceneGroup.findMany.mockResolvedValue([
      { sceneId: "scene1", sceneInstanceId: "inst1" },
      { sceneId: "scene2", sceneInstanceId: "inst1" },
    ]);

    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.recomputeForUser(1);

    // Verify the cascade query used the bare groupId, not the composite key
    const sceneGroupCalls = mockPrisma.sceneGroup.findMany.mock.calls;
    expect(sceneGroupCalls.length).toBeGreaterThan(0);
    const lastCall = sceneGroupCalls[sceneGroupCalls.length - 1][0];
    // The query should use the scoped path (groupId + groupInstanceId), not "6:inst1" as groupId
    expect(lastCall.where).toEqual({
      OR: [{ groupId: "6", groupInstanceId: "inst1" }],
    });

    // Verify exclusions include the group (with parsed ID) and cascade scenes
    const calls = mockPrisma.userExcludedEntity.createMany.mock.calls;
    const allData = calls.flatMap((c: any) => c[0].data);

    expect(allData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "group",
          entityId: "6",
          instanceId: "inst1",
          reason: "restricted",
        }),
        expect.objectContaining({
          entityType: "scene",
          entityId: "scene1",
          reason: "cascade",
        }),
        expect.objectContaining({
          entityType: "scene",
          entityId: "scene2",
          reason: "cascade",
        }),
      ])
    );
  });

  it("should handle bare IDs (no instance) in EXCLUDE mode", async () => {
    // Single-instance setups may send bare IDs without instanceId
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      {
        userId: 1,
        entityType: "groups",
        mode: "EXCLUDE",
        entityIds: JSON.stringify(["6"]),
      },
    ]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([]);
    mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 3 });

    mockPrisma.sceneGroup.findMany.mockResolvedValue([
      { sceneId: "scene1" },
      { sceneId: "scene2" },
    ]);

    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.recomputeForUser(1);

    // Bare ID should go into globalIds path (no instance scoping)
    const sceneGroupCalls = mockPrisma.sceneGroup.findMany.mock.calls;
    expect(sceneGroupCalls.length).toBeGreaterThan(0);
    const lastCall = sceneGroupCalls[sceneGroupCalls.length - 1][0];
    expect(lastCall.where).toEqual({
      groupId: { in: ["6"] },
    });

    const calls = mockPrisma.userExcludedEntity.createMany.mock.calls;
    const allData = calls.flatMap((c: any) => c[0].data);

    expect(allData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "group",
          entityId: "6",
          reason: "restricted",
        }),
        expect.objectContaining({
          entityType: "scene",
          entityId: "scene1",
          reason: "cascade",
        }),
      ])
    );
  });

  it("should parse composite keys in INCLUDE mode correctly", async () => {
    // INCLUDE mode: exclude everything NOT in the list
    // Bug: composite key "6:inst1" never matched bare IDs from getAllEntityIds
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      {
        userId: 1,
        entityType: "groups",
        mode: "INCLUDE",
        entityIds: JSON.stringify(["6:inst1"]),
      },
    ]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([]);
    mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 2 });

    // Database has groups "5", "6", and "7"
    mockPrisma.stashGroup.findMany.mockResolvedValue([
      { id: "5" },
      { id: "6" },
      { id: "7" },
    ]);

    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.recomputeForUser(1);

    const calls = mockPrisma.userExcludedEntity.createMany.mock.calls;
    const allData = calls.flatMap((c: any) => c[0].data);

    // Groups "5" and "7" should be excluded (not in include list)
    // Group "6" should NOT be excluded (it's the included one)
    const groupExclusions = allData.filter(
      (e: any) => e.entityType === "group" && e.reason === "restricted"
    );
    const excludedGroupIds = groupExclusions.map((e: any) => e.entityId);
    expect(excludedGroupIds).toContain("5");
    expect(excludedGroupIds).toContain("7");
    expect(excludedGroupIds).not.toContain("6");
  });

  it("should parse composite keys for studio EXCLUDE with cascade", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      {
        userId: 1,
        entityType: "studios",
        mode: "EXCLUDE",
        entityIds: JSON.stringify(["studio1:inst1"]),
      },
    ]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([]);
    mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 2 });

    // Studio has scenes (scoped query path)
    mockPrisma.stashScene.findMany.mockResolvedValue([
      { id: "scene1", stashInstanceId: "inst1" },
    ]);

    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.recomputeForUser(1);

    // Verify the studio cascade used scoped query (studioId + stashInstanceId)
    const sceneCalls = mockPrisma.stashScene.findMany.mock.calls;
    expect(sceneCalls.length).toBeGreaterThan(0);
    const lastCall = sceneCalls[sceneCalls.length - 1][0];
    expect(lastCall.where).toEqual(
      expect.objectContaining({
        OR: [{ studioId: "studio1", stashInstanceId: "inst1" }],
      })
    );

    const calls = mockPrisma.userExcludedEntity.createMany.mock.calls;
    const allData = calls.flatMap((c: any) => c[0].data);

    expect(allData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "studio",
          entityId: "studio1",
          instanceId: "inst1",
          reason: "restricted",
        }),
        expect.objectContaining({
          entityType: "scene",
          entityId: "scene1",
          reason: "cascade",
        }),
      ])
    );
  });
});

describe("computeEmptyExclusions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    // Default count responses for entity stats
    mockPrisma.stashScene.count.mockResolvedValue(0);
    mockPrisma.stashPerformer.count.mockResolvedValue(0);
    mockPrisma.stashStudio.count.mockResolvedValue(0);
    mockPrisma.stashTag.count.mockResolvedValue(0);
    mockPrisma.stashGroup.count.mockResolvedValue(0);
    mockPrisma.stashGallery.count.mockResolvedValue(0);
    mockPrisma.stashImage.count.mockResolvedValue(0);
    mockPrisma.userExcludedEntity.count.mockResolvedValue(0);
    mockPrisma.userEntityStats.upsert.mockResolvedValue({});
  });

  it("should exclude galleries with no visible images", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([]);
    mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });

    // Mock raw queries for empty exclusions
    // Returns data with correct column aliases for each query
    let queryCallCount = 0;
    mockPrisma.$queryRaw = vi.fn().mockImplementation(() => {
      queryCallCount++;
      switch (queryCallCount) {
        // Query 1: galleries - return empty galleries
        case 1: return Promise.resolve([
          { galleryId: "gallery1", imageId: null },
          { galleryId: "gallery2", imageId: null },
        ]);
        // Query 2-5: other entities have visible content
        default: return Promise.resolve([]);
      }
    });

    mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 2 });

    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.recomputeForUser(1);

    const calls = mockPrisma.userExcludedEntity.createMany.mock.calls;
    const allData = calls.flatMap((c: any) => c[0].data || []);

    expect(allData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "gallery",
          entityId: "gallery1",
          reason: "empty",
        }),
        expect.objectContaining({
          entityType: "gallery",
          entityId: "gallery2",
          reason: "empty",
        }),
      ])
    );
  });

  it("should exclude performers with no visible scenes AND no visible images", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([]);
    mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });

    // Mock raw queries
    let queryCallCount = 0;
    mockPrisma.$queryRaw = vi.fn().mockImplementation(() => {
      queryCallCount++;
      switch (queryCallCount) {
        // Query 1: galleries - none empty
        case 1: return Promise.resolve([]);
        // Query 2: performers - return empty performer
        case 2: return Promise.resolve([
          { performerId: "performer1", sceneId: null, imageId: null },
        ]);
        // Query 3-5: other entities have visible content
        default: return Promise.resolve([]);
      }
    });

    mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 1 });

    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.recomputeForUser(1);

    const calls = mockPrisma.userExcludedEntity.createMany.mock.calls;
    const allData = calls.flatMap((c: any) => c[0].data || []);

    expect(allData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "performer",
          entityId: "performer1",
          reason: "empty",
        }),
      ])
    );
  });

  it("should exclude studios with no visible scenes AND no visible images", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([]);
    mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });

    // Mock raw queries
    let queryCallCount = 0;
    mockPrisma.$queryRaw = vi.fn().mockImplementation(() => {
      queryCallCount++;
      switch (queryCallCount) {
        // Query 1-2: galleries and performers - none empty
        case 1: return Promise.resolve([]);
        case 2: return Promise.resolve([]);
        // Query 3: studios - return empty studio
        case 3: return Promise.resolve([
          { studioId: "studio1", sceneId: null, imageId: null },
        ]);
        // Query 4-5: other entities have visible content
        default: return Promise.resolve([]);
      }
    });

    mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 1 });

    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.recomputeForUser(1);

    const calls = mockPrisma.userExcludedEntity.createMany.mock.calls;
    const allData = calls.flatMap((c: any) => c[0].data || []);

    expect(allData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "studio",
          entityId: "studio1",
          reason: "empty",
        }),
      ])
    );
  });

  it("should exclude groups with no visible scenes", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([]);
    mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });

    // Mock raw queries
    let queryCallCount = 0;
    mockPrisma.$queryRaw = vi.fn().mockImplementation(() => {
      queryCallCount++;
      switch (queryCallCount) {
        // Query 1-3: galleries, performers, studios - none empty
        case 1: return Promise.resolve([]);
        case 2: return Promise.resolve([]);
        case 3: return Promise.resolve([]);
        // Query 4: groups - return empty group
        case 4: return Promise.resolve([
          { groupId: "group1", sceneId: null },
        ]);
        // Query 5: tags have visible content
        default: return Promise.resolve([]);
      }
    });

    mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 1 });

    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.recomputeForUser(1);

    const calls = mockPrisma.userExcludedEntity.createMany.mock.calls;
    const allData = calls.flatMap((c: any) => c[0].data || []);

    expect(allData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "group",
          entityId: "group1",
          reason: "empty",
        }),
      ])
    );
  });

  it("should exclude tags not attached to any visible entity", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([]);
    mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });

    // Mock raw queries
    let queryCallCount = 0;
    mockPrisma.$queryRaw = vi.fn().mockImplementation(() => {
      queryCallCount++;
      switch (queryCallCount) {
        // Query 1-4: galleries, performers, studios, groups - none empty
        case 1: return Promise.resolve([]);
        case 2: return Promise.resolve([]);
        case 3: return Promise.resolve([]);
        case 4: return Promise.resolve([]);
        // Query 5: tags - return empty tag
        case 5: return Promise.resolve([
          { tagId: "tag1", sceneId: null, performerId: null, studioId: null, groupId: null },
        ]);
        default: return Promise.resolve([]);
      }
    });

    mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 1 });

    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.recomputeForUser(1);

    const calls = mockPrisma.userExcludedEntity.createMany.mock.calls;
    const allData = calls.flatMap((c: any) => c[0].data || []);

    expect(allData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "tag",
          entityId: "tag1",
          reason: "empty",
        }),
      ])
    );
  });

  it("should not exclude entities that have visible content", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([]);
    mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });

    // Mock raw queries - new implementation uses NOT EXISTS and returns empty arrays
    // when entities have visible content (they are NOT empty)
    // All queries should return empty arrays since entities have visible content
    mockPrisma.$queryRaw.mockResolvedValue([]);

    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.recomputeForUser(1);

    // createMany should not be called when no exclusions
    expect(mockPrisma.userExcludedEntity.createMany).not.toHaveBeenCalled();
  });

  it("should consider already excluded content when determining if entity is empty", async () => {
    // Scenario: gallery has images but they're all excluded
    // Hidden image -> gallery becomes empty
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
      { userId: 1, entityType: "image", entityId: "image1" },
    ]);
    mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 2 });

    // No cascades from image hiding in our model

    // Mock $queryRaw to return proper results for each query type
    // Each query returns data with correct column aliases
    let queryCallCount = 0;
    mockPrisma.$queryRaw = vi.fn().mockImplementation(() => {
      queryCallCount++;
      switch (queryCallCount) {
        // Query 1: galleries with images - gallery1 has image1 (which is excluded)
        case 1: return Promise.resolve([
          { galleryId: "gallery1", imageId: "image1" },
        ]);
        // Query 2: performers with content - performer has visible scene
        case 2: return Promise.resolve([
          { performerId: "performer1", sceneId: "scene1", imageId: null },
        ]);
        // Query 3: studios with content - studio has visible scene
        case 3: return Promise.resolve([
          { studioId: "studio1", sceneId: "scene1", imageId: null },
        ]);
        // Query 4: groups with scenes - group has visible scene
        case 4: return Promise.resolve([
          { groupId: "group1", sceneId: "scene1" },
        ]);
        // Query 5: tags with entities - tag has visible content
        case 5: return Promise.resolve([
          { tagId: "tag1", sceneId: "scene1", performerId: null, studioId: null, groupId: null },
        ]);
        default: return Promise.resolve([]);
      }
    });

    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.recomputeForUser(1);

    const calls = mockPrisma.userExcludedEntity.createMany.mock.calls;
    const allData = calls.flatMap((c: any) => c[0].data || []);

    // Should have: image (hidden), gallery (empty - its only image is excluded)
    expect(allData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "image",
          entityId: "image1",
          reason: "hidden",
        }),
        expect.objectContaining({
          entityType: "gallery",
          entityId: "gallery1",
          reason: "empty",
        }),
      ])
    );
  });

  it("should handle multiple empty entity types in one pass", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([]);
    mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });

    // Mock different results for each entity type query
    // Each query uses different column aliases matching the actual SQL
    let queryCallCount = 0;
    mockPrisma.$queryRaw = vi.fn().mockImplementation(() => {
      queryCallCount++;
      switch (queryCallCount) {
        // Query 1: galleries - return gallery with no images
        case 1: return Promise.resolve([
          { galleryId: "gallery1", imageId: null },
        ]);
        // Query 2: performers - return performer with no content
        case 2: return Promise.resolve([
          { performerId: "performer1", sceneId: null, imageId: null },
        ]);
        // Query 3: studios - return studio with no content
        case 3: return Promise.resolve([
          { studioId: "studio1", sceneId: null, imageId: null },
        ]);
        // Query 4: groups - return group with no scenes
        case 4: return Promise.resolve([
          { groupId: "group1", sceneId: null },
        ]);
        // Query 5: tags - return tag with no visible entities
        case 5: return Promise.resolve([
          { tagId: "tag1", sceneId: null, performerId: null, studioId: null, groupId: null },
        ]);
        default: return Promise.resolve([]);
      }
    });

    mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 5 });

    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.recomputeForUser(1);

    const calls = mockPrisma.userExcludedEntity.createMany.mock.calls;
    const allData = calls.flatMap((c: any) => c[0].data || []);

    expect(allData).toHaveLength(5);
    expect(allData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityType: "gallery", entityId: "gallery1", reason: "empty" }),
        expect.objectContaining({ entityType: "performer", entityId: "performer1", reason: "empty" }),
        expect.objectContaining({ entityType: "studio", entityId: "studio1", reason: "empty" }),
        expect.objectContaining({ entityType: "group", entityId: "group1", reason: "empty" }),
        expect.objectContaining({ entityType: "tag", entityId: "tag1", reason: "empty" }),
      ])
    );
  });
});

describe("addHiddenEntity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should add hidden exclusion and cascade to related scenes for performer", async () => {
    mockPrisma.userExcludedEntity.upsert.mockResolvedValue({
      id: 1,
      userId: 1,
      entityType: "performer",
      entityId: "perf1",
      reason: "hidden",
    });
    mockPrisma.scenePerformer.findMany.mockResolvedValue([
      { sceneId: "scene1", performerId: "perf1" },
      { sceneId: "scene2", performerId: "perf1" },
    ]);
    mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 2 });
    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.addHiddenEntity(1, "performer", "perf1");

    // Verify upsert was called with correct parameters
    expect(mockPrisma.userExcludedEntity.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_entityType_entityId_instanceId: {
            userId: 1,
            entityType: "performer",
            entityId: "perf1",
            instanceId: "",
          },
        },
        create: expect.objectContaining({ reason: "hidden", instanceId: "" }),
        update: expect.objectContaining({ reason: "hidden" }),
      })
    );

    // Verify cascade exclusions were created via upsert (SQLite doesn't support skipDuplicates)
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
        create: expect.objectContaining({ reason: "cascade", instanceId: "" }),
        update: {},
      })
    );
    expect(mockPrisma.userExcludedEntity.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_entityType_entityId_instanceId: {
            userId: 1,
            entityType: "scene",
            entityId: "scene2",
            instanceId: "",
          },
        },
        create: expect.objectContaining({ reason: "cascade", instanceId: "" }),
        update: {},
      })
    );
  });

  it("should add hidden exclusion and cascade to scenes for studio", async () => {
    mockPrisma.userExcludedEntity.upsert.mockResolvedValue({});
    mockPrisma.stashScene.findMany.mockResolvedValue([
      { id: "scene1", stashInstanceId: "inst1", studioId: "studio1" },
    ]);
    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.addHiddenEntity(1, "studio", "studio1");

    expect(mockPrisma.userExcludedEntity.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_entityType_entityId_instanceId: {
            userId: 1,
            entityType: "studio",
            entityId: "studio1",
            instanceId: "",
          },
        },
      })
    );
    expect(mockPrisma.stashScene.findMany).toHaveBeenCalledWith({
      where: { studioId: "studio1", deletedAt: null },
      select: { id: true, stashInstanceId: true },
    });
    // Cascades now use upsert (SQLite compatibility)
    // 1 hidden + 1 cascade scene = 2 upserts
    expect(mockPrisma.userExcludedEntity.upsert).toHaveBeenCalledTimes(2);
  });

  it("should add hidden exclusion and cascade for tag to scenes, performers, studios, and groups", async () => {
    mockPrisma.userExcludedEntity.upsert.mockResolvedValue({});
    mockPrisma.sceneTag.findMany.mockResolvedValue([{ sceneId: "scene1", sceneInstanceId: "inst1", tagId: "tag1" }]);
    mockPrisma.$queryRawUnsafe.mockResolvedValue([{ id: "scene2" }]); // inherited tag scene
    mockPrisma.performerTag.findMany.mockResolvedValue([{ performerId: "perf1", performerInstanceId: "inst1", tagId: "tag1" }]);
    mockPrisma.studioTag.findMany.mockResolvedValue([{ studioId: "studio1", studioInstanceId: "inst1", tagId: "tag1" }]);
    mockPrisma.groupTag.findMany.mockResolvedValue([{ groupId: "group1", groupInstanceId: "inst1", tagId: "tag1" }]);
    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.addHiddenEntity(1, "tag", "tag1");

    expect(mockPrisma.sceneTag.findMany).toHaveBeenCalledWith({
      where: { tagId: "tag1" },
      select: { sceneId: true, sceneInstanceId: true },
    });
    expect(mockPrisma.performerTag.findMany).toHaveBeenCalledWith({
      where: { tagId: "tag1" },
      select: { performerId: true, performerInstanceId: true },
    });
    expect(mockPrisma.studioTag.findMany).toHaveBeenCalledWith({
      where: { tagId: "tag1" },
      select: { studioId: true, studioInstanceId: true },
    });
    expect(mockPrisma.groupTag.findMany).toHaveBeenCalledWith({
      where: { tagId: "tag1" },
      select: { groupId: true, groupInstanceId: true },
    });

    // Cascades now use upsert (SQLite compatibility)
    // 1 hidden tag + 2 scenes + 1 performer + 1 studio + 1 group = 6 upserts
    expect(mockPrisma.userExcludedEntity.upsert).toHaveBeenCalledTimes(6);
  });

  it("should add hidden exclusion and cascade for group to scenes", async () => {
    mockPrisma.userExcludedEntity.upsert.mockResolvedValue({});
    mockPrisma.sceneGroup.findMany.mockResolvedValue([
      { sceneId: "scene1", sceneInstanceId: "inst1", groupId: "group1" },
      { sceneId: "scene2", sceneInstanceId: "inst1", groupId: "group1" },
    ]);
    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.addHiddenEntity(1, "group", "group1");

    expect(mockPrisma.sceneGroup.findMany).toHaveBeenCalledWith({
      where: { groupId: "group1" },
      select: { sceneId: true, sceneInstanceId: true },
    });
    // Cascades now use upsert instead of createMany (SQLite compatibility)
    // 1 upsert for the hidden entity + 2 upserts for cascade scenes
    expect(mockPrisma.userExcludedEntity.upsert).toHaveBeenCalledTimes(3);
  });

  it("should add hidden exclusion and cascade for gallery to scenes and images", async () => {
    mockPrisma.userExcludedEntity.upsert.mockResolvedValue({});
    mockPrisma.sceneGallery.findMany.mockResolvedValue([{ sceneId: "scene1", sceneInstanceId: "inst1", galleryId: "gallery1" }]);
    mockPrisma.imageGallery.findMany.mockResolvedValue([
      { imageId: "image1", imageInstanceId: "inst1", galleryId: "gallery1" },
      { imageId: "image2", imageInstanceId: "inst1", galleryId: "gallery1" },
    ]);
    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.addHiddenEntity(1, "gallery", "gallery1");

    expect(mockPrisma.sceneGallery.findMany).toHaveBeenCalledWith({
      where: { galleryId: "gallery1" },
      select: { sceneId: true, sceneInstanceId: true },
    });
    expect(mockPrisma.imageGallery.findMany).toHaveBeenCalledWith({
      where: { galleryId: "gallery1" },
      select: { imageId: true, imageInstanceId: true },
    });

    // Cascades now use upsert instead of createMany (SQLite compatibility)
    // 1 upsert for hidden + 1 scene + 2 images = 4 upserts
    expect(mockPrisma.userExcludedEntity.upsert).toHaveBeenCalledTimes(4);
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
      })
    );
    expect(mockPrisma.userExcludedEntity.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_entityType_entityId_instanceId: {
            userId: 1,
            entityType: "image",
            entityId: "image1",
            instanceId: "",
          },
        },
      })
    );
  });

  it("should only call upsert once when there are no cascade exclusions", async () => {
    mockPrisma.userExcludedEntity.upsert.mockResolvedValue({});
    mockPrisma.scenePerformer.findMany.mockResolvedValue([]); // No scenes for this performer
    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.addHiddenEntity(1, "performer", "perf-no-scenes");

    // Only one upsert call for the direct hidden entity, no cascade upserts
    expect(mockPrisma.userExcludedEntity.upsert).toHaveBeenCalledTimes(1);
  });

  it("should use upsert for cascade exclusions to handle duplicates", async () => {
    mockPrisma.userExcludedEntity.upsert.mockResolvedValue({});
    mockPrisma.scenePerformer.findMany.mockResolvedValue([{ sceneId: "scene1", sceneInstanceId: "inst1", performerId: "perf1" }]);
    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.addHiddenEntity(1, "performer", "perf1");

    // Should use upsert for cascade exclusions (SQLite doesn't support skipDuplicates)
    // First call is for the direct hidden entity, second is for the cascade
    expect(mockPrisma.userExcludedEntity.upsert).toHaveBeenCalledTimes(2);
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
        create: expect.objectContaining({ reason: "cascade", instanceId: "" }),
        update: {},
      })
    );
  });
});

describe("removeHiddenEntity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup mocks for recomputeForUser which will be called async
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([]);
    mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockPrisma.stashScene.count.mockResolvedValue(0);
    mockPrisma.stashPerformer.count.mockResolvedValue(0);
    mockPrisma.stashStudio.count.mockResolvedValue(0);
    mockPrisma.stashTag.count.mockResolvedValue(0);
    mockPrisma.stashGroup.count.mockResolvedValue(0);
    mockPrisma.stashGallery.count.mockResolvedValue(0);
    mockPrisma.stashImage.count.mockResolvedValue(0);
    mockPrisma.userExcludedEntity.count.mockResolvedValue(0);
    mockPrisma.userEntityStats.upsert.mockResolvedValue({});
    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });
  });

  it("should queue async recompute via setImmediate", async () => {
    // Spy on setImmediate
    const setImmediateSpy = vi.spyOn(global, "setImmediate");

    await exclusionComputationService.removeHiddenEntity(1, "performer", "perf1");

    // Verify setImmediate was called
    expect(setImmediateSpy).toHaveBeenCalled();

    setImmediateSpy.mockRestore();
  });

  it("should call recomputeForUser asynchronously", async () => {
    // Use fake timers to control setImmediate
    vi.useFakeTimers();

    await exclusionComputationService.removeHiddenEntity(1, "performer", "perf1");

    // Transaction should not have been called yet (async)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();

    // Run pending timers/immediate callbacks
    await vi.runAllTimersAsync();

    // Now recomputeForUser should have been called
    expect(mockPrisma.$transaction).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("should handle errors in async recompute gracefully", async () => {
    vi.useFakeTimers();

    // Make the transaction fail
    mockPrisma.$transaction.mockRejectedValue(new Error("Database error"));

    // This should not throw
    await exclusionComputationService.removeHiddenEntity(1, "performer", "perf1");

    // Run the async callback - should not throw even if recompute fails
    await expect(vi.runAllTimersAsync()).resolves.not.toThrow();

    vi.useRealTimers();
  });
});

describe("recomputeAllUsers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mocks for a successful recompute pipeline
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([]);
    mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.userExcludedEntity.count.mockResolvedValue(0);
    mockPrisma.userEntityStats.upsert.mockResolvedValue({});
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockPrisma.stashScene.count.mockResolvedValue(0);
    mockPrisma.stashPerformer.count.mockResolvedValue(0);
    mockPrisma.stashStudio.count.mockResolvedValue(0);
    mockPrisma.stashTag.count.mockResolvedValue(0);
    mockPrisma.stashGroup.count.mockResolvedValue(0);
    mockPrisma.stashGallery.count.mockResolvedValue(0);
    mockPrisma.stashImage.count.mockResolvedValue(0);
    mockPrisma.stashClip.count.mockResolvedValue(0);
    mockPrisma.scenePerformer.findMany.mockResolvedValue([]);
    mockPrisma.stashScene.findMany.mockResolvedValue([]);
    mockPrisma.sceneTag.findMany.mockResolvedValue([]);
    mockPrisma.performerTag.findMany.mockResolvedValue([]);
    mockPrisma.studioTag.findMany.mockResolvedValue([]);
    mockPrisma.groupTag.findMany.mockResolvedValue([]);
    mockPrisma.sceneGroup.findMany.mockResolvedValue([]);
    mockPrisma.sceneGallery.findMany.mockResolvedValue([]);
    mockPrisma.imageGallery.findMany.mockResolvedValue([]);
    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });
  });

  it("should iterate all users and recompute exclusions for each", async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 1 },
      { id: 2 },
      { id: 3 },
    ]);

    const result = await exclusionComputationService.recomputeAllUsers();

    expect(result.success).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.errors).toEqual([]);
    // Transaction called once per user
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it("should continue processing other users when one fails", async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 1 },
      { id: 2 },
      { id: 3 },
    ]);

    let callCount = 0;
    mockPrisma.userContentRestriction.findMany.mockImplementation(async () => {
      callCount++;
      if (callCount === 2) {
        throw new Error("DB error for user 2");
      }
      return [];
    });

    const result = await exclusionComputationService.recomputeAllUsers();

    expect(result.success).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toEqual({
      userId: 2,
      error: "DB error for user 2",
    });
  });

  it("should return zero counts when no users exist", async () => {
    mockPrisma.user.findMany.mockResolvedValue([]);

    const result = await exclusionComputationService.recomputeAllUsers();

    expect(result.success).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.errors).toEqual([]);
  });
});

describe("instance-scoped cascades", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.scenePerformer.findMany.mockResolvedValue([]);
    mockPrisma.stashScene.findMany.mockResolvedValue([]);
    mockPrisma.sceneTag.findMany.mockResolvedValue([]);
    mockPrisma.performerTag.findMany.mockResolvedValue([]);
    mockPrisma.studioTag.findMany.mockResolvedValue([]);
    mockPrisma.groupTag.findMany.mockResolvedValue([]);
    mockPrisma.sceneGroup.findMany.mockResolvedValue([]);
    mockPrisma.sceneGallery.findMany.mockResolvedValue([]);
    mockPrisma.imageGallery.findMany.mockResolvedValue([]);
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockPrisma.stashScene.count.mockResolvedValue(0);
    mockPrisma.stashPerformer.count.mockResolvedValue(0);
    mockPrisma.stashStudio.count.mockResolvedValue(0);
    mockPrisma.stashTag.count.mockResolvedValue(0);
    mockPrisma.stashGroup.count.mockResolvedValue(0);
    mockPrisma.stashGallery.count.mockResolvedValue(0);
    mockPrisma.stashImage.count.mockResolvedValue(0);
    mockPrisma.stashClip.count.mockResolvedValue(0);
    mockPrisma.userExcludedEntity.count.mockResolvedValue(0);
    mockPrisma.userEntityStats.upsert.mockResolvedValue({});
    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });
  });

  it("should cascade scoped performer exclusion using OR clause with instanceId", async () => {
    // Performer hidden with specific instanceId should cascade via the scoped path
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
      { userId: 1, entityType: "performer", entityId: "perf1", instanceId: "instA" },
    ]);
    mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 2 });

    mockPrisma.scenePerformer.findMany.mockResolvedValue([
      { sceneId: "scene1", sceneInstanceId: "instA" },
    ]);

    await exclusionComputationService.recomputeForUser(1);

    // Verify the scoped path was used (OR clause with performerId + performerInstanceId)
    const spCalls = mockPrisma.scenePerformer.findMany.mock.calls;
    expect(spCalls.length).toBeGreaterThan(0);
    const lastCall = spCalls[spCalls.length - 1][0];
    expect(lastCall.where).toEqual({
      OR: [{ performerId: "perf1", performerInstanceId: "instA" }],
    });

    // Verify cascade scene carries the instanceId
    const calls = mockPrisma.userExcludedEntity.createMany.mock.calls;
    const allData = calls.flatMap((c: any) => c[0].data);
    expect(allData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "scene",
          entityId: "scene1",
          instanceId: "instA",
          reason: "cascade",
        }),
      ])
    );
  });

  it("should cascade scoped tag exclusion to scenes via junction with instanceId", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
      { userId: 1, entityType: "tag", entityId: "tag1", instanceId: "instB" },
    ]);
    mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 2 });

    // SceneTag junction returns scenes for the scoped tag
    mockPrisma.sceneTag.findMany.mockResolvedValue([
      { sceneId: "scene5", sceneInstanceId: "instB" },
    ]);

    await exclusionComputationService.recomputeForUser(1);

    // Verify the scoped path was used for sceneTag
    const stCalls = mockPrisma.sceneTag.findMany.mock.calls;
    expect(stCalls.length).toBeGreaterThan(0);
    const lastCall = stCalls[stCalls.length - 1][0];
    expect(lastCall.where).toEqual({
      OR: [{ tagId: "tag1", tagInstanceId: "instB" }],
    });
  });

  it("should cascade mixed global and scoped exclusions correctly", async () => {
    // Mix of global (from restriction) and scoped (from hidden) performer exclusions
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
      { userId: 1, entityType: "performer", entityId: "perfGlobal", instanceId: "" },
      { userId: 1, entityType: "performer", entityId: "perfScoped", instanceId: "instA" },
    ]);
    mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 4 });

    // Global query returns scenes for perfGlobal
    // Scoped query returns scenes for perfScoped in instA
    let callCount = 0;
    mockPrisma.scenePerformer.findMany.mockImplementation(async (args: any) => {
      callCount++;
      if (args.where.performerId) {
        // Global path: { performerId: { in: ["perfGlobal"] } }
        return [{ sceneId: "scene-global", performerId: "perfGlobal" }];
      }
      if (args.where.OR) {
        // Scoped path: { OR: [{ performerId: "perfScoped", performerInstanceId: "instA" }] }
        return [{ sceneId: "scene-scoped", sceneInstanceId: "instA" }];
      }
      return [];
    });

    await exclusionComputationService.recomputeForUser(1);

    // Both global and scoped cascade queries should have been called
    expect(mockPrisma.scenePerformer.findMany).toHaveBeenCalledTimes(2);

    const calls = mockPrisma.userExcludedEntity.createMany.mock.calls;
    const allData = calls.flatMap((c: any) => c[0].data);

    // Global cascade should produce scene with empty instanceId
    expect(allData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "scene",
          entityId: "scene-global",
          instanceId: "",
          reason: "cascade",
        }),
        expect.objectContaining({
          entityType: "scene",
          entityId: "scene-scoped",
          instanceId: "instA",
          reason: "cascade",
        }),
      ])
    );
  });

  it("should cascade scoped studio exclusion to scenes with instance filtering", async () => {
    // Studio exclusions use direct column (not junction), different code path
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
      { userId: 1, entityType: "studio", entityId: "studio1", instanceId: "instA" },
    ]);
    mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 2 });

    mockPrisma.stashScene.findMany.mockResolvedValue([
      { id: "scene1", stashInstanceId: "instA" },
    ]);

    await exclusionComputationService.recomputeForUser(1);

    // Verify the scoped studio path uses OR with studioId + stashInstanceId
    const sceneCalls = mockPrisma.stashScene.findMany.mock.calls;
    expect(sceneCalls.length).toBeGreaterThan(0);
    const lastCall = sceneCalls[sceneCalls.length - 1][0];
    expect(lastCall.where).toEqual(
      expect.objectContaining({
        OR: [{ studioId: "studio1", stashInstanceId: "instA" }],
      })
    );

    const calls = mockPrisma.userExcludedEntity.createMany.mock.calls;
    const allData = calls.flatMap((c: any) => c[0].data);
    expect(allData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "scene",
          entityId: "scene1",
          instanceId: "instA",
          reason: "cascade",
        }),
      ])
    );
  });
});

describe("addHiddenEntity with instanceId scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.userExcludedEntity.upsert.mockResolvedValue({});
    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });
  });

  it("should scope performer cascade to specific instance when instanceId provided", async () => {
    mockPrisma.scenePerformer.findMany.mockResolvedValue([
      { sceneId: "scene1", sceneInstanceId: "instA" },
    ]);

    await exclusionComputationService.addHiddenEntity(1, "performer", "perf1", "instA");

    // Direct exclusion should carry the instanceId
    expect(mockPrisma.userExcludedEntity.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_entityType_entityId_instanceId: {
            userId: 1,
            entityType: "performer",
            entityId: "perf1",
            instanceId: "instA",
          },
        },
      })
    );

    // Cascade query should be scoped to the instance
    expect(mockPrisma.scenePerformer.findMany).toHaveBeenCalledWith({
      where: { performerId: "perf1", performerInstanceId: "instA" },
      select: { sceneId: true, sceneInstanceId: true },
    });

    // Cascade scene should carry the instanceId
    expect(mockPrisma.userExcludedEntity.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_entityType_entityId_instanceId: {
            userId: 1,
            entityType: "scene",
            entityId: "scene1",
            instanceId: "instA",
          },
        },
      })
    );
  });

  it("should scope group cascade to specific instance when instanceId provided", async () => {
    mockPrisma.sceneGroup.findMany.mockResolvedValue([
      { sceneId: "scene1", sceneInstanceId: "instB" },
    ]);

    await exclusionComputationService.addHiddenEntity(1, "group", "group1", "instB");

    expect(mockPrisma.sceneGroup.findMany).toHaveBeenCalledWith({
      where: { groupId: "group1", groupInstanceId: "instB" },
      select: { sceneId: true, sceneInstanceId: true },
    });

    expect(mockPrisma.userExcludedEntity.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_entityType_entityId_instanceId: {
            userId: 1,
            entityType: "scene",
            entityId: "scene1",
            instanceId: "instB",
          },
        },
      })
    );
  });

  it("should scope studio cascade to specific instance when instanceId provided", async () => {
    mockPrisma.stashScene.findMany.mockResolvedValue([
      { id: "scene1", stashInstanceId: "instA" },
    ]);

    await exclusionComputationService.addHiddenEntity(1, "studio", "studio1", "instA");

    expect(mockPrisma.stashScene.findMany).toHaveBeenCalledWith({
      where: { studioId: "studio1", stashInstanceId: "instA", deletedAt: null },
      select: { id: true, stashInstanceId: true },
    });
  });
});

describe("INCLUDE mode for non-group entity types", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.scenePerformer.findMany.mockResolvedValue([]);
    mockPrisma.stashScene.findMany.mockResolvedValue([]);
    mockPrisma.sceneTag.findMany.mockResolvedValue([]);
    mockPrisma.performerTag.findMany.mockResolvedValue([]);
    mockPrisma.studioTag.findMany.mockResolvedValue([]);
    mockPrisma.groupTag.findMany.mockResolvedValue([]);
    mockPrisma.sceneGroup.findMany.mockResolvedValue([]);
    mockPrisma.sceneGallery.findMany.mockResolvedValue([]);
    mockPrisma.imageGallery.findMany.mockResolvedValue([]);
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockPrisma.$executeRaw.mockResolvedValue(undefined);
    mockPrisma.stashScene.count.mockResolvedValue(0);
    mockPrisma.stashPerformer.count.mockResolvedValue(0);
    mockPrisma.stashStudio.count.mockResolvedValue(0);
    mockPrisma.stashTag.count.mockResolvedValue(0);
    mockPrisma.stashGroup.count.mockResolvedValue(0);
    mockPrisma.stashGallery.count.mockResolvedValue(0);
    mockPrisma.stashImage.count.mockResolvedValue(0);
    mockPrisma.stashClip.count.mockResolvedValue(0);
    mockPrisma.userExcludedEntity.count.mockResolvedValue(0);
    mockPrisma.userEntityStats.upsert.mockResolvedValue({});
    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });
  });

  it("should process INCLUDE mode for tags — excludes all tags not in list", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      {
        userId: 1,
        entityType: "tags",
        mode: "INCLUDE",
        entityIds: JSON.stringify(["tag2:instA"]),
      },
    ]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([]);
    mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 2 });

    // getAllEntityIds returns all tags
    mockPrisma.stashTag = {
      ...mockPrisma.stashTag,
      findMany: vi.fn().mockResolvedValue([
        { id: "tag1" },
        { id: "tag2" },
        { id: "tag3" },
      ]),
    };

    await exclusionComputationService.recomputeForUser(1);

    const calls = mockPrisma.userExcludedEntity.createMany.mock.calls;
    const allData = calls.flatMap((c: any) => c[0].data);

    // tag1 and tag3 should be excluded (not in include list)
    // tag2 should NOT be excluded (it's included via composite key "tag2:instA")
    const tagExclusions = allData.filter(
      (e: any) => e.entityType === "tag" && e.reason === "restricted"
    );
    const excludedTagIds = tagExclusions.map((e: any) => e.entityId);
    expect(excludedTagIds).toContain("tag1");
    expect(excludedTagIds).toContain("tag3");
    expect(excludedTagIds).not.toContain("tag2");
  });

  it("should process INCLUDE mode for studios — excludes all studios not in list", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      {
        userId: 1,
        entityType: "studios",
        mode: "INCLUDE",
        entityIds: JSON.stringify(["studioA"]),
      },
    ]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([]);
    mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 2 });

    mockPrisma.stashStudio = {
      ...mockPrisma.stashStudio,
      findMany: vi.fn().mockResolvedValue([
        { id: "studioA" },
        { id: "studioB" },
        { id: "studioC" },
      ]),
    };

    await exclusionComputationService.recomputeForUser(1);

    const calls = mockPrisma.userExcludedEntity.createMany.mock.calls;
    const allData = calls.flatMap((c: any) => c[0].data);

    const studioExclusions = allData.filter(
      (e: any) => e.entityType === "studio" && e.reason === "restricted"
    );
    const excludedStudioIds = studioExclusions.map((e: any) => e.entityId);
    expect(excludedStudioIds).toContain("studioB");
    expect(excludedStudioIds).toContain("studioC");
    expect(excludedStudioIds).not.toContain("studioA");
  });

  it("should process INCLUDE mode for galleries", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      {
        userId: 1,
        entityType: "galleries",
        mode: "INCLUDE",
        entityIds: JSON.stringify(["gal1:instA", "gal2"]),
      },
    ]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([]);
    mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 1 });

    mockPrisma.stashGallery = {
      ...mockPrisma.stashGallery,
      findMany: vi.fn().mockResolvedValue([
        { id: "gal1" },
        { id: "gal2" },
        { id: "gal3" },
      ]),
    };

    await exclusionComputationService.recomputeForUser(1);

    const calls = mockPrisma.userExcludedEntity.createMany.mock.calls;
    const allData = calls.flatMap((c: any) => c[0].data);

    const galleryExclusions = allData.filter(
      (e: any) => e.entityType === "gallery" && e.reason === "restricted"
    );
    const excludedGalleryIds = galleryExclusions.map((e: any) => e.entityId);
    // gal1 (from "gal1:instA") and gal2 (bare) are included
    expect(excludedGalleryIds).toContain("gal3");
    expect(excludedGalleryIds).not.toContain("gal1");
    expect(excludedGalleryIds).not.toContain("gal2");
  });
});

describe("error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([]);
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockPrisma.scenePerformer.findMany.mockResolvedValue([]);
    mockPrisma.stashScene.findMany.mockResolvedValue([]);
    mockPrisma.sceneTag.findMany.mockResolvedValue([]);
    mockPrisma.performerTag.findMany.mockResolvedValue([]);
    mockPrisma.studioTag.findMany.mockResolvedValue([]);
    mockPrisma.groupTag.findMany.mockResolvedValue([]);
    mockPrisma.sceneGroup.findMany.mockResolvedValue([]);
    mockPrisma.sceneGallery.findMany.mockResolvedValue([]);
    mockPrisma.imageGallery.findMany.mockResolvedValue([]);
  });

  it("should propagate transaction errors from recomputeForUser", async () => {
    mockPrisma.$transaction.mockRejectedValue(new Error("SQLITE_BUSY"));

    await expect(
      exclusionComputationService.recomputeForUser(1)
    ).rejects.toThrow("SQLITE_BUSY");
  });

  it("should propagate errors from computeDirectExclusions phase", async () => {
    mockPrisma.userContentRestriction.findMany.mockRejectedValue(
      new Error("DB read error")
    );
    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await expect(
      exclusionComputationService.recomputeForUser(1)
    ).rejects.toThrow("DB read error");
  });
});
