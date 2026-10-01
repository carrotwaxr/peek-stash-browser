import { describe, expect, it, vi } from "vitest";
import { TimelineService } from "../../services/TimelineService.js";
import type { FilterRef } from "../../types/parsedFilters.js";
import { untrusted } from "../helpers/untrusted.js";

/** A parsed filter value */
const ref = (id: string, instanceId?: string): FilterRef => ({
  id,
  instanceId,
});

vi.mock("../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
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
        ["inst-a", "inst-b"],
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

    it("limits every entity type to the viewer's allowed instances", () => {
      const service = new TimelineService();
      for (const type of ["scene", "gallery", "image"] as const) {
        const { sql, params } = service.buildDistributionQuery(
          type,
          7,
          ["inst-a"],
          "months"
        );
        expect(sql).toMatch(/\.stashInstanceId IN \(\?\)/);
        expect(params).toEqual([7, "inst-a"]);
      }
    });

    it("matches nothing for an empty allowed list", () => {
      const service = new TimelineService();
      const { sql } = service.buildDistributionQuery("scene", 7, [], "months");
      expect(sql).toContain("1 = 0");
    });

    it("builds SQL for galleries with correct table", () => {
      const service = new TimelineService();
      const { sql } = service.buildDistributionQuery(
        "gallery",
        1,
        ["inst-a", "inst-b"],
        "years"
      );

      expect(sql).toContain("FROM StashGallery");
      expect(sql).toContain("strftime('%Y', g.date)");
    });

    it("builds SQL for images with correct table", () => {
      const service = new TimelineService();
      const { sql } = service.buildDistributionQuery(
        "image",
        1,
        ["inst-a", "inst-b"],
        "days"
      );

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
        ["inst-a", "inst-b"],
        "months",
        { performerId: ref("42", "inst-a") }
      );

      expect(sql).toContain(
        "sp.performerId = ? AND sp.performerInstanceId = ?"
      );
      expect(params).toEqual([1, "inst-a", "inst-b", "42", "inst-a"]);
      expect(placeholders(sql)).toBe(params.length);
    });

    it("a bare performerId binds the id alone", () => {
      const { sql, params } = service.buildDistributionQuery(
        "scene",
        1,
        ["inst-a", "inst-b"],
        "months",
        { performerId: ref("42") }
      );

      expect(sql).toContain("sp.performerId = ?");
      expect(sql).not.toContain("sp.performerInstanceId = ?");
      expect(params).toEqual([1, "inst-a", "inst-b", "42"]);
      expect(placeholders(sql)).toBe(params.length);
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
      ["scene", "galleryId", "sga.galleryId = ? AND sga.galleryInstanceId = ?"],
      ["image", "galleryId", "ig.galleryId = ? AND ig.galleryInstanceId = ?"],
    ] as const)(
      "a composite %s %s binds the pair",
      (entityType, filter, condition) => {
        const { sql, params } = service.buildDistributionQuery(
          entityType,
          1,
          ["inst-a", "inst-b"],
          "months",
          { [filter]: ref("7", "inst-b") }
        );

        expect(sql).toContain(condition);
        expect(params).toEqual([1, "inst-a", "inst-b", "7", "inst-b"]);
        expect(placeholders(sql)).toBe(params.length);
      }
    );

    it("binds several filters in the order of their conditions", () => {
      const { sql, params } = service.buildDistributionQuery(
        "scene",
        1,
        ["inst-a", "inst-b"],
        "months",
        {
          performerId: ref("1", "a"),
          tagId: ref("2"),
          studioId: ref("3", "a"),
          groupId: ref("4", "a"),
        }
      );

      expect(params).toEqual([
        1,
        "inst-a",
        "inst-b",
        "1",
        "a",
        "2",
        "3",
        "a",
        "4",
        "a",
      ]);
      expect(placeholders(sql)).toBe(params.length);
    });

    it("a gallery's images join ImageGallery on the image's own pair", () => {
      const { sql } = service.buildDistributionQuery(
        "image",
        1,
        ["inst-a"],
        "months",
        { galleryId: ref("9", "inst-a") }
      );

      expect(sql).toContain(
        "INNER JOIN ImageGallery ig ON ig.imageId = i.id AND ig.imageInstanceId = i.stashInstanceId"
      );
    });

    it("a gallery has no gallery filter of its own", () => {
      const { sql, params } = service.buildDistributionQuery(
        "gallery",
        1,
        ["inst-a", "inst-b"],
        "months",
        { galleryId: ref("9", "inst-a") }
      );

      expect(sql).not.toContain("galleryId");
      expect(params).toEqual([1, "inst-a", "inst-b"]);
    });

    it("ignores a filter the entity type does not have", () => {
      const { sql, params } = service.buildDistributionQuery(
        "gallery",
        1,
        ["inst-a", "inst-b"],
        "months",
        { groupId: ref("4", "a") }
      );

      expect(sql).not.toContain("groupId");
      expect(params).toEqual([1, "inst-a", "inst-b"]);
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
      ["a bare ref", { performerId: ref("42") }],
      ["a composite ref", { performerId: ref("42", "inst-a") }],
    ])("never counts by bare id (%s)", (_name, filters) => {
      const { sql } = service.buildDistributionQuery(
        "scene",
        1,
        ["inst-a", "inst-b"],
        "months",
        filters
      );

      expect(sql).not.toContain("COUNT(DISTINCT s.id)");
    });

    it("counts rows when every junction ref names its instance", () => {
      const { sql } = service.buildDistributionQuery(
        "scene",
        1,
        ["inst-a", "inst-b"],
        "months",
        {
          performerId: ref("42", "inst-a"),
          tagId: ref("9", "inst-a"),
          studioId: ref("3"),
        }
      );

      expect(sql).toContain("COUNT(*)");
      expect(sql).not.toContain("DISTINCT");
    });

    it("counts distinct (id, instance) pairs when a junction ref is bare", () => {
      const { sql } = service.buildDistributionQuery(
        "image",
        1,
        ["inst-a", "inst-b"],
        "months",
        {
          tagId: ref("9"),
        }
      );

      expect(sql).toContain("SELECT DISTINCT i.id, i.stashInstanceId");
      expect(sql).toContain("COUNT(*)");
    });
  });
});
