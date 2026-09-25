/**
 * Query plans of gallery inheritance's two inserts against real SQLite
 * (item 42, SYNC-12).
 *
 * Each insert copies a gallery's performers or tags to the images in it that
 * have none. Testing "has none" as a row-value `NOT IN (SELECT ...)` builds
 * the whole junction as a list first and held the write lock for 52 s and
 * 91 s on a 260k-image library; a correlated `NOT EXISTS` looks up each
 * image's rows in the junction's (imageId, imageInstanceId) index instead.
 * What the inserts write is pinned by the real-SQLite
 * `tests/services/ImageGalleryInheritanceService.test.ts`.
 */
import { describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import {
  INHERIT_PERFORMERS_SQL,
  INHERIT_TAGS_SQL,
} from "../../services/ImageGalleryInheritanceService.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

/** A plan step that looks up the image's own junction rows by index */
const PROBE =
  /^SEARCH x USING COVERING INDEX \S+ \(imageId=\? AND imageInstanceId=\?\)$/;

async function planOf(sql: string): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ detail: string }[]>(
    `EXPLAIN QUERY PLAN ${sql}`
  );
  return rows.map((row) => row.detail);
}

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
});
