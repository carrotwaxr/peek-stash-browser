/**
 * Days and instants in the viewer's time zone (item 43). A date filter on a
 * stored instant (Stash's created and updated times, the viewer's last
 * play) reads a `YYYY-MM-DD` value as that day where the viewer is: from its
 * first instant to the next day's first instant, in epoch milliseconds. The
 * zone is an IANA name the request carries (`middleware/requestTimeZone.ts`);
 * the process's own zone is never read.
 */

const MAX_ZONE_LENGTH = 64;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
/** A date-time without an offset: a wall time, read in the zone */
const LOCAL_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/;
/** A date-time that names its offset: an instant wherever it is read */
const WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i;
/** Wide enough to hold both sides of any offset change around a wall time */
const PROBE_MS = 6 * 3_600_000;

/**
 * One formatter per canonical zone name. `Intl` accepts a zone in any
 * letter case and links (`US/Eastern`), so the header can carry far more
 * spellings than there are zones: the cache is keyed only by the canonical
 * name `Intl` resolves, and holds at most `MAX_CACHED_ZONES`, the oldest
 * dropped first, so no header value can grow it without limit.
 */
export const MAX_CACHED_ZONES = 500;
const formatters = new Map<string, Intl.DateTimeFormat>();

/** How many formatters the cache holds (for tests) */
export function cachedZoneCount(): number {
  return formatters.size;
}

/** The zone's formatter; throws a RangeError for a zone `Intl` refuses */
function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone);
  if (cached !== undefined) return cached;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });
  const canonical = formatter.resolvedOptions().timeZone;
  const existing = formatters.get(canonical);
  if (existing !== undefined) return existing;
  if (formatters.size >= MAX_CACHED_ZONES) {
    const oldest = formatters.keys().next();
    if (oldest.done !== true) formatters.delete(oldest.value);
  }
  formatters.set(canonical, formatter);
  return formatter;
}

/**
 * The canonical name of a zone `Intl` knows (`america/chicago` is
 * `America/Chicago`), else undefined; over 64 characters is undefined.
 */
export function canonicalTimeZone(value: string): string | undefined {
  if (value.length === 0 || value.length > MAX_ZONE_LENGTH) return undefined;
  try {
    return formatterFor(value).resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

/**
 * The epoch ms whose UTC fields are these, for any year from 1 (Date.UTC
 * reads 0 to 99 as 1900 to 1999). Out-of-range fields roll over.
 */
function utcOf(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0
): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, ms);
  return date.getTime();
}

/** The zone's wall clock at an instant, as the epoch ms of those UTC fields */
function wallAt(instant: number, timeZone: string): number {
  const fields: Record<string, number> = {};
  for (const part of formatterFor(timeZone).formatToParts(instant)) {
    if (part.type !== "literal") fields[part.type] = Number(part.value);
  }
  const ms = ((instant % 1000) + 1000) % 1000;
  return utcOf(
    fields.year ?? 1970,
    fields.month ?? 1,
    fields.day ?? 1,
    fields.hour ?? 0,
    fields.minute ?? 0,
    fields.second ?? 0,
    ms
  );
}

/**
 * The first instant the zone's clock reads `wall` (a wall time as the epoch
 * ms of its UTC fields). The zone's offsets around it are probed; each
 * gives a candidate, kept when the clock reads exactly `wall` there, the
 * earliest kept (a clock set back reads it twice). When none is kept the
 * wall time was skipped (a clock set forward over it, as Chile's over
 * midnight): the answer is the first instant whose clock reads past it,
 * found by halving between the candidates.
 */
function zonedInstant(wall: number, timeZone: string): number {
  const first = wall - (wallAt(wall, timeZone) - wall);
  const offsets = new Set(
    [wall, first - PROBE_MS, first, first + PROBE_MS].map(
      (at) => wallAt(at, timeZone) - at
    )
  );
  const candidates = [...offsets].map((offset) => wall - offset);
  const exact = candidates.filter((at) => wallAt(at, timeZone) === wall);
  if (exact.length > 0) return Math.min(...exact);

  let before = Math.min(...candidates);
  let after = Math.max(...candidates);
  while (after - before > 1) {
    const mid = Math.floor((before + after) / 2);
    if (wallAt(mid, timeZone) >= wall) after = mid;
    else before = mid;
  }
  return after;
}

/**
 * The zone's calendar day at an instant (now by default), as `YYYY-MM-DD`:
 * "today" where the viewer is.
 */
export function zonedToday(timeZone: string, at = Date.now()): string {
  const wall = new Date(wallAt(at, timeZone));
  const y = String(wall.getUTCFullYear()).padStart(4, "0");
  const m = String(wall.getUTCMonth() + 1).padStart(2, "0");
  const d = String(wall.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Year, month and day of a valid `YYYY-MM-DD`, else undefined */
function dayFields(day: string): [number, number, number] | undefined {
  const match = DATE_ONLY.exec(day);
  if (match === null) return undefined;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const at = new Date(utcOf(y, m, d));
  return at.getUTCFullYear() === y &&
    at.getUTCMonth() === m - 1 &&
    at.getUTCDate() === d
    ? [y, m, d]
    : undefined;
}

/**
 * The epoch ms of a YYYY-MM-DD day's first instant in the zone: its
 * midnight, or the first instant after a midnight the zone skipped. NaN for
 * a value that is no day.
 */
export function zonedDayStart(day: string, timeZone: string): number {
  const fields = dayFields(day);
  if (fields === undefined) return NaN;
  const [y, m, d] = fields;
  return zonedInstant(utcOf(y, m, d), timeZone);
}

/**
 * A date criterion value as [start, end): a `YYYY-MM-DD` day in the zone
 * (its first instant to the next day's), or a date-time's single
 * millisecond. A date-time with an offset or `Z` is that instant; one
 * without is a wall time in the zone. Undefined for anything else.
 */
export function instantSpan(
  value: string,
  timeZone: string
): { start: number; end: number } | undefined {
  const day = dayFields(value);
  if (day !== undefined) {
    const [y, m, d] = day;
    return {
      start: zonedInstant(utcOf(y, m, d), timeZone),
      end: zonedInstant(utcOf(y, m, d + 1), timeZone),
    };
  }
  const local = LOCAL_DATE_TIME.exec(value);
  if (local !== null) {
    const [y, m, d] = [Number(local[1]), Number(local[2]), Number(local[3])];
    if (dayFields(value.slice(0, 10)) === undefined) return undefined;
    const ms = Number((local[7] ?? "").padEnd(3, "0").slice(0, 3));
    const wall = utcOf(
      y,
      m,
      d,
      Number(local[4]),
      Number(local[5]),
      Number(local[6] ?? 0),
      ms
    );
    const start = zonedInstant(wall, timeZone);
    return { start, end: start + 1 };
  }
  const start = WITH_OFFSET.test(value) ? Date.parse(value) : NaN;
  if (Number.isNaN(start)) return undefined;
  return { start, end: start + 1 };
}
