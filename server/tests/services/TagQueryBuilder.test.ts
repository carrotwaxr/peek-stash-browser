import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import { tagQueryBuilder } from "../../services/TagQueryBuilder.js";
import { must } from "../helpers/must.js";

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

// Mock hierarchy utils (expandTagIds)
vi.mock("../../utils/hierarchyUtils.js", () => ({
  expandTagIds: vi.fn().mockResolvedValue([]),
}));

// Mock titleUtils
vi.mock("../../utils/titleUtils.js", () => ({
  getGalleryFallbackTitle: vi.fn().mockReturnValue("Untitled Gallery"),
}));

// Keep every tooltip relation, so the visibility query doesn't consume the
// mocked $queryRawUnsafe sequences
vi.mock("../../services/EntityAccessService.js", () => ({
  keepVisibleConditions: vi.fn((_u: number, _t: string, c: unknown[]) =>
    Promise.resolve(c)
  ),
}));

const mockPrisma = vi.mocked(prisma, true);

describe("TagQueryBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    mockPrisma.performerTag.findMany.mockResolvedValue([]);
    mockPrisma.studioTag.findMany.mockResolvedValue([]);
    mockPrisma.groupTag.findMany.mockResolvedValue([]);
    mockPrisma.galleryTag.findMany.mockResolvedValue([]);
    mockPrisma.stashTag.findMany.mockResolvedValue([]);
    mockPrisma.stashPerformer.findMany.mockResolvedValue([]);
    mockPrisma.stashStudio.findMany.mockResolvedValue([]);
    mockPrisma.stashGroup.findMany.mockResolvedValue([]);
    mockPrisma.stashGallery.findMany.mockResolvedValue([]);
    // Default: main query returns empty, count query returns {total: 0}
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([]) // main query
      .mockResolvedValueOnce([{ total: 0 }]); // count query
  });

  describe("multi-instance support", () => {
    it("Stats JOIN includes instanceId condition to prevent cross-instance collision", async () => {
      await tagQueryBuilder.execute({
        userId: 1,
        sort: "name",
        sortDirection: "ASC",
        page: 1,
        perPage: 10,
      });

      const mainQuerySql = must(mockPrisma.$queryRawUnsafe.mock.calls[0])[0];

      // The Stats JOIN (UserTagStats) must match on instanceId
      // TagQueryBuilder uses 't' for entity and 'us' for stats
      expect(mainQuerySql).toContain("t.stashInstanceId = us.instanceId");

      // The Rating JOIN (TagRating) must also match on instanceId
      expect(mainQuerySql).toContain("t.stashInstanceId = r.instanceId");
    });

    it("count query also includes instanceId in JOINs", async () => {
      await tagQueryBuilder.execute({
        userId: 1,
        sort: "name",
        sortDirection: "ASC",
        page: 1,
        perPage: 10,
      });

      // The count query (second call) also uses the same FROM clause with JOINs
      const countQuerySql = must(mockPrisma.$queryRawUnsafe.mock.calls[1])[0];
      expect(countQuerySql).toContain("t.stashInstanceId = us.instanceId");
      expect(countQuerySql).toContain("t.stashInstanceId = r.instanceId");
    });

    it("filters to a specific instance when specificInstanceId is provided", async () => {
      await tagQueryBuilder.execute({
        userId: 1,
        sort: "name",
        sortDirection: "ASC",
        page: 1,
        perPage: 10,
        specificInstanceId: "instance-abc",
      });

      const mainQuerySql = must(mockPrisma.$queryRawUnsafe.mock.calls[0])[0];

      // Must contain a WHERE clause pinning to the specific instance
      expect(mainQuerySql).toContain("t.stashInstanceId = ?");

      // The instance ID must be in the params
      const mainQueryParams = must(
        mockPrisma.$queryRawUnsafe.mock.calls[0]
      ).slice(1);
      expect(mainQueryParams).toContain("instance-abc");
    });

    it("does not add specific instance filter when specificInstanceId is not provided", async () => {
      await tagQueryBuilder.execute({
        userId: 1,
        sort: "name",
        sortDirection: "ASC",
        page: 1,
        perPage: 10,
      });

      const mainQuerySql = must(mockPrisma.$queryRawUnsafe.mock.calls[0])[0];

      // Should NOT have a bare equality check for stashInstanceId
      // (allowedInstanceIds uses IN, not =)
      expect(mainQuerySql).not.toContain("t.stashInstanceId = ?");
    });
  });
});
