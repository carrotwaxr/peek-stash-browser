import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock prisma
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    performerTag: { findMany: vi.fn().mockResolvedValue([]) },
    scenePerformer: { findMany: vi.fn().mockResolvedValue([]) },
    galleryPerformer: { findMany: vi.fn().mockResolvedValue([]) },
    sceneGroup: { findMany: vi.fn().mockResolvedValue([]) },
    sceneGallery: { findMany: vi.fn().mockResolvedValue([]) },
    stashScene: { findMany: vi.fn().mockResolvedValue([]) },
    stashTag: { findMany: vi.fn().mockResolvedValue([]) },
    stashGroup: { findMany: vi.fn().mockResolvedValue([]) },
    stashGallery: { findMany: vi.fn().mockResolvedValue([]) },
    stashStudio: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

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

// Mock hierarchy utils (expandTagIds)
vi.mock("../../utils/hierarchyUtils.js", () => ({
  expandTagIds: vi.fn().mockResolvedValue([]),
}));

// Mock titleUtils
vi.mock("../../utils/titleUtils.js", () => ({
  getGalleryFallbackTitle: vi.fn().mockReturnValue("Untitled Gallery"),
}));

import prisma from "../../prisma/singleton.js";
import { performerQueryBuilder } from "../../services/PerformerQueryBuilder.js";

const mockPrisma = vi.mocked(prisma);

describe("PerformerQueryBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: main query returns empty, count query returns {total: 0}
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([]) // main query
      .mockResolvedValueOnce([{ total: 0 }]); // count query
  });

  describe("multi-instance support", () => {
    it("Stats JOIN includes instanceId condition to prevent cross-instance collision", async () => {
      await performerQueryBuilder.execute({
        userId: 1,
        sort: "name",
        sortDirection: "ASC",
        page: 1,
        perPage: 10,
      });

      const mainQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[0][0] as string;

      // The Stats JOIN (UserPerformerStats) must match on instanceId
      expect(mainQuerySql).toContain("p.stashInstanceId = s.instanceId");

      // The Rating JOIN (PerformerRating) must also match on instanceId
      expect(mainQuerySql).toContain("p.stashInstanceId = r.instanceId");
    });

    it("count query also includes instanceId in JOINs", async () => {
      await performerQueryBuilder.execute({
        userId: 1,
        sort: "name",
        sortDirection: "ASC",
        page: 1,
        perPage: 10,
      });

      // The count query (second call) also uses the same FROM clause with JOINs
      const countQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[1][0] as string;
      expect(countQuerySql).toContain("p.stashInstanceId = s.instanceId");
      expect(countQuerySql).toContain("p.stashInstanceId = r.instanceId");
    });

    it("filters to a specific instance when specificInstanceId is provided", async () => {
      await performerQueryBuilder.execute({
        userId: 1,
        sort: "name",
        sortDirection: "ASC",
        page: 1,
        perPage: 10,
        specificInstanceId: "instance-abc",
      });

      const mainQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[0][0] as string;

      // Must contain a WHERE clause pinning to the specific instance
      expect(mainQuerySql).toContain("p.stashInstanceId = ?");

      // The instance ID must be in the params
      const mainQueryParams = mockPrisma.$queryRawUnsafe.mock.calls[0].slice(1);
      expect(mainQueryParams).toContain("instance-abc");
    });

    it("does not add specific instance filter when specificInstanceId is not provided", async () => {
      await performerQueryBuilder.execute({
        userId: 1,
        sort: "name",
        sortDirection: "ASC",
        page: 1,
        perPage: 10,
      });

      const mainQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[0][0] as string;

      // Should NOT have a bare equality check for stashInstanceId
      expect(mainQuerySql).not.toContain("p.stashInstanceId = ?");
    });
  });
});
