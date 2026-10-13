/**
 * rawDate: a timestamp a raw query returns (a Date, epoch milliseconds as a
 * number or text, or date text) as a Date, or null when there is none or it
 * cannot be read.
 */
import { describe, expect, it } from "vitest";
import { rawDate } from "../../utils/rawDate.js";

const AT = Date.UTC(2026, 8, 1);

describe("rawDate", () => {
  it("keeps a Date", () => {
    expect(rawDate(new Date(AT))?.getTime()).toBe(AT);
  });

  it("reads epoch milliseconds, as a number, a bigint or text", () => {
    expect(rawDate(AT)?.getTime()).toBe(AT);
    expect(rawDate(BigInt(AT))?.getTime()).toBe(AT);
    expect(rawDate(String(AT))?.getTime()).toBe(AT);
  });

  it("reads date text", () => {
    expect(rawDate("2026-09-01T00:00:00Z")?.getTime()).toBe(AT);
  });

  it("is null for nothing and for what it cannot read", () => {
    expect(rawDate(null)).toBeNull();
    expect(rawDate(undefined)).toBeNull();
    expect(rawDate("not a date")).toBeNull();
    expect(rawDate(new Date(Number.NaN))).toBeNull();
  });
});
