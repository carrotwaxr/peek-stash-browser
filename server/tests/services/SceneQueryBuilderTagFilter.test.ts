/**
 * Unit Tests for SceneQueryBuilder tag filtering with composite keys
 *
 * Bug #424: Carousel tag filtering returns no results because
 * buildTagFilterWithHierarchy receives composite keys ("284:instance-1")
 * from the UI but uses them directly in SQL as tagId values, which only
 * store bare IDs ("284"). The filter never matches.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma (required by SceneQueryBuilder import)
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    $queryRawUnsafe: vi.fn(),
    stashScene: { count: vi.fn() },
  },
}));

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock hierarchyUtils — expandTagIds should pass through IDs when depth=0
vi.mock("../../utils/hierarchyUtils.js", () => ({
  expandTagIds: vi.fn(async (ids: string[]) => ids),
  expandStudioIds: vi.fn(async (ids: string[]) => ids),
}));

// Import after mocks
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";

// Access private method for unit testing
const builder = sceneQueryBuilder as any;

describe("SceneQueryBuilder.buildTagFilterWithHierarchy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("composite key handling", () => {
    it("strips instance IDs from composite keys for INCLUDES filter", async () => {
      const filter = {
        value: ["284:instance-1", "313:instance-1"],
        modifier: "INCLUDES",
      };

      const result = await builder.buildTagFilterWithHierarchy(filter);

      expect(result.sql).not.toBe("");
      // Params should contain bare IDs, NOT composite keys
      expect(result.params).not.toContain("284:instance-1");
      expect(result.params).not.toContain("313:instance-1");
      // Should contain the bare IDs
      expect(result.params).toContain("284");
      expect(result.params).toContain("313");
    });

    it("strips instance IDs from composite keys for INCLUDES_ALL filter", async () => {
      const filter = {
        value: ["284:instance-1", "313:instance-1"],
        modifier: "INCLUDES_ALL",
      };

      const result = await builder.buildTagFilterWithHierarchy(filter);

      expect(result.sql).not.toBe("");
      expect(result.params).not.toContain("284:instance-1");
      expect(result.params).not.toContain("313:instance-1");
      expect(result.params).toContain("284");
      expect(result.params).toContain("313");
    });

    it("strips instance IDs from composite keys for EXCLUDES filter", async () => {
      const filter = {
        value: ["284:instance-1"],
        modifier: "EXCLUDES",
      };

      const result = await builder.buildTagFilterWithHierarchy(filter);

      expect(result.sql).not.toBe("");
      expect(result.params).not.toContain("284:instance-1");
      expect(result.params).toContain("284");
    });

    it("handles bare IDs (no instanceId) correctly", async () => {
      const filter = {
        value: ["284", "313"],
        modifier: "INCLUDES",
      };

      const result = await builder.buildTagFilterWithHierarchy(filter);

      expect(result.sql).not.toBe("");
      expect(result.params).toContain("284");
      expect(result.params).toContain("313");
    });

    it("handles mixed bare and composite IDs", async () => {
      const filter = {
        value: ["284:instance-1", "313"],
        modifier: "INCLUDES",
      };

      const result = await builder.buildTagFilterWithHierarchy(filter);

      expect(result.sql).not.toBe("");
      expect(result.params).not.toContain("284:instance-1");
      expect(result.params).toContain("284");
      expect(result.params).toContain("313");
    });
  });

  describe("empty/null handling", () => {
    it("returns empty clause for null filter", async () => {
      const result = await builder.buildTagFilterWithHierarchy(null);
      expect(result.sql).toBe("");
    });

    it("returns empty clause for empty value array", async () => {
      const result = await builder.buildTagFilterWithHierarchy({
        value: [],
        modifier: "INCLUDES",
      });
      expect(result.sql).toBe("");
    });

    it("returns empty clause for undefined filter", async () => {
      const result = await builder.buildTagFilterWithHierarchy(undefined);
      expect(result.sql).toBe("");
    });
  });

  describe("SQL structure", () => {
    it("generates SceneTag EXISTS subquery for INCLUDES", async () => {
      const filter = {
        value: ["284:instance-1"],
        modifier: "INCLUDES",
      };

      const result = await builder.buildTagFilterWithHierarchy(filter);

      expect(result.sql).toContain("SceneTag");
      expect(result.sql).toContain("EXISTS");
    });

    it("generates AND-joined checks for INCLUDES_ALL", async () => {
      const filter = {
        value: ["284:instance-1", "313:instance-1"],
        modifier: "INCLUDES_ALL",
      };

      const result = await builder.buildTagFilterWithHierarchy(filter);

      expect(result.sql).toContain("AND");
      expect(result.sql).toContain("SceneTag");
    });

    it("generates NOT EXISTS for EXCLUDES", async () => {
      const filter = {
        value: ["284:instance-1"],
        modifier: "EXCLUDES",
      };

      const result = await builder.buildTagFilterWithHierarchy(filter);

      expect(result.sql).toContain("NOT EXISTS");
    });
  });
});
