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
    it("returns a flat superset of all excluded IDs when no instanceId is provided", async () => {
      (mockPrisma.userExcludedEntity.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { entityId: "1", instanceId: "" },
        { entityId: "2", instanceId: "instA" },
        { entityId: "3", instanceId: "instB" },
      ]);

      const result = await entityExclusionHelper.getExcludedIds(1, "scene");
      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(3);
      expect(result.has("1")).toBe(true);
      expect(result.has("2")).toBe(true);
      expect(result.has("3")).toBe(true);
    });

    it("returns empty Set when userId is undefined", async () => {
      const result = await entityExclusionHelper.getExcludedIds(undefined, "scene");
      expect(result.size).toBe(0);
    });

    it("returns global + instance-scoped exclusions when instanceId is provided", async () => {
      (mockPrisma.userExcludedEntity.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { entityId: "1", instanceId: "" },       // global - should be included
        { entityId: "2", instanceId: "instA" },   // scoped to instA - should be included
        { entityId: "3", instanceId: "instB" },   // scoped to instB - should NOT be included
      ]);

      const result = await entityExclusionHelper.getExcludedIds(1, "scene", "instA");
      expect(result.size).toBe(2);
      expect(result.has("1")).toBe(true);  // global exclusion
      expect(result.has("2")).toBe(true);  // instA-scoped exclusion
      expect(result.has("3")).toBe(false); // instB-scoped exclusion - not relevant
    });

    it("returns only global exclusions when instanceId has no scoped exclusions", async () => {
      (mockPrisma.userExcludedEntity.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { entityId: "1", instanceId: "" },
        { entityId: "2", instanceId: "instA" },
      ]);

      const result = await entityExclusionHelper.getExcludedIds(1, "scene", "instC");
      expect(result.size).toBe(1);
      expect(result.has("1")).toBe(true);  // global exclusion
      expect(result.has("2")).toBe(false); // instA-scoped - not relevant for instC
    });

    it("deduplicates when entity has both global and scoped exclusion", async () => {
      (mockPrisma.userExcludedEntity.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { entityId: "1", instanceId: "" },       // global
        { entityId: "1", instanceId: "instA" },   // also scoped to instA
      ]);

      const result = await entityExclusionHelper.getExcludedIds(1, "scene", "instA");
      expect(result.size).toBe(1);
      expect(result.has("1")).toBe(true);
    });
  });

  describe("getExclusionData", () => {
    it("returns structured exclusion data with global and scoped sets", async () => {
      (mockPrisma.userExcludedEntity.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { entityId: "1", instanceId: "" },
        { entityId: "2", instanceId: "instA" },
        { entityId: "3", instanceId: "instB" },
      ]);

      const result = await entityExclusionHelper.getExclusionData(1, "scene");

      expect(result.globalIds.size).toBe(1);
      expect(result.globalIds.has("1")).toBe(true);

      expect(result.scopedKeys.size).toBe(2);
      expect(result.scopedKeys.has("2:instA")).toBe(true);
      expect(result.scopedKeys.has("3:instB")).toBe(true);
    });

    it("returns empty sets when userId is undefined", async () => {
      const result = await entityExclusionHelper.getExclusionData(undefined, "scene");
      expect(result.globalIds.size).toBe(0);
      expect(result.scopedKeys.size).toBe(0);
    });

    it("handles records with only global exclusions", async () => {
      (mockPrisma.userExcludedEntity.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { entityId: "1", instanceId: "" },
        { entityId: "2", instanceId: "" },
      ]);

      const result = await entityExclusionHelper.getExclusionData(1, "scene");
      expect(result.globalIds.size).toBe(2);
      expect(result.scopedKeys.size).toBe(0);
    });

    it("handles records with only scoped exclusions", async () => {
      (mockPrisma.userExcludedEntity.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { entityId: "1", instanceId: "instA" },
        { entityId: "2", instanceId: "instB" },
      ]);

      const result = await entityExclusionHelper.getExclusionData(1, "scene");
      expect(result.globalIds.size).toBe(0);
      expect(result.scopedKeys.size).toBe(2);
    });
  });

  describe("isExcluded", () => {
    it("returns true for globally excluded entities", () => {
      const exclusionData = {
        globalIds: new Set(["1", "2"]),
        scopedKeys: new Set<string>(),
      };

      expect(entityExclusionHelper.isExcluded("1", "instA", exclusionData)).toBe(true);
      expect(entityExclusionHelper.isExcluded("1", "instB", exclusionData)).toBe(true);
      expect(entityExclusionHelper.isExcluded("1", undefined, exclusionData)).toBe(true);
    });

    it("returns true for instance-scoped excluded entities matching instance", () => {
      const exclusionData = {
        globalIds: new Set<string>(),
        scopedKeys: new Set(["2:instA"]),
      };

      expect(entityExclusionHelper.isExcluded("2", "instA", exclusionData)).toBe(true);
    });

    it("returns false for instance-scoped excluded entities with different instance", () => {
      const exclusionData = {
        globalIds: new Set<string>(),
        scopedKeys: new Set(["2:instA"]),
      };

      expect(entityExclusionHelper.isExcluded("2", "instB", exclusionData)).toBe(false);
    });

    it("returns false for instance-scoped exclusions when entity has no instanceId", () => {
      const exclusionData = {
        globalIds: new Set<string>(),
        scopedKeys: new Set(["2:instA"]),
      };

      expect(entityExclusionHelper.isExcluded("2", undefined, exclusionData)).toBe(false);
    });

    it("returns false for non-excluded entities", () => {
      const exclusionData = {
        globalIds: new Set(["1"]),
        scopedKeys: new Set(["2:instA"]),
      };

      expect(entityExclusionHelper.isExcluded("3", "instA", exclusionData)).toBe(false);
      expect(entityExclusionHelper.isExcluded("3", undefined, exclusionData)).toBe(false);
    });

    it("checks global exclusions before scoped exclusions", () => {
      const exclusionData = {
        globalIds: new Set(["1"]),
        scopedKeys: new Set(["1:instA"]),
      };

      // Entity "1" is both globally and scoped-excluded; should be excluded regardless of instance
      expect(entityExclusionHelper.isExcluded("1", "instA", exclusionData)).toBe(true);
      expect(entityExclusionHelper.isExcluded("1", "instB", exclusionData)).toBe(true);
      expect(entityExclusionHelper.isExcluded("1", undefined, exclusionData)).toBe(true);
    });
  });
});
