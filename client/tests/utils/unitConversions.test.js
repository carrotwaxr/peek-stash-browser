import { describe, it, expect } from "vitest";
import {
  UNITS,
  cmToFeetInches,
  feetInchesToCm,
  formatHeight,
  kgToLbs,
  lbsToKg,
  formatWeight,
  cmToInches,
  inchesToCm,
  formatLength,
} from "../../src/utils/unitConversions.js";

describe("unitConversions", () => {
  describe("UNITS constant", () => {
    it("exports METRIC and IMPERIAL values", () => {
      expect(UNITS.METRIC).toBe("metric");
      expect(UNITS.IMPERIAL).toBe("imperial");
    });
  });

  describe("height conversions", () => {
    it("converts 178 cm to 5 feet 10 inches", () => {
      const result = cmToFeetInches(178);
      expect(result.feet).toBe(5);
      expect(result.inches).toBe(10);
    });

    it("converts 183 cm to 6 feet 0 inches", () => {
      const result = cmToFeetInches(183);
      expect(result.feet).toBe(6);
      expect(result.inches).toBe(0);
    });

    it("returns zeros for null/undefined input", () => {
      expect(cmToFeetInches(null)).toEqual({ feet: 0, inches: 0 });
      expect(cmToFeetInches(undefined)).toEqual({ feet: 0, inches: 0 });
    });

    it("converts 5 feet 10 inches to 178 cm", () => {
      expect(feetInchesToCm(5, 10)).toBe(178);
    });

    it("converts 6 feet 0 inches to 183 cm", () => {
      expect(feetInchesToCm(6, 0)).toBe(183);
    });

    it("formats height in metric as 'X cm'", () => {
      expect(formatHeight(178, UNITS.METRIC)).toBe("178 cm");
    });

    it("formats height in imperial as X'Y\"", () => {
      expect(formatHeight(178, UNITS.IMPERIAL)).toBe("5'10\"");
    });

    it("formats 183cm in imperial as 6'0\"", () => {
      expect(formatHeight(183, UNITS.IMPERIAL)).toBe("6'0\"");
    });

    it("returns null for null/undefined input", () => {
      expect(formatHeight(null, UNITS.METRIC)).toBeNull();
      expect(formatHeight(undefined, UNITS.IMPERIAL)).toBeNull();
    });
  });

  describe("weight conversions", () => {
    it("converts 70 kg to 154 lbs", () => {
      expect(kgToLbs(70)).toBe(154);
    });

    it("converts 100 kg to 221 lbs", () => {
      expect(kgToLbs(100)).toBe(221);
    });

    it("converts 154 lbs to 70 kg", () => {
      expect(lbsToKg(154)).toBe(70);
    });

    it("converts 221 lbs to 100 kg", () => {
      expect(lbsToKg(221)).toBe(100);
    });

    it("formats weight in metric as 'X kg'", () => {
      expect(formatWeight(70, UNITS.METRIC)).toBe("70 kg");
    });

    it("formats weight in imperial as 'X lbs'", () => {
      expect(formatWeight(70, UNITS.IMPERIAL)).toBe("154 lbs");
    });

    it("returns null for null/undefined input", () => {
      expect(formatWeight(null, UNITS.METRIC)).toBeNull();
      expect(formatWeight(undefined, UNITS.IMPERIAL)).toBeNull();
    });
  });

  describe("length conversions (penis length)", () => {
    it("converts 15 cm to 5.9 inches", () => {
      expect(cmToInches(15)).toBe(5.9);
    });

    it("converts 20 cm to 7.9 inches", () => {
      expect(cmToInches(20)).toBe(7.9);
    });

    it("converts 6 inches to 15.2 cm", () => {
      expect(inchesToCm(6)).toBe(15.2);
    });

    it("formats length in metric as 'X cm'", () => {
      expect(formatLength(15, UNITS.METRIC)).toBe("15 cm");
    });

    it("formats length in imperial as 'X in'", () => {
      expect(formatLength(15, UNITS.IMPERIAL)).toBe("5.9 in");
    });

    it("handles zero value", () => {
      expect(formatLength(0, UNITS.METRIC)).toBe("0 cm");
      expect(formatLength(0, UNITS.IMPERIAL)).toBe("0 in");
    });

    it("returns null for null/undefined input", () => {
      expect(formatLength(null, UNITS.METRIC)).toBeNull();
      expect(formatLength(undefined, UNITS.IMPERIAL)).toBeNull();
    });
  });
});