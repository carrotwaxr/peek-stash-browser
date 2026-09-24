/**
 * Unit Tests for UserInstanceService
 *
 * Tests the per-user instance filtering logic that determines which Stash
 * instances a user can see content from. Critical for multi-instance setups
 * where users may have selective access.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import {
  buildInstanceFilterClause,
  getUserAllowedInstanceIds,
} from "../../services/UserInstanceService.js";
import { partialRow } from "../helpers/prismaMock.js";

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

const mockPrisma = vi.mocked(prisma, true);

describe("UserInstanceService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getUserAllowedInstanceIds", () => {
    it("returns all enabled instances when user has no selections", async () => {
      mockPrisma.stashInstance.findMany.mockResolvedValue([
        partialRow({ id: "instance-a" }),
        partialRow({ id: "instance-b" }),
      ]);
      mockPrisma.userStashInstance.findMany.mockResolvedValue([]);

      const result = await getUserAllowedInstanceIds(1);

      expect(result).toEqual(["instance-a", "instance-b"]);
    });

    it("returns only selected instances when user has selections", async () => {
      mockPrisma.stashInstance.findMany.mockResolvedValue([
        partialRow({ id: "instance-a" }),
        partialRow({ id: "instance-b" }),
        partialRow({ id: "instance-c" }),
      ]);
      mockPrisma.userStashInstance.findMany.mockResolvedValue([
        partialRow({ instanceId: "instance-a" }),
        partialRow({ instanceId: "instance-c" }),
      ]);

      const result = await getUserAllowedInstanceIds(1);

      expect(result).toEqual(["instance-a", "instance-c"]);
      expect(result).not.toContain("instance-b");
    });

    it("filters out disabled instances from user selections", async () => {
      // Only instance-a is enabled
      mockPrisma.stashInstance.findMany.mockResolvedValue([
        partialRow({ id: "instance-a" }),
      ]);
      // User selected both instance-a and instance-b (which is now disabled)
      mockPrisma.userStashInstance.findMany.mockResolvedValue([
        partialRow({ instanceId: "instance-a" }),
        partialRow({ instanceId: "instance-b" }),
      ]);

      const result = await getUserAllowedInstanceIds(1);

      expect(result).toEqual(["instance-a"]);
    });

    it("returns empty array when user selects only disabled instances", async () => {
      mockPrisma.stashInstance.findMany.mockResolvedValue([
        partialRow({ id: "instance-a" }),
      ]);
      // User only selected instance-b which is now disabled
      mockPrisma.userStashInstance.findMany.mockResolvedValue([
        partialRow({ instanceId: "instance-b" }),
      ]);

      const result = await getUserAllowedInstanceIds(1);

      expect(result).toEqual([]);
    });

    it("returns empty array when no instances are enabled", async () => {
      mockPrisma.stashInstance.findMany.mockResolvedValue([]);
      mockPrisma.userStashInstance.findMany.mockResolvedValue([]);

      const result = await getUserAllowedInstanceIds(1);

      expect(result).toEqual([]);
    });

    it("returns empty array on database error (fail-safe)", async () => {
      mockPrisma.stashInstance.findMany.mockRejectedValue(
        new Error("DB connection lost")
      );

      const { logger } = await import("../../utils/logger.js");
      const result = await getUserAllowedInstanceIds(1);

      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to get user allowed instance IDs",
        expect.objectContaining({ userId: 1 })
      );
    });

    it("queries stashInstance with enabled filter", async () => {
      mockPrisma.stashInstance.findMany.mockResolvedValue([]);
      mockPrisma.userStashInstance.findMany.mockResolvedValue([]);

      await getUserAllowedInstanceIds(42);

      expect(mockPrisma.stashInstance.findMany).toHaveBeenCalledWith({
        where: { enabled: true },
        select: { id: true },
      });
    });

    it("queries userStashInstance for the correct user", async () => {
      mockPrisma.stashInstance.findMany.mockResolvedValue([]);
      mockPrisma.userStashInstance.findMany.mockResolvedValue([]);

      await getUserAllowedInstanceIds(42);

      expect(mockPrisma.userStashInstance.findMany).toHaveBeenCalledWith({
        where: { userId: 42 },
        select: { instanceId: true },
      });
    });
  });

  describe("buildInstanceFilterClause", () => {
    it("returns false condition for empty array (blocks all content)", () => {
      const result = buildInstanceFilterClause([]);

      expect(result.sql).toBe("1 = 0");
      expect(result.params).toEqual([]);
    });

    it("builds IN clause for single instance", () => {
      const result = buildInstanceFilterClause(["instance-a"]);

      expect(result.sql).toBe("s.stashInstanceId IN (?)");
      expect(result.params).toEqual(["instance-a"]);
    });

    it("builds IN clause for multiple instances", () => {
      const result = buildInstanceFilterClause([
        "instance-a",
        "instance-b",
        "instance-c",
      ]);

      expect(result.sql).toBe("s.stashInstanceId IN (?, ?, ?)");
      expect(result.params).toEqual(["instance-a", "instance-b", "instance-c"]);
    });

    it("uses custom column name", () => {
      const result = buildInstanceFilterClause(
        ["instance-a"],
        "p.stashInstanceId"
      );

      expect(result.sql).toBe("p.stashInstanceId IN (?)");
    });

    it("defaults to s.stashInstanceId column name", () => {
      const result = buildInstanceFilterClause(["instance-a"]);

      expect(result.sql).toContain("s.stashInstanceId");
    });
  });
});
