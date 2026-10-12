/**
 * Where a popover's left edge goes, on screen: lined up with the anchor's
 * start (or end) edge, flipped to the other edge when that runs off the
 * screen, and always kept `gutter` px in.
 */
import { describe, expect, it } from "vitest";
import { popoverLeft } from "@/utils/popoverPlacement";

const base = { width: 288, viewportWidth: 1280, gutter: 16 } as const;

describe("popoverLeft", () => {
  it("lines up with the anchor's left edge when it fits", () => {
    expect(
      popoverLeft({
        ...base,
        anchorLeft: 100,
        anchorWidth: 70,
        placement: "bottom-start",
      })
    ).toBe(100);
  });

  it("lines up with the anchor's right edge for bottom-end", () => {
    expect(
      popoverLeft({
        ...base,
        anchorLeft: 600,
        anchorWidth: 70,
        placement: "bottom-end",
      })
    ).toBe(600 + 70 - 288);
  });

  it("flips to the anchor's right edge when its left edge would run off", () => {
    // The "+ Filter" button at x=1092, 70px wide, in a 1280px window
    const left = popoverLeft({
      ...base,
      anchorLeft: 1092,
      anchorWidth: 70,
      placement: "bottom-start",
    });
    expect(left).toBe(1092 + 70 - 288);
    expect(left + 288).toBeLessThanOrEqual(1280 - 16);
  });

  it("flips to the anchor's left edge when its right edge would run off the left", () => {
    expect(
      popoverLeft({
        ...base,
        anchorLeft: 20,
        anchorWidth: 70,
        placement: "bottom-end",
      })
    ).toBe(20);
  });

  it("keeps the gutter when neither edge fits", () => {
    // An anchor at the very right: right-aligned would sit 4px from the edge
    expect(
      popoverLeft({
        ...base,
        anchorLeft: 1230,
        anchorWidth: 46,
        placement: "bottom-start",
      })
    ).toBe(1280 - 16 - 288);
    // At the very left, bottom-end would start left of the gutter
    expect(
      popoverLeft({
        ...base,
        anchorLeft: 4,
        anchorWidth: 46,
        placement: "bottom-end",
      })
    ).toBe(16);
  });

  it("puts its left edge first when it is wider than the screen", () => {
    expect(
      popoverLeft({
        width: 500,
        viewportWidth: 390,
        gutter: 16,
        anchorLeft: 200,
        anchorWidth: 40,
        placement: "bottom-start",
      })
    ).toBe(16);
  });
});
