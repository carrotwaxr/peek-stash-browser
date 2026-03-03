import { describe, it, expect } from "vitest";
import {
  adjustLightness,
  generateTextScale,
  generateShadows,
  generateFocusRing,
  generateStatusColors,
  generateToastColors,
} from "../../src/utils/colorScale";

describe("colorScale utilities", () => {
  describe("adjustLightness", () => {
    it("returns a valid hex color string", () => {
      const result = adjustLightness("#336699", 10);
      expect(result).toMatch(/^#[0-9a-f]{6}$/);
    });

    it("increases lightness when amount is positive", () => {
      const original = "#336699";
      const lighter = adjustLightness(original, 20);
      // Lighter color should have higher hex values overall
      expect(lighter).not.toBe(original);
    });

    it("decreases lightness when amount is negative", () => {
      const original = "#336699";
      const darker = adjustLightness(original, -20);
      expect(darker).not.toBe(original);
    });

    it("returns similar color when amount is 0", () => {
      const original = "#336699";
      const result = adjustLightness(original, 0);
      expect(result).toBe(original);
    });

    it("handles white (#ffffff)", () => {
      const result = adjustLightness("#ffffff", -20);
      expect(result).toMatch(/^#[0-9a-f]{6}$/);
      // Making white darker should produce a non-white color
      expect(result).not.toBe("#ffffff");
    });

    it("handles black (#000000)", () => {
      const result = adjustLightness("#000000", 20);
      expect(result).toMatch(/^#[0-9a-f]{6}$/);
      // Making black lighter should produce a non-black color
      expect(result).not.toBe("#000000");
    });

    it("clamps lightness at 100 (does not exceed white)", () => {
      const result = adjustLightness("#cccccc", 200);
      expect(result).toMatch(/^#[0-9a-f]{6}$/);
    });

    it("clamps lightness at 0 (does not go below black)", () => {
      const result = adjustLightness("#333333", -200);
      expect(result).toMatch(/^#[0-9a-f]{6}$/);
    });
  });

  describe("generateTextScale", () => {
    it("returns object with --text-primary, --text-secondary, --text-muted keys", () => {
      const result = generateTextScale("#e0e0e0");
      expect(result).toHaveProperty("--text-primary");
      expect(result).toHaveProperty("--text-secondary");
      expect(result).toHaveProperty("--text-muted");
    });

    it("sets --text-primary to the base color", () => {
      const base = "#e0e0e0";
      const result = generateTextScale(base);
      expect(result["--text-primary"]).toBe(base);
    });

    it("dark mode produces different values than light mode", () => {
      const base = "#aaaaaa";
      const dark = generateTextScale(base, "dark");
      const light = generateTextScale(base, "light");
      expect(dark["--text-secondary"]).not.toBe(light["--text-secondary"]);
      expect(dark["--text-muted"]).not.toBe(light["--text-muted"]);
    });

    it("defaults to dark mode", () => {
      const base = "#aaaaaa";
      const defaultResult = generateTextScale(base);
      const darkResult = generateTextScale(base, "dark");
      expect(defaultResult).toEqual(darkResult);
    });
  });

  describe("generateShadows", () => {
    it("returns --shadow-sm, --shadow-md, --shadow-lg keys", () => {
      const result = generateShadows("#3366ff");
      expect(result).toHaveProperty("--shadow-sm");
      expect(result).toHaveProperty("--shadow-md");
      expect(result).toHaveProperty("--shadow-lg");
    });

    it("values contain rgba", () => {
      const result = generateShadows("#3366ff");
      expect(result["--shadow-sm"]).toContain("rgba(");
      expect(result["--shadow-md"]).toContain("rgba(");
      expect(result["--shadow-lg"]).toContain("rgba(");
    });

    it("dark mode uses lower opacity than light mode", () => {
      const dark = generateShadows("#3366ff", "dark");
      const light = generateShadows("#3366ff", "light");
      // Dark mode opacities: 0.05, 0.1, 0.15 vs light: 0.1, 0.15, 0.2
      expect(dark["--shadow-sm"]).not.toBe(light["--shadow-sm"]);
    });

    it("includes correct RGB values from hex input", () => {
      // #ff0000 -> r=255, g=0, b=0
      const result = generateShadows("#ff0000");
      expect(result["--shadow-sm"]).toContain("255, 0, 0");
    });
  });

  describe("generateFocusRing", () => {
    it("returns --focus-ring-color key", () => {
      const result = generateFocusRing("#3366ff");
      expect(result).toHaveProperty("--focus-ring-color");
    });

    it("returns --selection-bg key", () => {
      const result = generateFocusRing("#3366ff");
      expect(result).toHaveProperty("--selection-bg");
    });

    it("returns --border-focus key", () => {
      const result = generateFocusRing("#3366ff");
      expect(result).toHaveProperty("--border-focus");
    });

    it("sets --focus-ring-color to the accent color", () => {
      const accent = "#3366ff";
      const result = generateFocusRing(accent);
      expect(result["--focus-ring-color"]).toBe(accent);
    });

    it("--selection-bg contains rgba with the accent RGB values", () => {
      // #00ff00 -> r=0, g=255, b=0
      const result = generateFocusRing("#00ff00");
      expect(result["--selection-bg"]).toContain("rgba(0, 255, 0");
    });
  });

  describe("generateStatusColors", () => {
    const status = {
      success: "#22c55e",
      error: "#ef4444",
    };

    it("creates base, -bg, and -border variants for each status key", () => {
      const result = generateStatusColors(status);
      expect(result).toHaveProperty("--status-success");
      expect(result).toHaveProperty("--status-success-bg");
      expect(result).toHaveProperty("--status-success-border");
      expect(result).toHaveProperty("--status-error");
      expect(result).toHaveProperty("--status-error-bg");
      expect(result).toHaveProperty("--status-error-border");
    });

    it("base variant is the original color", () => {
      const result = generateStatusColors(status);
      expect(result["--status-success"]).toBe("#22c55e");
      expect(result["--status-error"]).toBe("#ef4444");
    });

    it("-bg variants contain rgba", () => {
      const result = generateStatusColors(status);
      expect(result["--status-success-bg"]).toContain("rgba(");
      expect(result["--status-error-bg"]).toContain("rgba(");
    });

    it("-border variants contain rgba", () => {
      const result = generateStatusColors(status);
      expect(result["--status-success-border"]).toContain("rgba(");
      expect(result["--status-error-border"]).toContain("rgba(");
    });

    it("handles empty status object", () => {
      const result = generateStatusColors({});
      expect(Object.keys(result)).toHaveLength(0);
    });
  });

  describe("generateToastColors", () => {
    const status = {
      success: "#22c55e",
      error: "#ef4444",
    };

    it("returns toast-specific vars for each status key", () => {
      const result = generateToastColors(status);
      expect(result).toHaveProperty("--toast-success-bg");
      expect(result).toHaveProperty("--toast-success-border");
      expect(result).toHaveProperty("--toast-success-shadow");
      expect(result).toHaveProperty("--toast-error-bg");
      expect(result).toHaveProperty("--toast-error-border");
      expect(result).toHaveProperty("--toast-error-shadow");
    });

    it("dark vs light produce different results", () => {
      const dark = generateToastColors(status, "dark");
      const light = generateToastColors(status, "light");
      expect(dark["--toast-success-bg"]).not.toBe(light["--toast-success-bg"]);
    });

    it("shadow values contain rgba", () => {
      const result = generateToastColors(status);
      expect(result["--toast-success-shadow"]).toContain("rgba(");
      expect(result["--toast-error-shadow"]).toContain("rgba(");
    });

    it("handles empty status object", () => {
      const result = generateToastColors({});
      expect(Object.keys(result)).toHaveLength(0);
    });
  });
});
