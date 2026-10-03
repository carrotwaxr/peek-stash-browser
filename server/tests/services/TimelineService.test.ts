/**
 * The timeline's bars (C12, UD-09): each period's count is the list
 * builder's own count over the list's request (`periodCounts`), so the bars
 * equal the grid. Weeks are ISO weeks, computed in SQL: the period strings
 * appear in URLs (`period=2024-W12`) and keep their form.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import { galleryQueryBuilder } from "../../services/GalleryQueryBuilder.js";
import { imageQueryBuilder } from "../../services/ImageQueryBuilder.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import {
  type Granularity,
  TimelineService,
  periodSql,
} from "../../services/TimelineService.js";
import { wholeDaySql } from "../../utils/sqlClauses.js";
import { parsedListRequest } from "../helpers/fixtures.js";
import { must } from "../helpers/must.js";

/** The period one date falls in, computed by SQLite */
async function periodOf(
  granularity: Granularity,
  date: string
): Promise<string | null> {
  const rows = await prisma.$queryRawUnsafe<Array<{ p: string | null }>>(
    `SELECT ${periodSql(granularity, "x.d")} AS p FROM (SELECT ? AS d) x`,
    date
  );
  return must(rows[0], "a period row").p;
}

describe("periodSql", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it.each([
    ["2024-12-30", "2025-W01"],
    ["2027-01-01", "2026-W53"],
    ["2021-01-03", "2020-W53"],
    ["2025-06-02", "2025-W23"],
    ["2021-01-04", "2021-W01"],
    ["2026-12-31", "2026-W53"],
  ])("the week of %s is the ISO week %s", async (date, week) => {
    expect(await periodOf("weeks", date)).toBe(week);
  });

  it.each([
    ["years", "2024"],
    ["months", "2024-03"],
    ["days", "2024-03-09"],
  ] as const)("%s keep today's form", async (granularity, period) => {
    expect(await periodOf(granularity, "2024-03-09")).toBe(period);
  });

  it("reads the column it is given", () => {
    expect(periodSql("months", "g.date")).toBe("strftime('%Y-%m', g.date)");
    expect(periodSql("days", "i.date")).toBe("i.date");
  });
});

describe("TimelineService.getDistribution", () => {
  const service = new TimelineService();
  const options = {
    userId: 3,
    allowedInstanceIds: ["inst-a"],
    timeZone: "Europe/Berlin",
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["scene", sceneQueryBuilder, "s.date"],
    ["gallery", galleryQueryBuilder, "g.date"],
    ["image", imageQueryBuilder, "i.date"],
  ] as const)(
    "%s bars are its list builder's period counts over the request, on its date column's whole day",
    async (entity, builder, column) => {
      const counts = vi
        .spyOn(builder, "periodCounts")
        .mockResolvedValue([{ period: "2024", count: 2 }]);
      const request = parsedListRequest(entity, { q: "beach" });

      const bars = await service.getDistribution(entity, request, {
        ...options,
        granularity: "years",
      });

      expect(bars).toEqual([{ period: "2024", count: 2 }]);
      expect(counts).toHaveBeenCalledWith(
        { ...options, request, applyExclusions: true },
        periodSql("years", wholeDaySql(column)),
        wholeDaySql(column)
      );
    }
  );
});
