/**
 * Where a scene starts: the resume point counts only while the scene is in
 * progress (the server's IN_PROGRESS_SQL rule), and a link's ?t= wins.
 */
import { describe, expect, it } from "vitest";
import {
  explicitStartTime,
  inProgressResumeTime,
} from "@/components/video-player/resumePoint";

describe("inProgressResumeTime", () => {
  it("a point before the last 10% of the scene is the resume point", () => {
    expect(inProgressResumeTime(300, 1000)).toBe(300);
    expect(inProgressResumeTime(899, 1000)).toBe(899);
  });

  it("a point in the last 10% (watched) is none", () => {
    expect(inProgressResumeTime(900, 1000)).toBeNull();
    expect(inProgressResumeTime(990, 1000)).toBeNull();
  });

  it("without a known duration any point past 0 counts", () => {
    expect(inProgressResumeTime(300, undefined)).toBe(300);
    expect(inProgressResumeTime(300, 0)).toBe(300);
    expect(inProgressResumeTime(300, null)).toBe(300);
  });

  it("no point, or 0, is none", () => {
    expect(inProgressResumeTime(0, 1000)).toBeNull();
    expect(inProgressResumeTime(null, 1000)).toBeNull();
    expect(inProgressResumeTime(undefined, undefined)).toBeNull();
  });
});

describe("explicitStartTime", () => {
  it("reads ?t= in seconds", () => {
    expect(explicitStartTime("?t=120")).toBe(120);
    expect(explicitStartTime("?tab=similar&t=45")).toBe(45);
  });

  it("no t, 0, a negative or a non-number is none", () => {
    expect(explicitStartTime("")).toBeNull();
    expect(explicitStartTime(undefined)).toBeNull();
    expect(explicitStartTime("?t=0")).toBeNull();
    expect(explicitStartTime("?t=-5")).toBeNull();
    expect(explicitStartTime("?t=abc")).toBeNull();
  });
});
