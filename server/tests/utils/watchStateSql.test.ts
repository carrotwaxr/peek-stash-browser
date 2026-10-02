/**
 * The Watched and In progress rules (utils/watchStateSql.ts), run against
 * real SQLite over `w` (the viewer's WatchHistory row) and `s` (the scene).
 * One rule serves the scene filters and the History page's views.
 */
import { afterAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import {
  COMPLETED_SQL,
  IN_PROGRESS_SQL,
  watchStateClause,
} from "../../utils/watchStateSql.js";
import { must } from "../helpers/must.js";

interface Case {
  /** The viewer's row; null is no row at all */
  row: { playCount: number; resumeTime: number | null } | null;
  duration: number | null;
}

/** 1 when the SQL is true for the case, else 0 */
async function evaluate(sql: string, c: Case): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<Array<{ v: bigint | number }>>(
    `SELECT (${sql}) AS v
       FROM (SELECT ? AS duration) s
       LEFT JOIN (SELECT ? AS playCount, ? AS resumeTime) w ON ? = 1`,
    c.duration,
    c.row?.playCount ?? null,
    c.row?.resumeTime ?? null,
    c.row ? 1 : 0
  );
  return Number(must(rows[0]).v);
}

describe("watchStateSql", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("spells the two rules", () => {
    expect(IN_PROGRESS_SQL).toBe(
      "w.resumeTime > 0 AND (s.duration IS NULL OR s.duration <= 0 OR w.resumeTime < 0.9 * s.duration)"
    );
    expect(COMPLETED_SQL).toBe(
      "w.playCount > 0 AND (COALESCE(w.resumeTime, 0) = 0 OR (s.duration > 0 AND w.resumeTime >= 0.9 * s.duration))"
    );
  });

  it("wraps a rule so a missing row is false and its negation true", () => {
    expect(watchStateClause(IN_PROGRESS_SQL, true)).toBe(
      `COALESCE((${IN_PROGRESS_SQL}), 0)`
    );
    expect(watchStateClause(IN_PROGRESS_SQL, false)).toBe(
      `NOT COALESCE((${IN_PROGRESS_SQL}), 0)`
    );
  });

  describe("completed", () => {
    it.each<[string, Case, boolean]>([
      [
        "played and finished (no resume point)",
        { row: { playCount: 1, resumeTime: null }, duration: 1000 },
        true,
      ],
      [
        "played and finished (resume point 0)",
        { row: { playCount: 2, resumeTime: 0 }, duration: 1000 },
        true,
      ],
      [
        "played, stopped in the last 10%",
        { row: { playCount: 1, resumeTime: 900 }, duration: 1000 },
        true,
      ],
      [
        "played, stopped before the last 10%",
        { row: { playCount: 1, resumeTime: 899 }, duration: 1000 },
        false,
      ],
      [
        "played, a resume point and an unknown length",
        { row: { playCount: 1, resumeTime: 50 }, duration: null },
        false,
      ],
      [
        "never played",
        { row: { playCount: 0, resumeTime: 950 }, duration: 1000 },
        false,
      ],
      ["no row", { row: null, duration: 1000 }, false],
    ])("%s", async (_name, c, expected) => {
      expect(await evaluate(watchStateClause(COMPLETED_SQL, true), c)).toBe(
        expected ? 1 : 0
      );
      expect(await evaluate(watchStateClause(COMPLETED_SQL, false), c)).toBe(
        expected ? 0 : 1
      );
    });
  });

  describe("in progress", () => {
    it.each<[string, Case, boolean]>([
      [
        "a resume point before the last 10%",
        { row: { playCount: 0, resumeTime: 500 }, duration: 1000 },
        true,
      ],
      [
        "a resume point at 1% of the length (the old 2% clause is gone)",
        { row: { playCount: 0, resumeTime: 10 }, duration: 1000 },
        true,
      ],
      [
        "a played scene resumed before the last 10%",
        { row: { playCount: 3, resumeTime: 899 }, duration: 1000 },
        true,
      ],
      [
        "a resume point at 90% exactly",
        { row: { playCount: 0, resumeTime: 900 }, duration: 1000 },
        false,
      ],
      [
        "a resume point in the last 10%",
        { row: { playCount: 1, resumeTime: 990 }, duration: 1000 },
        false,
      ],
      [
        "a resume point and an unknown length",
        { row: { playCount: 0, resumeTime: 50 }, duration: null },
        true,
      ],
      [
        "a resume point and a zero length",
        { row: { playCount: 0, resumeTime: 50 }, duration: 0 },
        true,
      ],
      [
        "resume point 0",
        { row: { playCount: 1, resumeTime: 0 }, duration: 1000 },
        false,
      ],
      [
        "no resume point",
        { row: { playCount: 0, resumeTime: null }, duration: 1000 },
        false,
      ],
      ["no row", { row: null, duration: 1000 }, false],
    ])("%s", async (_name, c, expected) => {
      expect(await evaluate(watchStateClause(IN_PROGRESS_SQL, true), c)).toBe(
        expected ? 1 : 0
      );
      expect(await evaluate(watchStateClause(IN_PROGRESS_SQL, false), c)).toBe(
        expected ? 0 : 1
      );
    });
  });
});
