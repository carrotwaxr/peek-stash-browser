import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma before importing service
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
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
    },
    stashGallery: {
      count: vi.fn(),
    },
    stashImage: {
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

// Mock StashCacheManager for INCLUDE mode inversion
vi.mock("../StashCacheManager.js", () => ({
  stashCacheManager: {
    getAllTags: vi.fn(() => []),
    getAllStudios: vi.fn(() => []),
    getAllGroups: vi.fn(() => []),
    getAllGalleries: vi.fn(() => []),
  },
}));

import { exclusionComputationService } from "../ExclusionComputationService.js";
import prisma from "../../prisma/singleton.js";

const mockPrisma = prisma as any;

describe("ExclusionComputationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("recomputeForUser", () => {
    it("should be a callable method", () => {
      expect(typeof exclusionComputationService.recomputeForUser).toBe("function");
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

    // Mock raw queries - all entities have visible content (return populated content)
    let queryCallCount = 0;
    mockPrisma.$queryRaw = vi.fn().mockImplementation(() => {
      queryCallCount++;
      switch (queryCallCount) {
        // Query 1: galleries - gallery1 has visible image
        case 1: return Promise.resolve([
          { galleryId: "gallery1", imageId: "image1" },
        ]);
        // Query 2: performers - performer1 has visible scene
        case 2: return Promise.resolve([
          { performerId: "performer1", sceneId: "scene1", imageId: null },
        ]);
        // Query 3: studios - studio1 has visible scene
        case 3: return Promise.resolve([
          { studioId: "studio1", sceneId: "scene1", imageId: null },
        ]);
        // Query 4: groups - group1 has visible scene
        case 4: return Promise.resolve([
          { groupId: "group1", sceneId: "scene1" },
        ]);
        // Query 5: tags - tag1 has visible scene
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
          userId_entityType_entityId: {
            userId: 1,
            entityType: "performer",
            entityId: "perf1",
          },
        },
        create: expect.objectContaining({ reason: "hidden" }),
        update: expect.objectContaining({ reason: "hidden" }),
      })
    );

    // Verify cascade exclusions were created
    expect(mockPrisma.userExcludedEntity.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            userId: 1,
            entityType: "scene",
            entityId: "scene1",
            reason: "cascade",
          }),
          expect.objectContaining({
            userId: 1,
            entityType: "scene",
            entityId: "scene2",
            reason: "cascade",
          }),
        ]),
        skipDuplicates: true,
      })
    );
  });

  it("should add hidden exclusion and cascade to scenes for studio", async () => {
    mockPrisma.userExcludedEntity.upsert.mockResolvedValue({});
    mockPrisma.stashScene.findMany.mockResolvedValue([
      { id: "scene1", studioId: "studio1" },
    ]);
    mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.addHiddenEntity(1, "studio", "studio1");

    expect(mockPrisma.userExcludedEntity.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_entityType_entityId: {
            userId: 1,
            entityType: "studio",
            entityId: "studio1",
          },
        },
      })
    );
    expect(mockPrisma.stashScene.findMany).toHaveBeenCalledWith({
      where: { studioId: "studio1", deletedAt: null },
      select: { id: true },
    });
    expect(mockPrisma.userExcludedEntity.createMany).toHaveBeenCalled();
  });

  it("should add hidden exclusion and cascade for tag to scenes, performers, studios, and groups", async () => {
    mockPrisma.userExcludedEntity.upsert.mockResolvedValue({});
    mockPrisma.sceneTag.findMany.mockResolvedValue([{ sceneId: "scene1", tagId: "tag1" }]);
    mockPrisma.$queryRaw.mockResolvedValue([{ id: "scene2" }]); // inherited tag scene
    mockPrisma.performerTag.findMany.mockResolvedValue([{ performerId: "perf1", tagId: "tag1" }]);
    mockPrisma.studioTag.findMany.mockResolvedValue([{ studioId: "studio1", tagId: "tag1" }]);
    mockPrisma.groupTag.findMany.mockResolvedValue([{ groupId: "group1", tagId: "tag1" }]);
    mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 5 });
    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.addHiddenEntity(1, "tag", "tag1");

    expect(mockPrisma.sceneTag.findMany).toHaveBeenCalledWith({
      where: { tagId: "tag1" },
      select: { sceneId: true },
    });
    expect(mockPrisma.performerTag.findMany).toHaveBeenCalledWith({
      where: { tagId: "tag1" },
      select: { performerId: true },
    });
    expect(mockPrisma.studioTag.findMany).toHaveBeenCalledWith({
      where: { tagId: "tag1" },
      select: { studioId: true },
    });
    expect(mockPrisma.groupTag.findMany).toHaveBeenCalledWith({
      where: { tagId: "tag1" },
      select: { groupId: true },
    });

    const createManyCall = mockPrisma.userExcludedEntity.createMany.mock.calls[0][0];
    expect(createManyCall.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityType: "scene", entityId: "scene1" }),
        expect.objectContaining({ entityType: "scene", entityId: "scene2" }),
        expect.objectContaining({ entityType: "performer", entityId: "perf1" }),
        expect.objectContaining({ entityType: "studio", entityId: "studio1" }),
        expect.objectContaining({ entityType: "group", entityId: "group1" }),
      ])
    );
  });

  it("should add hidden exclusion and cascade for group to scenes", async () => {
    mockPrisma.userExcludedEntity.upsert.mockResolvedValue({});
    mockPrisma.sceneGroup.findMany.mockResolvedValue([
      { sceneId: "scene1", groupId: "group1" },
      { sceneId: "scene2", groupId: "group1" },
    ]);
    mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 2 });
    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.addHiddenEntity(1, "group", "group1");

    expect(mockPrisma.sceneGroup.findMany).toHaveBeenCalledWith({
      where: { groupId: "group1" },
      select: { sceneId: true },
    });
    expect(mockPrisma.userExcludedEntity.createMany).toHaveBeenCalled();
  });

  it("should add hidden exclusion and cascade for gallery to scenes and images", async () => {
    mockPrisma.userExcludedEntity.upsert.mockResolvedValue({});
    mockPrisma.sceneGallery.findMany.mockResolvedValue([{ sceneId: "scene1", galleryId: "gallery1" }]);
    mockPrisma.imageGallery.findMany.mockResolvedValue([
      { imageId: "image1", galleryId: "gallery1" },
      { imageId: "image2", galleryId: "gallery1" },
    ]);
    mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 3 });
    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.addHiddenEntity(1, "gallery", "gallery1");

    expect(mockPrisma.sceneGallery.findMany).toHaveBeenCalledWith({
      where: { galleryId: "gallery1" },
      select: { sceneId: true },
    });
    expect(mockPrisma.imageGallery.findMany).toHaveBeenCalledWith({
      where: { galleryId: "gallery1" },
      select: { imageId: true },
    });

    const createManyCall = mockPrisma.userExcludedEntity.createMany.mock.calls[0][0];
    expect(createManyCall.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityType: "scene", entityId: "scene1" }),
        expect.objectContaining({ entityType: "image", entityId: "image1" }),
        expect.objectContaining({ entityType: "image", entityId: "image2" }),
      ])
    );
  });

  it("should not call createMany when there are no cascade exclusions", async () => {
    mockPrisma.userExcludedEntity.upsert.mockResolvedValue({});
    mockPrisma.scenePerformer.findMany.mockResolvedValue([]); // No scenes for this performer
    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.addHiddenEntity(1, "performer", "perf-no-scenes");

    expect(mockPrisma.userExcludedEntity.upsert).toHaveBeenCalled();
    expect(mockPrisma.userExcludedEntity.createMany).not.toHaveBeenCalled();
  });

  it("should use skipDuplicates when creating cascade exclusions", async () => {
    mockPrisma.userExcludedEntity.upsert.mockResolvedValue({});
    mockPrisma.scenePerformer.findMany.mockResolvedValue([{ sceneId: "scene1", performerId: "perf1" }]);
    mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.addHiddenEntity(1, "performer", "perf1");

    expect(mockPrisma.userExcludedEntity.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skipDuplicates: true,
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
