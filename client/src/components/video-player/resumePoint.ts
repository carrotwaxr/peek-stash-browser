/**
 * Where a scene starts: its resume point while it is in progress, as Stash
 * resumes it however the scene is opened
 */

/**
 * The viewer's resume point while the scene is in progress, else null: a
 * point in the last 10% of the scene means it was watched, and it starts
 * from 0. The same rule as the server's `IN_PROGRESS_SQL`
 * (`server/utils/watchStateSql.ts`): resumeTime > 0 and, when the duration
 * is known, resumeTime < 0.9 * duration.
 */
export function inProgressResumeTime(
  resumeTime: unknown,
  duration: unknown
): number | null {
  if (typeof resumeTime !== "number" || !(resumeTime > 0)) return null;
  if (typeof duration === "number" && duration > 0) {
    return resumeTime < 0.9 * duration ? resumeTime : null;
  }
  return resumeTime;
}

/**
 * The start time a link asks for (`?t=120`), which wins over the resume
 * point; null when there is none. Parsed as the Scene page parses it.
 */
export function explicitStartTime(search: string | undefined): number | null {
  const t = new URLSearchParams(search ?? "").get("t");
  if (!t) return null;
  const seconds = parseInt(t, 10);
  return Number.isNaN(seconds) || seconds <= 0 ? null : seconds;
}
