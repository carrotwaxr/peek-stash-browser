import { describe, it, expect } from "vitest";
import { formatDate, formatRelativeTime } from "../../src/utils/date";

describe("date utilities", () => {
  describe("formatDate", () => {
    it("formats ISO date-only string without timezone shift", () => {
      const result = formatDate("2024-01-15");
      expect(result).toBe("Jan 15, 2024");
    });

    it("formats another date-only string correctly", () => {
      const result = formatDate("2023-12-25");
      expect(result).toBe("Dec 25, 2023");
    });

    it("formats full ISO timestamp", () => {
      const result = formatDate("2024-06-15T10:30:00Z");
      // Should produce a formatted date string (locale-dependent but contains Jun 2024)
      expect(result).toContain("2024");
      expect(result).toContain("Jun");
    });

    it("returns 'Unknown' for empty string", () => {
      expect(formatDate("")).toBe("Unknown");
    });

    it("returns 'Unknown' for null-like input", () => {
      expect(formatDate(null as any)).toBe("Unknown");
      expect(formatDate(undefined as any)).toBe("Unknown");
    });

    it("handles date-only string for each month", () => {
      expect(formatDate("2024-02-01")).toBe("Feb 1, 2024");
      expect(formatDate("2024-07-31")).toBe("Jul 31, 2024");
      expect(formatDate("2024-11-15")).toBe("Nov 15, 2024");
    });
  });

  describe("formatRelativeTime", () => {
    it("returns 'Just now' for very recent timestamp", () => {
      const now = new Date().toISOString();
      expect(formatRelativeTime(now)).toBe("Just now");
    });

    it("returns minutes ago for timestamps within the hour", () => {
      const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      expect(formatRelativeTime(thirtyMinsAgo)).toBe("30 minutes ago");
    });

    it("returns singular 'minute' for 1 minute ago", () => {
      const oneMinAgo = new Date(Date.now() - 60 * 1000).toISOString();
      expect(formatRelativeTime(oneMinAgo)).toBe("1 minute ago");
    });

    it("returns hours ago for timestamps earlier today", () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      expect(formatRelativeTime(threeHoursAgo)).toBe("3 hours ago");
    });

    it("returns singular 'hour' for 1 hour ago", () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      expect(formatRelativeTime(oneHourAgo)).toBe("1 hour ago");
    });

    it("returns 'Today' for today's date-only string", () => {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, "0");
      const day = String(today.getDate()).padStart(2, "0");
      expect(formatRelativeTime(`${year}-${month}-${day}`)).toBe("Today");
    });

    it("returns 'Yesterday' for yesterday's date-only string", () => {
      const yesterday = new Date(Date.now() - 86400000);
      const year = yesterday.getFullYear();
      const month = String(yesterday.getMonth() + 1).padStart(2, "0");
      const day = String(yesterday.getDate()).padStart(2, "0");
      expect(formatRelativeTime(`${year}-${month}-${day}`)).toBe("Yesterday");
    });

    it("returns 'N days ago' for dates within a week", () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 86400000);
      const year = threeDaysAgo.getFullYear();
      const month = String(threeDaysAgo.getMonth() + 1).padStart(2, "0");
      const day = String(threeDaysAgo.getDate()).padStart(2, "0");
      expect(formatRelativeTime(`${year}-${month}-${day}`)).toBe("3 days ago");
    });

    it("returns formatted date for dates older than a week", () => {
      const result = formatRelativeTime("2020-01-15");
      // Should fall back to formatDate
      expect(result).toBe("Jan 15, 2020");
    });

    it("returns 'Unknown' for empty string", () => {
      expect(formatRelativeTime("")).toBe("Unknown");
    });
  });
});
