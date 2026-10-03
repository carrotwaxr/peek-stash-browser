/**
 * Days and instants in the viewer's time zone (item 43): a date filter on a
 * stored instant (created, updated, last played) reads a `YYYY-MM-DD` value
 * as that day where the viewer is, `[start, next day's start)` in epoch
 * milliseconds. The process's own zone never matters: these run the same
 * with `TZ=America/Los_Angeles`.
 */
import { describe, expect, it } from "vitest";
import {
  MAX_CACHED_ZONES,
  cachedZoneCount,
  canonicalTimeZone,
  instantSpan,
  zonedDayStart,
} from "../../utils/zonedTime.js";

const HOUR = 3_600_000;

describe("zonedDayStart", () => {
  it("a day in America/Chicago starts at its local midnight", () => {
    expect(zonedDayStart("2026-01-15", "America/Chicago")).toBe(
      Date.UTC(2026, 0, 15, 6)
    );
    // Daylight time: UTC-5
    expect(zonedDayStart("2021-10-12", "America/Chicago")).toBe(
      Date.UTC(2021, 9, 12, 5)
    );
  });

  it("the spring-forward day is 23 hours, the fall-back day 25", () => {
    const spring =
      zonedDayStart("2026-03-09", "America/Chicago") -
      zonedDayStart("2026-03-08", "America/Chicago");
    expect(spring).toBe(23 * HOUR);
    const fall =
      zonedDayStart("2026-11-02", "America/Chicago") -
      zonedDayStart("2026-11-01", "America/Chicago");
    expect(fall).toBe(25 * HOUR);
  });

  it("a day whose midnight is skipped starts at its first instant", () => {
    // Chile moves 00:00 to 01:00 on 2026-09-06: the day starts at 01:00
    // local (UTC-3), the instant the old clock (UTC-4) read midnight
    expect(zonedDayStart("2026-09-06", "America/Santiago")).toBe(
      Date.UTC(2026, 8, 6, 4)
    );
    // The day before ends there: no instant is in neither day
    expect(instantSpan("2026-09-05", "America/Santiago")).toEqual({
      start: Date.UTC(2026, 8, 5, 4),
      end: Date.UTC(2026, 8, 6, 4),
    });
  });

  it("Asia/Kolkata's day starts at 18:30Z the day before", () => {
    expect(zonedDayStart("2026-01-15", "Asia/Kolkata")).toBe(
      Date.UTC(2026, 0, 14, 18, 30)
    );
  });

  it("UTC's day is the calendar day", () => {
    expect(zonedDayStart("2021-10-12", "UTC")).toBe(Date.UTC(2021, 9, 12));
  });

  it("the last day of a month and of a year roll over", () => {
    expect(instantSpan("2026-12-31", "UTC")).toEqual({
      start: Date.UTC(2026, 11, 31),
      end: Date.UTC(2027, 0, 1),
    });
    expect(instantSpan("2024-02-29", "America/Chicago")?.end).toBe(
      Date.UTC(2024, 2, 1, 6)
    );
  });
});

describe("instantSpan", () => {
  it("a day is [its start, the next day's start) in the zone", () => {
    expect(instantSpan("2021-10-12", "America/Chicago")).toEqual({
      start: 1634014800000,
      end: 1634101200000,
    });
  });

  it("a date-time value is its instant", () => {
    const at = Date.UTC(2021, 9, 12, 13);
    expect(instantSpan("2021-10-12T13:00:00Z", "America/Chicago")).toEqual({
      start: at,
      end: at + 1,
    });
    expect(
      instantSpan("2021-10-12T08:00:00.250-05:00", "Asia/Kolkata")
    ).toEqual({ start: at + 250, end: at + 251 });
  });

  it("a date-time without an offset is the wall time in the zone", () => {
    expect(instantSpan("2021-10-12T08:00", "America/Chicago")).toEqual({
      start: Date.UTC(2021, 9, 12, 13),
      end: Date.UTC(2021, 9, 12, 13) + 1,
    });
    expect(instantSpan("2021-10-12T08:00:00.5", "UTC")?.start).toBe(
      Date.UTC(2021, 9, 12, 8, 0, 0, 500)
    );
  });

  it("a wall time the zone skipped is the first instant after the jump", () => {
    // 02:30 never happened in Chicago on 2026-03-08: 02:00 CST became 03:00 CDT
    expect(instantSpan("2026-03-08T02:30", "America/Chicago")?.start).toBe(
      Date.UTC(2026, 2, 8, 8)
    );
    // A wall time read twice (01:30 on the fall-back day) is its first reading
    expect(instantSpan("2026-11-01T01:30", "America/Chicago")?.start).toBe(
      Date.UTC(2026, 10, 1, 6, 30)
    );
  });

  it("an unreadable value is no span", () => {
    expect(instantSpan("nope", "UTC")).toBeUndefined();
    expect(instantSpan("2021-13-45", "UTC")).toBeUndefined();
    expect(instantSpan("2021-02-30T10:00", "UTC")).toBeUndefined();
    // A date-time with neither an offset nor the T form is not guessed at
    expect(instantSpan("2021-10-12 10:00", "UTC")).toBeUndefined();
  });
});

/** Every upper/lower case mix of an ASCII name's first `bits` letters */
function caseVariants(name: string, bits: number): string[] {
  const lower = name.toLowerCase();
  const variants: string[] = [];
  for (let mask = 0; mask < 2 ** bits; mask++) {
    let variant = "";
    let bit = 0;
    for (let at = 0; at < lower.length; at++) {
      const ch = lower.charAt(at);
      const isLetter = ch !== ch.toUpperCase();
      variant +=
        isLetter && bit < bits && mask & (1 << bit) ? ch.toUpperCase() : ch;
      if (isLetter) bit++;
    }
    variants.push(variant);
  }
  return variants;
}

describe("canonicalTimeZone", () => {
  it("an unknown, empty or over-long zone has no canonical name", () => {
    expect(canonicalTimeZone("Not/AZone")).toBeUndefined();
    expect(canonicalTimeZone("")).toBeUndefined();
    expect(canonicalTimeZone(`America/${"x".repeat(60)}`)).toBeUndefined();
  });

  it("an IANA zone and UTC are kept", () => {
    expect(canonicalTimeZone("America/Chicago")).toBe("America/Chicago");
    expect(canonicalTimeZone("UTC")).toBe("UTC");
  });

  it("a renamed zone is the name ICU keeps for it", () => {
    // CLDR keeps the old name of a renamed zone; ICU versions differ
    expect(canonicalTimeZone("Asia/Kolkata")).toMatch(
      /^Asia\/(Kolkata|Calcutta)$/
    );
  });

  it("any letter case of a zone is its canonical name", () => {
    expect(canonicalTimeZone("america/new_york")).toBe("America/New_York");
    expect(canonicalTimeZone("AMERICA/NEW_YORK")).toBe("America/New_York");
    expect(canonicalTimeZone("utc")).toBe("UTC");
  });
});

describe("the formatter cache", () => {
  it("1024 case variants of one zone add at most one cached formatter", () => {
    const variants = caseVariants("America/New_York", 10);
    expect(new Set(variants).size).toBe(1024);
    const before = cachedZoneCount();
    for (const variant of variants) {
      expect(zonedDayStart("2026-01-15", variant)).toBe(
        Date.UTC(2026, 0, 15, 5)
      );
    }
    expect(cachedZoneCount() - before).toBeLessThanOrEqual(1);
  });

  it("more distinct zones than the cap leave at most the cap cached", () => {
    let count = 0;
    for (let hour = -23; hour <= 23 && count <= MAX_CACHED_ZONES; hour++) {
      for (let minute = 0; minute < 60 && count <= MAX_CACHED_ZONES; minute++) {
        const sign = hour < 0 ? "-" : "+";
        const hh = String(Math.abs(hour)).padStart(2, "0");
        const mm = String(minute).padStart(2, "0");
        zonedDayStart("2026-01-15", `${sign}${hh}:${mm}`);
        count++;
      }
    }
    expect(count).toBeGreaterThan(MAX_CACHED_ZONES);
    expect(cachedZoneCount()).toBeLessThanOrEqual(MAX_CACHED_ZONES);
  });
});
