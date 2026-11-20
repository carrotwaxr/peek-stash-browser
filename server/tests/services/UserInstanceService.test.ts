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
  getEnabledSyncedInstanceIds,
  getUserAllowedInstanceIds,
  getUserInstanceAccess,
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

    it("getUserAllowedInstanceIds throws on a database error", async () => {
      mockPrisma.stashInstance.findMany.mockRejectedValue(
        new Error("DB connection lost")
      );

      await expect(getUserAllowedInstanceIds(1)).rejects.toThrow(
        "DB connection lost"
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

    it("throws on a database error", async () => {
      mockPrisma.stashInstance.findMany.mockRejectedValue(
        new Error("SQLITE_BUSY")
      );

      await expect(getUserInstanceScope(1)).rejects.toThrow("SQLITE_BUSY");
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
          AND: [
            {
              OR: [
                { stashInstances: { some: { instanceId: "instance-a" } } },
                {
                  stashInstances: {
                    none: {
                      instance: { enabled: true, id: { not: "instance-a" } },
                    },
                  },
                },
                // A limited USER allowed it falls back to it whatever they select
                {
                  role: "USER",
                  instanceAccessLimited: true,
                  instanceAccess: { some: { instanceId: "instance-a" } },
                },
              ],
            },
            // A limited USER without access to the instance never selects it
            {
              NOT: {
                role: "USER",
                instanceAccessLimited: true,
                instanceAccess: { none: { instanceId: "instance-a" } },
              },
            },
          ],
        },
        select: { id: true },
        orderBy: { id: "asc" },
      });
    });
  });

  describe("instance access (#439)", () => {
    const bothEnabled = () =>
      mockPrisma.stashInstance.findMany.mockResolvedValue([
        partialRow({ id: "A", firstSyncedAt: new Date() }),
        partialRow({ id: "B", firstSyncedAt: new Date() }),
      ]);
    const userRow = (
      role: "USER" | "ADMIN",
      limited: boolean,
      access: string[]
    ) =>
      mockPrisma.user.findUnique.mockResolvedValue(
        // The select's shape (role, flag, allow-list), not a whole User row
        {
          role,
          instanceAccessLimited: limited,
          instanceAccess: access.map((instanceId) => ({ instanceId })),
        } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
      );

    it("a limited user with access to A only, no selection, sees [A]", async () => {
      bothEnabled();
      userRow("USER", true, ["A"]);
      mockPrisma.userStashInstance.findMany.mockResolvedValue([]);

      expect(await getUserAllowedInstanceIds(1)).toEqual(["A"]);
      expect(await getUserInstanceScope(1)).toEqual(["A"]);
    });

    it("a selection of B (not allowed) falls back inside the allow-list: [A]", async () => {
      bothEnabled();
      userRow("USER", true, ["A"]);
      mockPrisma.userStashInstance.findMany.mockResolvedValue([
        partialRow({ instanceId: "B" }),
      ]);

      expect(await getUserAllowedInstanceIds(1)).toEqual(["A"]);
      expect(await getUserInstanceScope(1)).toEqual(["A"]);
    });

    it("a selection inside the allow-list narrows it", async () => {
      bothEnabled();
      userRow("USER", true, ["A", "B"]);
      mockPrisma.userStashInstance.findMany.mockResolvedValue([
        partialRow({ instanceId: "B" }),
      ]);

      expect(await getUserAllowedInstanceIds(1)).toEqual(["B"]);
    });

    it("a limited user with no access rows sees nothing, never everything", async () => {
      bothEnabled();
      userRow("USER", true, []);
      mockPrisma.userStashInstance.findMany.mockResolvedValue([]);

      expect(await getUserAllowedInstanceIds(1)).toEqual([]);
      expect(await getUserInstanceScope(1)).toEqual([]);
    });

    it("an admin with instanceAccessLimited and rows for A only still sees [A, B]", async () => {
      bothEnabled();
      userRow("ADMIN", true, ["A"]);
      mockPrisma.userStashInstance.findMany.mockResolvedValue([]);

      expect(await getUserAllowedInstanceIds(1)).toEqual(["A", "B"]);
      expect(await getUserInstanceScope(1)).toEqual(["A", "B"]);
    });

    it("an allowed instance that is disabled leaves nothing", async () => {
      // only B is enabled; the user is allowed A only
      mockPrisma.stashInstance.findMany.mockResolvedValue([
        partialRow({ id: "B", firstSyncedAt: new Date() }),
      ]);
      userRow("USER", true, ["A"]);
      mockPrisma.userStashInstance.findMany.mockResolvedValue([]);

      expect(await getUserAllowedInstanceIds(1)).toEqual([]);
      expect(await getUserInstanceScope(1)).toEqual([]);
    });

    it("the first-sync rule still applies on top of the allow-list", async () => {
      mockPrisma.stashInstance.findMany.mockResolvedValue([
        partialRow({ id: "A", firstSyncedAt: null }),
        partialRow({ id: "B", firstSyncedAt: new Date() }),
      ]);
      userRow("USER", true, ["A", "B"]);
      mockPrisma.userStashInstance.findMany.mockResolvedValue([]);

      expect(await getUserInstanceScope(1)).toEqual(["A", "B"]);
      expect(await getUserAllowedInstanceIds(1)).toEqual(["B"]);
    });

    describe("getUserInstanceAccess", () => {
      it("is null for an unlimited user", async () => {
        userRow("USER", false, ["A"]);
        expect(await getUserInstanceAccess(1)).toBeNull();
      });

      it("is null for an admin, limited flag or not", async () => {
        userRow("ADMIN", true, ["A"]);
        expect(await getUserInstanceAccess(1)).toBeNull();
      });

      it("is null for a missing user", async () => {
        mockPrisma.user.findUnique.mockResolvedValue(null);
        expect(await getUserInstanceAccess(1)).toBeNull();
      });

      it("is the allowed ids, enabled or not, for a limited user", async () => {
        userRow("USER", true, ["A", "disabled-z"]);
        expect(await getUserInstanceAccess(7)).toEqual(["A", "disabled-z"]);
        expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
          where: { id: 7 },
          select: {
            role: true,
            instanceAccessLimited: true,
            instanceAccess: { select: { instanceId: true } },
          },
        });
      });

      it("throws on a database error", async () => {
        mockPrisma.user.findUnique.mockRejectedValue(new Error("SQLITE_BUSY"));
        await expect(getUserInstanceAccess(1)).rejects.toThrow("SQLITE_BUSY");
      });
    });
  });

  describe("getEnabledSyncedInstanceIds", () => {
    it("lists every enabled instance past its first sync, whatever any selection", async () => {
      mockPrisma.stashInstance.findMany.mockResolvedValue([
        partialRow({ id: "instance-a" }),
        partialRow({ id: "instance-b" }),
      ]);

      expect(await getEnabledSyncedInstanceIds()).toEqual([
        "instance-a",
        "instance-b",
      ]);
      expect(mockPrisma.stashInstance.findMany).toHaveBeenCalledWith({
        where: { enabled: true, firstSyncedAt: { not: null } },
        select: { id: true },
      });
      expect(mockPrisma.userStashInstance.findMany).not.toHaveBeenCalled();
    });

    it("throws on a database error", async () => {
      mockPrisma.stashInstance.findMany.mockRejectedValue(
        new Error("SQLITE_BUSY")
      );

      await expect(getEnabledSyncedInstanceIds()).rejects.toThrow(
        "SQLITE_BUSY"
      );
    });
  });
});
