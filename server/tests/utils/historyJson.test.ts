/**
 * readHistory reads the timestamp lists kept in the history JSON columns
 * (oHistory, playHistory, viewHistory). Rows written by the old updates hold a
 * JSON-encoded string instead of an array, so both shapes must read back.
 */
import { describe, expect, it } from "vitest";
import { readHistory } from "../../utils/historyJson.js";

describe("readHistory", () => {
  const A = "2026-01-01T00:00:00.000Z";
  const B = "2026-01-02T00:00:00.000Z";

  it("returns the array for an array", () => {
    expect(readHistory([A, B])).toEqual([A, B]);
  });

  it("parses a JSON-encoded string", () => {
    expect(readHistory(JSON.stringify([A, B]))).toEqual([A, B]);
  });

  it("returns [] for a malformed string", () => {
    expect(readHistory("[not json")).toEqual([]);
    expect(readHistory("")).toEqual([]);
  });

  it("returns [] for null", () => {
    expect(readHistory(null)).toEqual([]);
  });

  it("returns [] for a value that is not an array", () => {
    expect(readHistory({ time: A })).toEqual([]);
    expect(readHistory(5)).toEqual([]);
    expect(readHistory(JSON.stringify({ time: A }))).toEqual([]);
  });

  it("drops entries that are not strings", () => {
    expect(readHistory([A, 5, null, { time: B }, B])).toEqual([A, B]);
    expect(readHistory(JSON.stringify([A, 7, B]))).toEqual([A, B]);
  });
});
