/**
 * Query plans of the image count UPDATEs against real SQLite (item 42,
 * SYNC-12).
 *
 * A sync recounts only the performers, studios and tags its changes reach,
 * bound as one JSON list. Each UPDATE looks those rows up by rowid, and the
 * count searches each junction by the counted row's key, so a scoped
 * rebuild costs as much as the counted entities' images. What the counts
 * come to is pinned by
 * `integration/services/StashSyncService.postSync.integration.test.ts`.
 */
import { describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { imageCountSql } from "../../services/EntityImageCountService.js";
import { must } from "../../tests/helpers/must.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

async function planOf(sql: string, ...params: string[]): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ detail: string }[]>(
    `EXPLAIN QUERY PLAN ${sql}`,
    ...params
  );
  return rows.map((row) => row.detail);
}

const ONE_REF = JSON.stringify([["1", "plan-instance"]]);

const TABLES = {
  performer: "StashPerformer",
  studio: "StashStudio",
  tag: "StashTag",
} as const;

describeWithDb("EntityImageCountService query plans", () => {
  it("a scoped count looks each bound row up by rowid and scans no table", async () => {
    for (const [type, table] of Object.entries(TABLES)) {
      const plan = await planOf(
        imageCountSql(type as keyof typeof TABLES, true),
        ONE_REF
      );
      const shown = `${type} plan:\n${plan.join("\n")}`;

      expect(must(plan[0]), shown).toMatch(
        new RegExp(`^SEARCH ${table} .*rowid=\\?\\)$`)
      );
      expect(
        plan.filter(
          (line) =>
            line.startsWith("SCAN ") &&
            !line.startsWith("SCAN j VIRTUAL TABLE") &&
            !line.startsWith("SCAN (subquery-")
        ),
        shown
      ).toEqual([]);
    }
  });
});
