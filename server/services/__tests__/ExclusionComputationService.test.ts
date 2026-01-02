import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma before importing service
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    $transaction: vi.fn(),
    userExcludedEntity: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
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
