import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  calculateAge,
  formatDate,
  formatDuration,
  formatFileSize,
} from "../../../src/components/table/formatters";

describe("table formatters", () => {
  const zone = process.env.TZ;

  beforeEach(() => {
    // West of UTC: local midnight of a date-only value is the day before in UTC
    process.env.TZ = "America/Los_Angeles";
  });

  afterEach(() => {
    vi.useRealTimers();
    if (zone === undefined) delete process.env.TZ;
    else process.env.TZ = zone;
  });

  describe("formatDate", () => {
    it("a date-only value shows its own day in America/Los_Angeles", () => {
      expect(formatDate("2020-05-01")).toBe("May 1, 2020");
      expect(formatDate("2020-01-01")).toBe("Jan 1, 2020");
    });

    it("a timestamp shows the viewer's day", () => {
      // 03:00 UTC on May 2 is still May 1 in Los Angeles (UTC-7)
      expect(formatDate("2020-05-02T03:00:00Z")).toBe("May 1, 2020");
    });

    it("an empty value shows the dash when asked", () => {
      expect(formatDate(null, { empty: "-" })).toBe("-");
      expect(formatDate(undefined, { empty: "-" })).toBe("-");
    });
  });

  describe("calculateAge", () => {
    it("counts a date-only birthdate by its own day", () => {
      // On the birthday itself, west of UTC, local parsing makes it the day before
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2024-01-01T20:00:00-08:00"));
      expect(calculateAge("2000-01-01")).toBe(24);
      vi.setSystemTime(new Date("2023-12-31T20:00:00-08:00"));
      expect(calculateAge("2000-01-01")).toBe(23);
    });

    it("shows the dash for nothing or garbage", () => {
      expect(calculateAge(null)).toBe("-");
      expect(calculateAge("nope")).toBe("-");
    });
  });

  describe("shared formatters", () => {
    it("sizes and durations show the dash for nothing", () => {
      expect(formatFileSize(null)).toBe("-");
      expect(formatDuration(null, { empty: "-" })).toBe("-");
    });

    it("keeps one decimal above bytes and hours past an hour", () => {
      expect(formatFileSize(1536)).toBe("1.5 KB");
      expect(formatDuration(5400)).toBe("1:30:00");
    });
  });
});
