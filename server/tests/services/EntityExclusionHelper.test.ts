import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma before importing
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    userExcludedEntity: {
      findMany: vi.fn(),
    },
  },
}));

import { entityExclusionHelper } from "../../services/EntityExclusionHelper.js";
import prisma from "../../prisma/singleton.js";

const mockPrisma = vi.mocked(prisma);

describe("EntityExclusionHelper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("filterExcluded", () => {
    it("filters entities by ID from the exclusion table", async () => {
      (mockPrisma.userExcludedEntity.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { entityId: "2", instanceId: "" },
      ]);

      const entities = [
        { id: "1", name: "Entity 1" },
        { id: "2", name: "Entity 2" },
        { id: "3", name: "Entity 3" },
      ];

      const result = await entityExclusionHelper.filterExcluded(entities, 1, "performer");
      expect(result).toHaveLength(2);
      expect(result.map(e => e.id)).toEqual(["1", "3"]);
    });

    it("returns all entities when userId is undefined", async () => {
      const entities = [
        { id: "1", name: "Entity 1" },
        { id: "2", name: "Entity 2" },
      ];

      const result = await entityExclusionHelper.filterExcluded(entities, undefined, "performer");
      expect(result).toHaveLength(2);
    });

    it("handles instance-scoped exclusions correctly for multi-instance entities", async () => {
      // BUG FIX TEST: Entity with id "2" is excluded only for instance "instA"
      // Entity with id "2" from "instB" should NOT be excluded
      (mockPrisma.userExcludedEntity.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { entityId: "2", instanceId: "instA" },
      ]);

      // Callers pass normalized entities which use `instanceId`, not `stashInstanceId`
      const entities = [
        { id: "1", name: "Entity 1", instanceId: "instA" },
        { id: "2", name: "Entity 2A", instanceId: "instA" },
        { id: "2", name: "Entity 2B", instanceId: "instB" },
        { id: "3", name: "Entity 3", instanceId: "instB" },
      ];

      const result = await entityExclusionHelper.filterExcluded(entities, 1, "performer");

      // Entity 2 from instA should be excluded, but Entity 2 from instB should remain
      expect(result).toHaveLength(3);
      expect(result.map(e => e.name)).toEqual(["Entity 1", "Entity 2B", "Entity 3"]);
    });

    it("handles global exclusions (empty instanceId) that apply to all instances", async () => {
      // Global exclusion (empty instanceId) should exclude entity from ALL instances
      (mockPrisma.userExcludedEntity.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { entityId: "2", instanceId: "" },
      ]);

      // Callers pass normalized entities which use `instanceId`, not `stashInstanceId`
      const entities = [
        { id: "1", name: "Entity 1", instanceId: "instA" },
        { id: "2", name: "Entity 2A", instanceId: "instA" },
        { id: "2", name: "Entity 2B", instanceId: "instB" },
        { id: "3", name: "Entity 3", instanceId: "instB" },
      ];

      const result = await entityExclusionHelper.filterExcluded(entities, 1, "performer");

      // Global exclusion: entity "2" excluded from ALL instances
      expect(result).toHaveLength(2);
      expect(result.map(e => e.name)).toEqual(["Entity 1", "Entity 3"]);
    });
  });

  describe("getExcludedIds", () => {
    it("returns a Set of excluded entity IDs", async () => {
      (mockPrisma.userExcludedEntity.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { entityId: "1", instanceId: "" },
        { entityId: "2", instanceId: "instA" },
      ]);

      const result = await entityExclusionHelper.getExcludedIds(1, "scene");
      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(2);
      expect(result.has("1")).toBe(true);
      expect(result.has("2")).toBe(true);
    });

    it("returns scoped exclusion data for instance-aware filtering", async () => {
      // getExcludedIds should return data that allows callers to differentiate
      // between global and instance-scoped exclusions
      (mockPrisma.userExcludedEntity.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { entityId: "1", instanceId: "" },
        { entityId: "2", instanceId: "instA" },
      ]);

      const result = await entityExclusionHelper.getExcludedIds(1, "scene");

      // For backward compatibility, getExcludedIds returns a flat Set of IDs
      // (callers that need instance awareness use filterExcluded instead)
      expect(result.has("1")).toBe(true);
      expect(result.has("2")).toBe(true);
    });
  });
});
