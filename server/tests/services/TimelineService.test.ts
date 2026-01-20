import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    getDefaultConfig: vi.fn().mockReturnValue({
      id: "test-instance",
      name: "Test Stash",
      url: "http://localhost:9999/graphql",
      apiKey: "test-api-key",
    }),
    getAllConfigs: vi.fn().mockReturnValue([]),
    loadFromDatabase: vi.fn().mockResolvedValue(undefined),
  },
}));

import { TimelineService } from "../../services/TimelineService.js";

describe("TimelineService", () => {
  describe("getStrftimeFormat", () => {
    it("returns correct format for years granularity", () => {
      const service = new TimelineService();
      expect(service.getStrftimeFormat("years")).toBe("%Y");
    });

    it("returns correct format for months granularity", () => {
      const service = new TimelineService();
      expect(service.getStrftimeFormat("months")).toBe("%Y-%m");
    });

    it("returns correct format for weeks granularity", () => {
      const service = new TimelineService();
      expect(service.getStrftimeFormat("weeks")).toBe("%Y-W%W");
    });

    it("returns correct format for days granularity", () => {
      const service = new TimelineService();
      expect(service.getStrftimeFormat("days")).toBe("%Y-%m-%d");
    });

    it("defaults to months for invalid granularity", () => {
      const service = new TimelineService();
      expect(service.getStrftimeFormat("invalid" as any)).toBe("%Y-%m");
    });
  });

  describe("buildDistributionQuery", () => {
    it("builds SQL with exclusion JOIN for scenes", () => {
      const service = new TimelineService();
      const { sql, params } = service.buildDistributionQuery("scene", 1, "months");

      expect(sql).toContain("SELECT");
      expect(sql).toContain("strftime('%Y-%m', s.date)");
      expect(sql).toContain("COUNT(DISTINCT s.id)");
      expect(sql).toContain("LEFT JOIN UserExcludedEntity");
      expect(sql).toContain("e.id IS NULL");
      expect(sql).toContain("s.date IS NOT NULL");
      expect(sql).toContain("GROUP BY period");
      expect(sql).toContain("ORDER BY period ASC");
      expect(params).toContain(1); // userId
    });

    it("builds SQL for galleries with correct table", () => {
      const service = new TimelineService();
      const { sql } = service.buildDistributionQuery("gallery", 1, "years");

      expect(sql).toContain("FROM StashGallery");
      expect(sql).toContain("strftime('%Y', g.date)");
    });

    it("builds SQL for images with correct table", () => {
      const service = new TimelineService();
      const { sql } = service.buildDistributionQuery("image", 1, "days");

      expect(sql).toContain("FROM StashImage");
      expect(sql).toContain("strftime('%Y-%m-%d', i.date)");
    });
  });
});
