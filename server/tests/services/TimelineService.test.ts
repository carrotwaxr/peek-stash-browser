import { describe, expect, it, vi } from "vitest";
import { TimelineService } from "../../services/TimelineService.js";
import { untrusted } from "../helpers/untrusted.js";

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
      expect(service.getStrftimeFormat(untrusted("invalid"))).toBe("%Y-%m");
    });
  });

  describe("buildDistributionQuery", () => {
    it("builds SQL with exclusion JOIN for scenes", () => {
      const service = new TimelineService();
      const { sql, params } = service.buildDistributionQuery(
        "scene",
        1,
        "months"
      );

      expect(sql).toContain("SELECT");
      expect(sql).toContain("strftime('%Y-%m', s.date)");
      expect(sql).toContain("COUNT(*)");
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

  /**
   * The detail pages send "id:instanceId" (item 34b, UD-04): each filter
   * matches the pair, and a bare id matches that id on every instance
   */
  describe("filters", () => {
    const service = new TimelineService();

    /** Every `?` in the statement has a parameter */
    const placeholders = (sql: string): number =>
      (sql.match(/\?/g) ?? []).length;

    it("a composite performerId binds the pair", () => {
      const { sql, params } = service.buildDistributionQuery(
        "scene",
        1,
        "months",
        { performerId: "42:inst-a" }
      );

      expect(sql).toContain(
        "sp.performerId = ? AND sp.performerInstanceId = ?"
      );
      expect(params).toEqual([1, "42", "inst-a"]);
      expect(placeholders(sql)).toBe(params.length);
    });

    it("a bare performerId binds the id alone", () => {
      const { sql, params } = service.buildDistributionQuery(
        "scene",
        1,
        "months",
        { performerId: "42" }
      );

      expect(sql).toContain("sp.performerId = ?");
      expect(sql).not.toContain("sp.performerInstanceId = ?");
      expect(params).toEqual([1, "42"]);
      expect(placeholders(sql)).toBe(params.length);
    });

    it("an id with an empty instance is bare", () => {
      const { sql, params } = service.buildDistributionQuery(
        "scene",
        1,
        "months",
        { performerId: "42:" }
      );

      expect(sql).not.toContain("sp.performerInstanceId = ?");
      expect(params).toEqual([1, "42"]);
    });

    it.each([
      [
        "scene",
        "performerId",
        "sp.performerId = ? AND sp.performerInstanceId = ?",
      ],
      ["scene", "tagId", "st.tagId = ? AND st.tagInstanceId = ?"],
      ["scene", "studioId", "s.studioId = ? AND s.stashInstanceId = ?"],
      ["scene", "groupId", "sg.groupId = ? AND sg.groupInstanceId = ?"],
      [
        "gallery",
        "performerId",
        "gp.performerId = ? AND gp.performerInstanceId = ?",
      ],
      ["gallery", "tagId", "gt.tagId = ? AND gt.tagInstanceId = ?"],
      ["gallery", "studioId", "g.studioId = ? AND g.stashInstanceId = ?"],
      [
        "image",
        "performerId",
        "ip.performerId = ? AND ip.performerInstanceId = ?",
      ],
      ["image", "tagId", "it.tagId = ? AND it.tagInstanceId = ?"],
      ["image", "studioId", "i.studioId = ? AND i.stashInstanceId = ?"],
    ] as const)(
      "a composite %s %s binds the pair",
      (entityType, filter, condition) => {
        const { sql, params } = service.buildDistributionQuery(
          entityType,
          1,
          "months",
          { [filter]: "7:inst-b" }
        );

        expect(sql).toContain(condition);
        expect(params).toEqual([1, "7", "inst-b"]);
        expect(placeholders(sql)).toBe(params.length);
      }
    );

    it("binds several filters in the order of their conditions", () => {
      const { sql, params } = service.buildDistributionQuery(
        "scene",
        1,
        "months",
        {
          performerId: "1:a",
          tagId: "2",
          studioId: "3:a",
          groupId: "4:a",
        }
      );

      expect(params).toEqual([1, "1", "a", "2", "3", "a", "4", "a"]);
      expect(placeholders(sql)).toBe(params.length);
    });

    it("ignores a filter the entity type does not have", () => {
      const { sql, params } = service.buildDistributionQuery(
        "gallery",
        1,
        "months",
        { groupId: "4:a" }
      );

      expect(sql).not.toContain("groupId");
      expect(params).toEqual([1]);
    });
  });

  /**
   * Two instances reuse small ids, so a bar counts (id, instance) pairs, never
   * bare ids
   */
  describe("count", () => {
    const service = new TimelineService();

    it.each([
      ["no filter", undefined],
      ["a bare ref", { performerId: "42" }],
      ["a composite ref", { performerId: "42:inst-a" }],
    ])("never counts by bare id (%s)", (_name, filters) => {
      const { sql } = service.buildDistributionQuery(
        "scene",
        1,
        "months",
        filters
      );

      expect(sql).not.toContain("COUNT(DISTINCT s.id)");
    });

    it("counts rows when every junction ref names its instance", () => {
      const { sql } = service.buildDistributionQuery("scene", 1, "months", {
        performerId: "42:inst-a",
        tagId: "9:inst-a",
        studioId: "3",
      });

      expect(sql).toContain("COUNT(*)");
      expect(sql).not.toContain("DISTINCT");
    });

    it("counts distinct (id, instance) pairs when a junction ref is bare", () => {
      const { sql } = service.buildDistributionQuery("image", 1, "months", {
        tagId: "9",
      });

      expect(sql).toContain("SELECT DISTINCT i.id, i.stashInstanceId");
      expect(sql).toContain("COUNT(*)");
    });
  });
});
