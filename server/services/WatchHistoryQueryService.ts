/**
 * The viewer's watched scenes, paged, sorted and filtered in SQL
 * (`GET /api/watch-history/scenes`; item 49).
 *
 * One page statement driven from the viewer's `WatchHistory` rows: each row
 * finds its live scene by key (`CROSS JOIN` keeps the history as the outer
 * loop; driven from the scenes, as the scene builder would, the in-progress
 * page took 125 ms against 50 at 208k scenes and 18k history rows), the
 * exclusion anti-join and the allowed instances apply, then the view, the
 * order and the page. One aggregate with the same WHERE gives the totals,
 * and the page's scenes load through `sceneQueryBuilder.getByRefs`, put
 * back in page order, as Recommended does.
 */
import {
  WATCHED_SCENES_SORTS,
  WATCHED_SCENES_VIEWS,
  type WatchedScenesSort,
  type WatchedScenesView,
} from "@peek/shared-types/api/watchHistory.js";
import { PER_PAGE_MAX } from "@peek/shared-types/filters/index.js";
import { ValidationError } from "../middleware/errorHandler.js";
import prisma from "../prisma/singleton.js";
import type {
  ApiErrorIssue,
  GetWatchedScenesResponse,
} from "../types/api/index.js";
import type { NormalizedScene } from "../types/index.js";
import type {
  WatchedSceneQueryRow,
  WatchedScenesTotalsRow,
} from "../types/internal/queryRows.js";
import { entityKey } from "../utils/entityRef.js";
import {
  type SqlFragment,
  type SqlParam,
  exclusionJoin,
  instanceClause,
} from "../utils/sqlClauses.js";
import { sceneQueryBuilder } from "./SceneQueryBuilder.js";

export const WATCHED_SCENES_PER_PAGE_DEFAULT = 24;

export interface WatchedScenesRequest {
  view: WatchedScenesView;
  sort: WatchedScenesSort;
  /** 1 or more */
  page: number;
  /** 1 to PER_PAGE_MAX */
  perPage: number;
  /** False: no totals statement, both totals answer null */
  count: boolean;
}

const POSITIVE_INTEGER = /^\d+$/;

function member<T extends string>(
  values: readonly T[],
  raw: string
): T | undefined {
  return values.find((value) => value === raw);
}

/**
 * `GET /api/watch-history/scenes`'s query. Unknown parameters, values out of
 * range and repeated parameters are one 400 naming each path.
 */
export function parseWatchedScenesQuery(query: unknown): WatchedScenesRequest {
  const request: WatchedScenesRequest = {
    view: "all",
    sort: "recent",
    page: 1,
    perPage: WATCHED_SCENES_PER_PAGE_DEFAULT,
    count: true,
  };
  const issues: ApiErrorIssue[] = [];
  const input =
    typeof query === "object" && query !== null && !Array.isArray(query)
      ? (query as Record<string, unknown>)
      : {};

  const integer = (raw: string, path: string, max: number) => {
    const value = POSITIVE_INTEGER.test(raw) ? Number(raw) : 0;
    if (value < 1 || value > max) {
      issues.push({
        path,
        message:
          max === Number.MAX_SAFE_INTEGER
            ? "Expected a whole number of 1 or more"
            : `Expected a whole number from 1 to ${max}`,
      });
      return undefined;
    }
    return value;
  };

  for (const [key, raw] of Object.entries(input)) {
    if (typeof raw !== "string") {
      issues.push({ path: key, message: "Expected one value" });
      continue;
    }
    switch (key) {
      case "view": {
        const view = member(WATCHED_SCENES_VIEWS, raw);
        if (view) request.view = view;
        else
          issues.push({
            path: key,
            message: `Expected one of ${WATCHED_SCENES_VIEWS.join(", ")}`,
          });
        break;
      }
      case "sort": {
        const sort = member(WATCHED_SCENES_SORTS, raw);
        if (sort) request.sort = sort;
        else
          issues.push({
            path: key,
            message: `Expected one of ${WATCHED_SCENES_SORTS.join(", ")}`,
          });
        break;
      }
      case "page":
        request.page = integer(raw, key, Number.MAX_SAFE_INTEGER) ?? 1;
        break;
      case "per_page":
        request.perPage =
          integer(raw, key, PER_PAGE_MAX) ?? WATCHED_SCENES_PER_PAGE_DEFAULT;
        break;
      case "count":
        if (raw === "true" || raw === "false") request.count = raw === "true";
        else issues.push({ path: key, message: "Expected true or false" });
        break;
      default:
        issues.push({ path: key, message: "Unknown query parameter" });
    }
  }

  if (issues.length > 0) {
    throw new ValidationError("Invalid request", { issues });
  }
  return request;
}

/** Each view's clause, with `s.duration` the scene's length in seconds */
const VIEW_CLAUSES: Record<WatchedScenesView, string> = {
  // Played, watched or left with a resume point: a row with only an O stays out
  all: "w.playCount > 0 OR w.playDuration > 0 OR w.resumeTime > 0",
  // Before the final 10%, with at least 2% watched; any resume point when
  // the length is unknown
  in_progress:
    "w.resumeTime > 0 AND (s.duration IS NULL OR s.duration <= 0 OR (w.resumeTime < 0.9 * s.duration AND w.playDuration >= 0.02 * s.duration))",
  // Played at least once, and the last session finished (resume point 0 or
  // none) or stopped within the final 10% (owner, 2026-09-30)
  completed:
    "w.playCount > 0 AND (COALESCE(w.resumeTime, 0) = 0 OR (s.duration > 0 AND w.resumeTime >= 0.9 * s.duration))",
};

/** Each sort's terms before the key; NULLs sort last in SQLite's DESC */
const SORT_TERMS: Record<WatchedScenesSort, string> = {
  recent: "w.lastPlayedAt DESC",
  most_watched: "w.playCount DESC",
  longest_duration: "w.playDuration DESC",
};

export interface WatchedScenesStatementOptions {
  userId: number;
  allowedInstanceIds: readonly string[];
  view: WatchedScenesView;
  sort: WatchedScenesSort;
  page: number;
  perPage: number;
}

/**
 * The page statement (scene keys in order) and the totals statement, which
 * shares its FROM and WHERE. The order ends with the history row's key, so
 * rows equal on the sort keep one order on every page.
 */
export function watchedScenesStatements(
  options: WatchedScenesStatementOptions
): { page: SqlFragment; count: SqlFragment } {
  const { userId, allowedInstanceIds, view, sort, page, perPage } = options;
  const instances = instanceClause("s", allowedInstanceIds);
  const from = `FROM WatchHistory w
    CROSS JOIN StashScene s ON s.id = w.sceneId AND s.stashInstanceId = w.instanceId
    ${exclusionJoin("e", "scene", "s.id", "s.stashInstanceId")}
    WHERE w.userId = ? AND s.deletedAt IS NULL AND e.id IS NULL AND ${instances.sql}
      AND (${VIEW_CLAUSES[view]})`;
  const params: SqlParam[] = [userId, userId, ...instances.params];

  return {
    page: {
      sql: `SELECT w.sceneId AS id, w.instanceId AS instanceId ${from}
    ORDER BY ${SORT_TERMS[sort]}, w.sceneId, w.instanceId LIMIT ? OFFSET ?`,
      params: [...params, perPage, (page - 1) * perPage],
    },
    count: {
      sql: `SELECT COUNT(*) AS total, COALESCE(SUM(w.playDuration), 0) AS totalPlayDuration ${from}`,
      params,
    },
  };
}

/**
 * One page of the viewer's watched scenes they can see, with the view's
 * totals unless the request skips them. The statements run in turn.
 */
export async function findWatchedScenes(options: {
  userId: number;
  allowedInstanceIds: readonly string[];
  request: WatchedScenesRequest;
}): Promise<GetWatchedScenesResponse> {
  const { userId, allowedInstanceIds, request } = options;
  const statements = watchedScenesStatements({
    userId,
    allowedInstanceIds,
    view: request.view,
    sort: request.sort,
    page: request.page,
    perPage: request.perPage,
  });

  const rows = await prisma.$queryRawUnsafe<WatchedSceneQueryRow[]>(
    statements.page.sql,
    ...statements.page.params
  );

  let total: number | null = null;
  let totalPlayDuration: number | null = null;
  if (request.count) {
    const [totals] = await prisma.$queryRawUnsafe<WatchedScenesTotalsRow[]>(
      statements.count.sql,
      ...statements.count.params
    );
    total = totals ? Number(totals.total) : 0;
    totalPlayDuration = totals ? Number(totals.totalPlayDuration) : 0;
  }

  if (rows.length === 0) {
    return { scenes: [], total, totalPlayDuration };
  }

  const refs = rows.map((row) => ({ id: row.id, instanceId: row.instanceId }));
  const scenes = await sceneQueryBuilder.getByRefs({
    userId,
    refs,
    allowedInstanceIds,
  });

  // Back in page order: getByRefs returns the page in no particular order,
  // and a scene deleted between the two reads is left out
  const sceneByKey = new Map(
    scenes.map((s) => [entityKey(s.id, s.instanceId), s])
  );
  const ordered = refs
    .map((ref) => sceneByKey.get(entityKey(ref.id, ref.instanceId)))
    .filter((s): s is NormalizedScene => s !== undefined);

  return { scenes: ordered, total, totalPlayDuration };
}
