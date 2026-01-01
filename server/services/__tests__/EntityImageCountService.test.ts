/**
 * Unit Tests for EntityImageCountService
 *
 * Tests the inherited image count calculation for performers, studios, and tags.
 * The service now uses SQL aggregation queries instead of in-memory filtering.
 *
 * These tests verify that the SQL queries are executed correctly.
 * The actual count logic is handled by the database, so we're primarily
 * testing that the service calls the correct Prisma methods.
 */
import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";

// Mock StashInstanceManager
vi.mock("../StashInstanceManager.js", () => ({
  stashInstanceManager: {
    getDefaultConfig: () => ({
      id: "test-instance",
      name: "Test Stash",
      url: "http://localhost:9999/graphql",
      apiKey: "test-api-key",
    }),
    getAllConfigs: () => [],
    loadFromDatabase: async () => undefined,
  },
}));

// Mock Prisma
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    $executeRaw: vi.fn().mockResolvedValue(0),
  },
}));

import prisma from "../../prisma/singleton.js";
import { entityImageCountService } from "../EntityImageCountService.js";

const getMock = (fn: unknown): Mock => fn as Mock;

describe("EntityImageCountService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rebuildPerformerImageCountsSQL", () => {
    it("executes SQL to update performer image counts", async () => {
      await entityImageCountService.rebuildPerformerImageCounts();

      // Verify $executeRaw was called (the SQL aggregation query)
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe("rebuildStudioImageCountsSQL", () => {
    it("executes SQL to update studio image counts", async () => {
      await entityImageCountService.rebuildStudioImageCounts();

      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe("rebuildTagImageCountsSQL", () => {
    it("executes SQL to update tag image counts", async () => {
      await entityImageCountService.rebuildTagImageCounts();

      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe("rebuildAllImageCounts", () => {
    it("rebuilds counts for all entity types in parallel", async () => {
      await entityImageCountService.rebuildAllImageCounts();

      // Should execute 3 SQL queries (one for each entity type: performer, studio, tag)
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(3);
    });
  });
});
