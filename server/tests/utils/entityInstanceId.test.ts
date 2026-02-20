/**
 * Unit Tests for entityInstanceId utility
 *
 * Tests the entity-to-instance ID lookup system used by multi-instance setups.
 * Covers single lookups, batch lookups, fallback behavior, duplicate warnings,
 * and name disambiguation for filter dropdowns.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Hoist mock function so it can be referenced in vi.mock factory
const { mockGetAllConfigs } = vi.hoisted(() => ({
  mockGetAllConfigs: vi.fn(),
}));

// Mock prisma
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    stashScene: { findMany: vi.fn() },
    stashPerformer: { findMany: vi.fn() },
    stashStudio: { findMany: vi.fn() },
    stashTag: { findMany: vi.fn() },
    stashGallery: { findMany: vi.fn() },
    stashGroup: { findMany: vi.fn() },
    stashImage: { findMany: vi.fn() },
  },
}));

// Mock StashInstanceManager
vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    getAllConfigs: mockGetAllConfigs,
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

import prisma from "../../prisma/singleton.js";
import {
  getEntityInstanceId,
  getEntityInstanceIds,
  disambiguateEntityNames,
} from "../../utils/entityInstanceId.js";

const mockPrisma = vi.mocked(prisma);

const INSTANCE_A = {
  id: "aaa-111",
  name: "Primary Stash",
  url: "http://stash-a/graphql",
  apiKey: "key-a",
  enabled: true,
  priority: 0,
  description: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const INSTANCE_B = {
  id: "bbb-222",
  name: "Secondary Stash",
  url: "http://stash-b/graphql",
  apiKey: "key-b",
  enabled: true,
  priority: 1,
  description: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("entityInstanceId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllConfigs.mockReturnValue([INSTANCE_A, INSTANCE_B]);
  });

  describe("getEntityInstanceId", () => {
    const entityTypeMocks: Array<[string, any]> = [
      ["scene", () => mockPrisma.stashScene],
      ["performer", () => mockPrisma.stashPerformer],
      ["studio", () => mockPrisma.stashStudio],
      ["tag", () => mockPrisma.stashTag],
      ["gallery", () => mockPrisma.stashGallery],
      ["group", () => mockPrisma.stashGroup],
      ["image", () => mockPrisma.stashImage],
    ];

    it.each(entityTypeMocks)(
      "returns correct instanceId for a %s",
      async (entityType, getMock) => {
        getMock().findMany.mockResolvedValue([
          { stashInstanceId: "aaa-111" },
        ] as any);

        const result = await getEntityInstanceId(entityType as any, "42");
        expect(result).toBe("aaa-111");
      }
    );

    it("falls back to default instance when entity not found", async () => {
      mockPrisma.stashScene.findMany.mockResolvedValue([]);
      const { logger } = await import("../../utils/logger.js");

      const result = await getEntityInstanceId("scene", "nonexistent");

      expect(result).toBe("aaa-111"); // Fallback to primary
      expect(logger.warn).toHaveBeenCalledWith(
        "Entity not found in database, using fallback instance",
        expect.objectContaining({
          entityType: "scene",
          entityId: "nonexistent",
          fallbackInstanceId: "aaa-111",
        })
      );
    });

    it("throws when no Stash instances are configured", async () => {
      mockGetAllConfigs.mockReturnValue([]);

      await expect(getEntityInstanceId("scene", "42")).rejects.toThrow(
        "No Stash instances configured"
      );
    });

    it("warns when entity exists in multiple instances and uses first by ID order", async () => {
      mockPrisma.stashPerformer.findMany.mockResolvedValue([
        { stashInstanceId: "aaa-111" },
        { stashInstanceId: "bbb-222" },
      ] as any);
      const { logger } = await import("../../utils/logger.js");

      const result = await getEntityInstanceId("performer", "10");

      expect(result).toBe("aaa-111");
      expect(logger.warn).toHaveBeenCalledWith(
        "Entity exists in multiple instances, using first by ID order",
        expect.objectContaining({
          entityType: "performer",
          entityId: "10",
          instanceCount: 2,
        })
      );
    });

    it("queries with deterministic ordering by stashInstanceId", async () => {
      mockPrisma.stashScene.findMany.mockResolvedValue([
        { stashInstanceId: "aaa-111" },
      ] as any);

      await getEntityInstanceId("scene", "42");

      expect(mockPrisma.stashScene.findMany).toHaveBeenCalledWith({
        where: { id: "42" },
        select: { stashInstanceId: true },
        orderBy: { stashInstanceId: "asc" },
      });
    });

    it("falls back gracefully on database error", async () => {
      mockPrisma.stashScene.findMany.mockRejectedValue(
        new Error("DB timeout")
      );
      const { logger } = await import("../../utils/logger.js");

      const result = await getEntityInstanceId("scene", "42");

      expect(result).toBe("aaa-111"); // Fallback
      expect(logger.error).toHaveBeenCalledWith(
        "Error looking up entity instanceId, using fallback",
        expect.objectContaining({
          entityType: "scene",
          entityId: "42",
        })
      );
    });
  });

  describe("getEntityInstanceIds (batch)", () => {
    it("returns empty map for empty input", async () => {
      const result = await getEntityInstanceIds("scene", []);
      expect(result.size).toBe(0);
    });

    it("returns correct mapping for multiple entities", async () => {
      mockPrisma.stashScene.findMany.mockResolvedValue([
        { id: "1", stashInstanceId: "aaa-111" },
        { id: "2", stashInstanceId: "bbb-222" },
      ] as any);

      const result = await getEntityInstanceIds("scene", ["1", "2"]);

      expect(result.get("1")).toBe("aaa-111");
      expect(result.get("2")).toBe("bbb-222");
    });

    it("uses fallback for entities not found in database", async () => {
      mockPrisma.stashScene.findMany.mockResolvedValue([
        { id: "1", stashInstanceId: "aaa-111" },
      ] as any);
      const { logger } = await import("../../utils/logger.js");

      const result = await getEntityInstanceIds("scene", ["1", "missing-id"]);

      expect(result.get("1")).toBe("aaa-111");
      expect(result.get("missing-id")).toBe("aaa-111"); // Fallback
      expect(logger.warn).toHaveBeenCalledWith(
        "Some entities not found in database, using fallback instance",
        expect.objectContaining({
          entityType: "scene",
          missingCount: 1,
          fallbackInstanceId: "aaa-111",
        })
      );
    });

    it("throws when no Stash instances are configured", async () => {
      mockGetAllConfigs.mockReturnValue([]);

      await expect(
        getEntityInstanceIds("scene", ["1"])
      ).rejects.toThrow("No Stash instances configured");
    });

    it("handles batch lookup for performers", async () => {
      mockPrisma.stashPerformer.findMany.mockResolvedValue([
        { id: "p1", stashInstanceId: "aaa-111" },
        { id: "p2", stashInstanceId: "bbb-222" },
      ] as any);

      const result = await getEntityInstanceIds("performer", ["p1", "p2"]);

      expect(result.get("p1")).toBe("aaa-111");
      expect(result.get("p2")).toBe("bbb-222");
    });

    it("handles batch lookup for all entity types", async () => {
      // Test each entity type uses the correct Prisma model
      const entityTypes = [
        { type: "scene" as const, mock: mockPrisma.stashScene },
        { type: "performer" as const, mock: mockPrisma.stashPerformer },
        { type: "studio" as const, mock: mockPrisma.stashStudio },
        { type: "tag" as const, mock: mockPrisma.stashTag },
        { type: "gallery" as const, mock: mockPrisma.stashGallery },
        { type: "group" as const, mock: mockPrisma.stashGroup },
        { type: "image" as const, mock: mockPrisma.stashImage },
      ];

      for (const { type, mock } of entityTypes) {
        vi.clearAllMocks();
        mockGetAllConfigs.mockReturnValue([INSTANCE_A]);
        mock.findMany.mockResolvedValue([
          { id: "1", stashInstanceId: "aaa-111" },
        ] as any);

        const result = await getEntityInstanceIds(type, ["1"]);
        expect(result.get("1")).toBe("aaa-111");
        expect(mock.findMany).toHaveBeenCalled();
      }
    });

    it("warns about entities that exist in multiple instances", async () => {
      mockPrisma.stashPerformer.findMany.mockResolvedValue([
        { id: "p1", stashInstanceId: "aaa-111" },
        { id: "p1", stashInstanceId: "bbb-222" },
      ] as any);
      const { logger } = await import("../../utils/logger.js");

      await getEntityInstanceIds("performer", ["p1"]);

      expect(logger.warn).toHaveBeenCalledWith(
        "Batch lookup: entity exists in multiple instances, using first by ID order",
        expect.objectContaining({
          entityType: "performer",
          entityId: "p1",
          instanceCount: 2,
        })
      );
    });

    it("handles database errors gracefully with fallback", async () => {
      mockPrisma.stashScene.findMany.mockRejectedValue(
        new Error("DB error")
      );

      const result = await getEntityInstanceIds("scene", ["1", "2"]);

      // All IDs should get fallback
      expect(result.get("1")).toBe("aaa-111");
      expect(result.get("2")).toBe("aaa-111");
    });
  });

  describe("disambiguateEntityNames", () => {
    it("returns names unchanged with single instance", () => {
      mockGetAllConfigs.mockReturnValue([INSTANCE_A]);

      const result = disambiguateEntityNames([
        { id: "1", name: "Jane Doe", instanceId: "aaa-111" },
        { id: "2", name: "John Smith", instanceId: "aaa-111" },
      ]);

      expect(result).toEqual([
        { id: "1", name: "Jane Doe", instanceId: "aaa-111" },
        { id: "2", name: "John Smith", instanceId: "aaa-111" },
      ]);
    });

    it("returns names unchanged when no duplicates across instances", () => {
      const result = disambiguateEntityNames([
        { id: "1", name: "Jane Doe", instanceId: "aaa-111" },
        { id: "2", name: "John Smith", instanceId: "bbb-222" },
      ]);

      expect(result).toEqual([
        { id: "1", name: "Jane Doe", instanceId: "aaa-111" },
        { id: "2", name: "John Smith", instanceId: "bbb-222" },
      ]);
    });

    it("adds instance name suffix for duplicate names from non-default instance", () => {
      const result = disambiguateEntityNames([
        { id: "1", name: "Jane Doe", instanceId: "aaa-111" },
        { id: "2", name: "Jane Doe", instanceId: "bbb-222" },
      ]);

      // Default instance (lowest priority) keeps plain name
      expect(result[0]).toEqual({ id: "1", name: "Jane Doe", instanceId: "aaa-111" });
      // Non-default instance gets suffix
      expect(result[1]).toEqual({ id: "2", name: "Jane Doe (Secondary Stash)", instanceId: "bbb-222" });
    });

    it("disambiguates case-insensitively", () => {
      const result = disambiguateEntityNames([
        { id: "1", name: "jane doe", instanceId: "aaa-111" },
        { id: "2", name: "Jane Doe", instanceId: "bbb-222" },
      ]);

      expect(result[0]).toEqual({ id: "1", name: "jane doe", instanceId: "aaa-111" });
      expect(result[1]).toEqual({ id: "2", name: "Jane Doe (Secondary Stash)", instanceId: "bbb-222" });
    });

    it("does not suffix default instance even with duplicates", () => {
      const result = disambiguateEntityNames([
        { id: "1", name: "Shared Name", instanceId: "aaa-111" }, // default (priority 0)
        { id: "2", name: "Shared Name", instanceId: "bbb-222" }, // non-default (priority 1)
      ]);

      // Default instance never gets suffix
      expect(result[0].name).toBe("Shared Name");
      // Non-default gets suffix
      expect(result[1].name).toBe("Shared Name (Secondary Stash)");
    });

    it("handles empty entity list", () => {
      const result = disambiguateEntityNames([]);
      expect(result).toEqual([]);
    });

    it("handles entities with empty/null names", () => {
      const result = disambiguateEntityNames([
        { id: "1", name: "", instanceId: "aaa-111" },
        { id: "2", name: "", instanceId: "bbb-222" },
      ]);

      // Both empty names = duplicates, non-default gets suffix
      expect(result[0]).toEqual({ id: "1", name: "", instanceId: "aaa-111" });
      expect(result[1]).toEqual({ id: "2", name: " (Secondary Stash)", instanceId: "bbb-222" });
    });

    it("handles no instances configured", () => {
      mockGetAllConfigs.mockReturnValue([]);

      const result = disambiguateEntityNames([
        { id: "1", name: "Test", instanceId: "aaa-111" },
      ]);

      // With 0 instances, no disambiguation needed
      expect(result).toEqual([{ id: "1", name: "Test", instanceId: "aaa-111" }]);
    });

    it("handles multiple duplicated names correctly", () => {
      const result = disambiguateEntityNames([
        { id: "1", name: "Jane Doe", instanceId: "aaa-111" },
        { id: "2", name: "Jane Doe", instanceId: "bbb-222" },
        { id: "3", name: "Unique Name", instanceId: "aaa-111" },
        { id: "4", name: "Unique Name 2", instanceId: "bbb-222" },
        { id: "5", name: "Another Dup", instanceId: "aaa-111" },
        { id: "6", name: "Another Dup", instanceId: "bbb-222" },
      ]);

      expect(result[0].name).toBe("Jane Doe");
      expect(result[1].name).toBe("Jane Doe (Secondary Stash)");
      expect(result[2].name).toBe("Unique Name"); // No dup, no suffix
      expect(result[3].name).toBe("Unique Name 2"); // No dup, no suffix
      expect(result[4].name).toBe("Another Dup");
      expect(result[5].name).toBe("Another Dup (Secondary Stash)");
    });
  });
});
