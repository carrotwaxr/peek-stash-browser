/**
 * Clip preview URLs carry the instance (sweep item 2), so the server checks
 * the row it will serve on a multi-instance setup.
 */
import { describe, expect, it } from "vitest";
import { getClipPreviewUrl } from "@/api/clips";

describe("getClipPreviewUrl", () => {
  it("appends the instance", () => {
    expect(getClipPreviewUrl("5", "inst a")).toBe(
      "/api/proxy/clip/5/preview?instanceId=inst%20a"
    );
  });

  it("is unchanged without an instance", () => {
    expect(getClipPreviewUrl("5")).toBe("/api/proxy/clip/5/preview");
    expect(getClipPreviewUrl("5", "")).toBe("/api/proxy/clip/5/preview");
  });
});
