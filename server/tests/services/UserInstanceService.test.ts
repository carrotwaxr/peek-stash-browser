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
  getUserInstanceScope,
  getUsersSelecting,
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

    it("a selection whose instances are all disabled means every enabled instance", async () => {
      // A selection only narrows (invariant 11): once the admin disables
      // every instance the user picked, they see what a user with no
      // selection sees, not nothing (which answers 503 forever)
      mockPrisma.stashInstance.findMany.mockResolvedValue([
        partialRow({ id: "instance-a", firstSyncedAt: new Date() }),
        partialRow({ id: "instance-c", firstSyncedAt: new Date() }),
      ]);
      // User only selected instance-b which is now disabled
      mockPrisma.userStashInstance.findMany.mockResolvedValue([
        partialRow({ instanceId: "instance-b" }),
      ]);

      const result = await getUserAllowedInstanceIds(1);

      expect(result).toEqual(["instance-a", "instance-c"]);
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
        select: { id: true, firstSyncedAt: true },
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

  describe("getUserInstanceScope", () => {
    it("an empty selection means every enabled instance", async () => {
      mockPrisma.stashInstance.findMany.mockResolvedValue([
        partialRow({ id: "instance-a" }),
        partialRow({ id: "instance-b" }),
      ]);
      mockPrisma.userStashInstance.findMany.mockResolvedValue([]);

      expect(await getUserInstanceScope(1)).toEqual([
        "instance-a",
        "instance-b",
      ]);
      expect(mockPrisma.stashInstance.findMany).toHaveBeenCalledWith({
        where: { enabled: true },
        select: { id: true, firstSyncedAt: true },
      });
    });

    it("a selection is narrowed to the enabled instances", async () => {
      mockPrisma.stashInstance.findMany.mockResolvedValue([
        partialRow({ id: "instance-a" }),
        partialRow({ id: "instance-b" }),
      ]);
      mockPrisma.userStashInstance.findMany.mockResolvedValue([
        partialRow({ instanceId: "instance-b" }),
        partialRow({ instanceId: "disabled-c" }),
      ]);

      expect(await getUserInstanceScope(1)).toEqual(["instance-b"]);
    });

    it("getUserAllowedInstanceIds leaves out instances without firstSyncedAt; getUserInstanceScope keeps them", async () => {
      // instance-b is on its first sync: its users' exclusions are computed
      // over it (the scope), and nobody sees it yet (allowed)
      mockPrisma.stashInstance.findMany.mockResolvedValue([
        partialRow({
          id: "instance-a",
          firstSyncedAt: new Date("2026-09-25T10:00:00Z"),
        }),
        partialRow({ id: "instance-b", firstSyncedAt: null }),
      ]);
      mockPrisma.userStashInstance.findMany.mockResolvedValue([]);

      expect(await getUserAllowedInstanceIds(1)).toEqual(["instance-a"]);
      expect(await getUserInstanceScope(1)).toEqual([
        "instance-a",
        "instance-b",
      ]);

      // A selection of the syncing instance alone: nothing to show yet
      mockPrisma.userStashInstance.findMany.mockResolvedValue([
        partialRow({ instanceId: "instance-b" }),
      ]);

      expect(await getUserAllowedInstanceIds(1)).toEqual([]);
      expect(await getUserInstanceScope(1)).toEqual(["instance-b"]);
    });

    it("a selection whose instances are all disabled means every enabled instance, first-syncing ones included; the allowed list keeps the ready ones", async () => {
      mockPrisma.stashInstance.findMany.mockResolvedValue([
        partialRow({
          id: "instance-a",
          firstSyncedAt: new Date("2026-09-25T10:00:00Z"),
        }),
        partialRow({ id: "instance-b", firstSyncedAt: null }),
      ]);
      mockPrisma.userStashInstance.findMany.mockResolvedValue([
        partialRow({ instanceId: "disabled-c" }),
      ]);

      expect(await getUserInstanceScope(1)).toEqual([
        "instance-a",
        "instance-b",
      ]);
      expect(await getUserAllowedInstanceIds(1)).toEqual(["instance-a"]);

      // Every enabled instance still on its first sync: nothing to show yet,
      // so the 503 "initializing" stays until that sync's recompute has run
      mockPrisma.stashInstance.findMany.mockResolvedValue([
        partialRow({ id: "instance-b", firstSyncedAt: null }),
      ]);

      expect(await getUserInstanceScope(1)).toEqual(["instance-b"]);
      expect(await getUserAllowedInstanceIds(1)).toEqual([]);
    });

    it("throws on a database error, where getUserAllowedInstanceIds answers none", async () => {
      mockPrisma.stashInstance.findMany.mockRejectedValue(
        new Error("SQLITE_BUSY")
      );

      await expect(getUserInstanceScope(1)).rejects.toThrow("SQLITE_BUSY");
      expect(await getUserAllowedInstanceIds(1)).toEqual([]);
    });
  });

  describe("getUsersSelecting", () => {
    it("lists the users whose scope holds the instance in either enabled state: a selection naming it, or one without another enabled instance (none at all included)", async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        partialRow({ id: 1 }),
        partialRow({ id: 3 }),
      ]);

      expect(await getUsersSelecting("instance-a")).toEqual([1, 3]);
      // A user who selected only disabled instances sees every enabled one,
      // so enabling or disabling instance-a changes what they see too
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { stashInstances: { some: { instanceId: "instance-a" } } },
            {
              stashInstances: {
                none: {
                  instance: { enabled: true, id: { not: "instance-a" } },
                },
              },
            },
          ],
        },
        select: { id: true },
        orderBy: { id: "asc" },
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
