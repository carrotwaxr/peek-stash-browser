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

  it("drops entries that are neither strings nor play sessions", () => {
    expect(
      readHistory([A, 5, null, { at: B }, { startTime: 5 }, [B], B])
    ).toEqual([A, B]);
    expect(readHistory(JSON.stringify([A, 7, B]))).toEqual([A, B]);
  });

  // Peek 1.0.0 and 1.0.1 appended a session object to playHistory on every
  // ping, and later updates appended ISO strings after them.
  describe("Peek 1.0 play sessions", () => {
    const C = "2026-01-03T00:00:00.000Z";
    const session = (startTime: string) => ({
      startTime,
      endTime: startTime,
      quality: "1080p",
      duration: 10,
      totalSessionDuration: 10,
      seekEvents: [{ from: 5, to: 30 }],
    });

    it("reads each session as its start time, in order with the strings", () => {
      expect(readHistory(JSON.stringify([session(A), session(B), C]))).toEqual([
        A,
        B,
        C,
      ]);
      expect(readHistory([session(A), B, session(C)])).toEqual([A, B, C]);
    });

    it("falls back to an entry's time when it has no startTime", () => {
      expect(readHistory([{ time: A }, B])).toEqual([A, B]);
    });
  });
});
