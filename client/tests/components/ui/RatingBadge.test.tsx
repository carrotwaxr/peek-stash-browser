import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RatingBadge from "../../../src/components/ui/RatingBadge";

/** Relative luminance of a #rrggbb colour (WCAG) */
const luminance = (hex: string) => {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((at) => {
    const channel = parseInt(hex.slice(at, at + 2), 16) / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: string, b: string) => {
  const [hi = 0, lo = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("RatingBadge", () => {
  it("an unrated badge takes its colours from the theme, so it reads on a light card too", () => {
    render(<RatingBadge rating={null} />);

    const badge = screen.getByRole("button", { name: "Not rated" });

    expect(badge).toHaveTextContent("--");
    expect(badge.style.background).toBe("var(--bg-secondary)");
    expect(badge.style.color).toBe("var(--text-secondary)");
    expect(badge.getAttribute("style")).toContain("var(--border-color)");
  });

  it.each([
    ["bronze", 20],
    ["silver", 55],
    ["gold", 90],
  ])(
    "a %s medal's text reads on every stop of its gradient (4.5:1)",
    (_medal, rating) => {
      render(<RatingBadge rating={rating} />);

      const badge = screen.getByRole("button", { name: /^Rating:/ });
      const text = badge.style.color;
      const stops = badge.style.background.match(/#[0-9a-fA-F]{6}/g) ?? [];

      expect(stops.length).toBeGreaterThan(2);
      for (const stop of stops) {
        expect(contrast(rgbToHex(text), stop)).toBeGreaterThanOrEqual(4.5);
      }
    }
  );

  it("shows the rating on the 0 to 10 scale", () => {
    render(<RatingBadge rating={68} />);

    expect(
      screen.getByRole("button", { name: "Rating: 6.8" })
    ).toHaveTextContent("6.8");
  });
});

/** A colour as #rrggbb, whether given as #rgb, #rrggbb or rgb(r, g, b) */
function rgbToHex(color: string) {
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  const short = color.match(/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/);
  if (short)
    return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  const channels = color.match(/\d+/g);
  if (!channels) return color;
  return `#${channels.map((c) => Number(c).toString(16).padStart(2, "0")).join("")}`;
}
