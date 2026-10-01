/**
 * The watched-scenes statements and page read
 * (services/WatchHistoryQueryService.ts). The same reads run against SQLite
 * in integration/api/watched-scenes.integration.test.ts.
 */
import { PER_PAGE_MAX } from "@peek/shared-types/filters/index.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ValidationError } from "../../middleware/errorHandler.js";
import prisma from "../../prisma/singleton.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import {
  findWatchedScenes,
  parseWatchedScenesQuery,
  watchedScenesStatements,
} from "../../services/WatchHistoryQueryService.js";
import type { NormalizedScene } from "../../types/index.js";
import type {
  WatchedSceneQueryRow,
  WatchedScenesTotalsRow,
} from "../../types/internal/queryRows.js";
import { must } from "../helpers/must.js";
import { partialRow } from "../helpers/prismaMock.js";
import { untrusted } from "../helpers/untrusted.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

vi.mock("../../services/SceneQueryBuilder.js", () => ({
  sceneQueryBuilder: { getByRefs: vi.fn() },
}));

const mockPrisma = vi.mocked(prisma, true);
const mockGetByRefs = vi.mocked(sceneQueryBuilder.getByRefs);

const USER_ID = 7;
const ALLOWED = ["a", "b"];

const placeholders = (sql: string) => (sql.match(/\?/g) ?? []).length;
const oneLine = (sql: string) => sql.replace(/\s+/g, " ").trim();

const base = {
  userId: USER_ID,
  allowedInstanceIds: ALLOWED,
  view: "all",
  sort: "recent",
  page: 1,
  perPage: 24,
} as const;

const scene = (id: string, instanceId: string) =>
  partialRow<NormalizedScene>({ id, instanceId, title: `${id}@${instanceId}` });

/** Every raw statement sent, with its parameters */
function statements(): Array<{ sql: string; params: unknown[] }> {
  return mockPrisma.$queryRawUnsafe.mock.calls.map(([sql, ...params]) => ({
    sql: oneLine(sql),
    params,
  }));
}

describe("watchedScenesStatements", () => {
  it("drives the page from the viewer's history rows into the live scene, with the exclusion join and the instances, then the order and the page", () => {
    const { page } = watchedScenesStatements({ ...base, page: 3, perPage: 10 });
    const sql = oneLine(page.sql);

    expect(sql).toMatch(
      /^SELECT w\.sceneId AS id, w\.instanceId AS instanceId FROM WatchHistory w CROSS JOIN StashScene s ON s\.id = w\.sceneId AND s\.stashInstanceId = w\.instanceId LEFT JOIN UserExcludedEntity e ON e\.userId = \? AND e\.entityType = 'scene' AND e\.entityId = s\.id AND \(e\.instanceId = '' OR e\.instanceId = s\.stashInstanceId\) WHERE w\.userId = \? AND s\.deletedAt IS NULL AND e\.id IS NULL AND s\.stashInstanceId IN \(\?, \?\) AND /
    );
    expect(sql).toMatch(
      / ORDER BY w\.lastPlayedAt DESC, w\.sceneId, w\.instanceId LIMIT \? OFFSET \?$/
    );
    expect(page.params).toEqual([USER_ID, USER_ID, "a", "b", 10, 20]);
    expect(placeholders(page.sql)).toBe(page.params.length);
  });

  it("counts and sums with the page's WHERE and no order or page", () => {
    const { page, count } = watchedScenesStatements(base);
    const sql = oneLine(count.sql);
    const where = must(oneLine(page.sql).match(/ FROM .*(?= ORDER BY)/))[0];

    expect(sql).toBe(
      `SELECT COUNT(*) AS total, COALESCE(SUM(w.playDuration), 0) AS totalPlayDuration${where}`
    );
    expect(count.params).toEqual([USER_ID, USER_ID, "a", "b"]);
    expect(placeholders(count.sql)).toBe(count.params.length);
  });

  it("an empty instance list matches nothing", () => {
    const { page } = watchedScenesStatements({
      ...base,
      allowedInstanceIds: [],
    });

    expect(oneLine(page.sql)).toContain(" AND e.id IS NULL AND 1 = 0 AND ");
    expect(page.params).toEqual([USER_ID, USER_ID, 24, 0]);
  });

  it.each([
    ["all", "w.playCount > 0 OR w.playDuration > 0 OR w.resumeTime > 0"],
    [
      "in_progress",
      "w.resumeTime > 0 AND (s.duration IS NULL OR s.duration <= 0 OR (w.resumeTime < 0.9 * s.duration AND w.playDuration >= 0.02 * s.duration))",
    ],
    [
      "completed",
      "w.playCount > 0 AND (COALESCE(w.resumeTime, 0) = 0 OR (s.duration > 0 AND w.resumeTime >= 0.9 * s.duration))",
    ],
  ] as const)("view %s", (view, clause) => {
    const { page, count } = watchedScenesStatements({ ...base, view });

    expect(oneLine(page.sql)).toContain(`IN (?, ?) AND (${clause}) ORDER BY`);
    expect(oneLine(count.sql)).toMatch(
      new RegExp(`AND \\(${escape(clause)}\\)$`)
    );
  });

  it.each([
    ["recent", "w.lastPlayedAt DESC"],
    ["most_watched", "w.playCount DESC"],
    ["longest_duration", "w.playDuration DESC"],
  ] as const)("sort %s", (sort, order) => {
    const { page } = watchedScenesStatements({ ...base, sort });

    expect(oneLine(page.sql)).toContain(
      ` ORDER BY ${order}, w.sceneId, w.instanceId LIMIT ? OFFSET ?`
    );
  });
});

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("parseWatchedScenesQuery", () => {
  it("defaults to every watched scene, newest first, page 1 of 24, counted", () => {
    expect(parseWatchedScenesQuery({})).toEqual({
      view: "all",
      sort: "recent",
      page: 1,
      perPage: 24,
      count: true,
    });
  });

  it("reads every parameter", () => {
    expect(
      parseWatchedScenesQuery({
        view: "completed",
        sort: "most_watched",
        page: "4",
        per_page: String(PER_PAGE_MAX),
        count: "false",
      })
    ).toEqual({
      view: "completed",
      sort: "most_watched",
      page: 4,
      perPage: PER_PAGE_MAX,
      count: false,
    });
  });

  it.each([
    [{ per_page: String(PER_PAGE_MAX + 1) }, ["per_page"]],
    [{ per_page: "0" }, ["per_page"]],
    [{ page: "0" }, ["page"]],
    [{ page: "x" }, ["page"]],
    [{ view: "watched" }, ["view"]],
    [{ sort: "oldest" }, ["sort"]],
    [{ count: "maybe" }, ["count"]],
    [{ view: ["all", "completed"] }, ["view"]],
    [{ limit: "12" }, ["limit"]],
  ])("refuses %j", (query, paths) => {
    let caught: unknown;
    try {
      parseWatchedScenesQuery(untrusted(query));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ValidationError);
    expect(
      (caught as ValidationError).issues?.map((issue) => issue.path)
    ).toEqual(paths);
  });
});

describe("findWatchedScenes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function answer(
    pageRows: WatchedSceneQueryRow[],
    totals?: WatchedScenesTotalsRow
  ) {
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce(pageRows);
    if (totals) mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([totals]);
  }

  it("reads the page, then the totals, and puts the scenes back in page order by (id, instance)", async () => {
    answer(
      [
        { id: "5", instanceId: "b" },
        { id: "5", instanceId: "a" },
        { id: "9", instanceId: "a" },
        { id: "2", instanceId: "a" },
      ],
      { total: 41n, totalPlayDuration: 1234.5 }
    );
    // 9@a is gone by the time the scenes load
    mockGetByRefs.mockResolvedValueOnce([
      scene("2", "a"),
      scene("5", "a"),
      scene("5", "b"),
    ]);

    const result = await findWatchedScenes({
      userId: USER_ID,
      allowedInstanceIds: ALLOWED,
      request: {
        view: "in_progress",
        sort: "recent",
        page: 1,
        perPage: 4,
        count: true,
      },
    });

    expect(result.scenes.map((s) => `${s.id}@${s.instanceId}`)).toEqual([
      "5@b",
      "5@a",
      "2@a",
    ]);
    expect(result.total).toBe(41);
    expect(result.totalPlayDuration).toBe(1234.5);
    expect(mockGetByRefs).toHaveBeenCalledWith({
      userId: USER_ID,
      allowedInstanceIds: ALLOWED,
      refs: [
        { id: "5", instanceId: "b" },
        { id: "5", instanceId: "a" },
        { id: "9", instanceId: "a" },
        { id: "2", instanceId: "a" },
      ],
    });
    const sent = statements();
    expect(sent).toHaveLength(2);
    expect(must(sent[0]).sql).toContain(" LIMIT ? OFFSET ?");
    expect(must(sent[1]).sql).toMatch(/^SELECT COUNT\(\*\)/);
  });

  it("count=false sends no totals statement and answers null totals", async () => {
    answer([{ id: "1", instanceId: "a" }]);
    mockGetByRefs.mockResolvedValueOnce([scene("1", "a")]);

    const result = await findWatchedScenes({
      userId: USER_ID,
      allowedInstanceIds: ALLOWED,
      request: {
        view: "all",
        sort: "recent",
        page: 1,
        perPage: 24,
        count: false,
      },
    });

    expect(result).toEqual({
      scenes: [scene("1", "a")],
      total: null,
      totalPlayDuration: null,
    });
    expect(statements()).toHaveLength(1);
  });

  it("an empty page loads no scenes", async () => {
    answer([], { total: 0n, totalPlayDuration: 0n });

    const result = await findWatchedScenes({
      userId: USER_ID,
      allowedInstanceIds: ALLOWED,
      request: {
        view: "all",
        sort: "recent",
        page: 9,
        perPage: 24,
        count: true,
      },
    });

    expect(result).toEqual({ scenes: [], total: 0, totalPlayDuration: 0 });
    expect(mockGetByRefs).not.toHaveBeenCalled();
  });
});
