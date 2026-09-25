/**
 * Query plans of gallery inheritance's two inserts against real SQLite
 * (item 42, SYNC-12).
 *
 * Each insert copies a gallery's performers or tags to the images in it that
 * have none. Testing "has none" as a row-value `NOT IN (SELECT ...)` builds
 * the whole junction as a list first and held the write lock for 52 s and
 * 91 s on a 260k-image library; a correlated `NOT EXISTS` looks up each
 * image's rows in the junction's (imageId, imageInstanceId) index instead.
 * A sync's scoped pass (C5) drives every statement from the images it binds
 * as one JSON list, so it reads only those images' rows.
 * What the statements write is pinned by the real-SQLite
 * `tests/services/ImageGalleryInheritanceService.test.ts`.
 */
import { describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import {
  INHERIT_PERFORMERS_SCOPED_SQL,
  INHERIT_PERFORMERS_SQL,
  INHERIT_TAGS_SCOPED_SQL,
  INHERIT_TAGS_SQL,
  inheritScalarSql,
} from "../../services/ImageGalleryInheritanceService.js";
import { must } from "../../tests/helpers/must.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

/** A plan step that looks up the image's own junction rows by index */
const PROBE =
  /^SEARCH x USING COVERING INDEX \S+ \(imageId=\? AND imageInstanceId=\?\)$/;

async function planOf(sql: string, ...params: string[]): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ detail: string }[]>(
    `EXPLAIN QUERY PLAN ${sql}`,
    ...params
  );
  return rows.map((row) => row.detail);
}

/** A table scanned whole: any SCAN but the bound list's and a subquery's. */
const tableScans = (plan: string[]): string[] =>
  plan.filter(
    (line) =>
      line.startsWith("SCAN ") &&
      !line.startsWith("SCAN j VIRTUAL TABLE") &&
      !line.startsWith("SCAN (subquery-")
  );

const ONE_IMAGE = JSON.stringify([["1", "plan-instance"]]);

describeWithDb("ImageGalleryInheritanceService query plans", () => {
  it("each inherit insert probes the image's existing rows by index", async () => {
    const plans = {
      performers: await planOf(INHERIT_PERFORMERS_SQL),
      tags: await planOf(INHERIT_TAGS_SQL),
    };

    for (const [name, plan] of Object.entries(plans)) {
      const shown = `${name} plan:\n${plan.join("\n")}`;
      expect(
        plan.filter((line) => line.includes("LIST SUBQUERY")),
        shown
      ).toEqual([]);
      expect(
        plan.filter((line) => PROBE.test(line)),
        shown
      ).toHaveLength(1);
    }
  });

  it("each scoped statement reads only the bound images' rows", async () => {
    const plans = {
      performers: await planOf(INHERIT_PERFORMERS_SCOPED_SQL, ONE_IMAGE),
      tags: await planOf(INHERIT_TAGS_SCOPED_SQL, ONE_IMAGE),
      studio: await planOf(inheritScalarSql("studioId", true), ONE_IMAGE),
      date: await planOf(inheritScalarSql("date", true), ONE_IMAGE),
      photographer: await planOf(
        inheritScalarSql("photographer", true),
        ONE_IMAGE
      ),
      details: await planOf(inheritScalarSql("details", true), ONE_IMAGE),
    };

    for (const [name, plan] of Object.entries(plans)) {
      const shown = `${name} plan:\n${plan.join("\n")}`;
      expect(tableScans(plan), shown).toEqual([]);
    }
    // The inserts still probe the image's own rows by index
    for (const plan of [plans.performers, plans.tags]) {
      expect(plan.filter((line) => PROBE.test(line))).toHaveLength(1);
    }
    // The updates look each bound image up by rowid
    for (const plan of [plans.studio, plans.date]) {
      expect(must(plan[0])).toMatch(/^SEARCH StashImage .*rowid=\?\)$/);
    }
  });
});
