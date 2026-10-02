/**
 * The Watched and In progress rules, over `w` (the viewer's WatchHistory row,
 * LEFT JOINed, so every column is NULL when there is none) and `s` (the
 * scene, for its length in seconds). The scene filters and the History
 * page's views read these two, so a scene is in progress or completed in
 * both or in neither (owner answer 14).
 */

/**
 * Played at least once, and the last session finished (resume point 0 or
 * none) or stopped within the final 10% (owner, 2026-09-30)
 */
export const COMPLETED_SQL =
  "w.playCount > 0 AND (COALESCE(w.resumeTime, 0) = 0 OR (s.duration > 0 AND w.resumeTime >= 0.9 * s.duration))";

/**
 * A resume point before the final 10%, played or not; any resume point when
 * the length is unknown
 */
export const IN_PROGRESS_SQL =
  "w.resumeTime > 0 AND (s.duration IS NULL OR s.duration <= 0 OR w.resumeTime < 0.9 * s.duration)";

/**
 * A rule as a filter's clause: `on` keeps the scenes it holds for, false the
 * rest. A scene with no history row (or an unknown answer) is not watched
 * and not in progress, so false lists it.
 */
export function watchStateClause(rule: string, on: boolean): string {
  const known = `COALESCE((${rule}), 0)`;
  return on ? known : `NOT ${known}`;
}
