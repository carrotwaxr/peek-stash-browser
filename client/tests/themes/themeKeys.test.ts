import {
  BUILT_IN_THEME_KEYS,
  customThemeKey,
  isBuiltInThemeKey,
  parseCustomThemeKey,
} from "@peek/shared-types/themes.js";
import { describe, expect, it } from "vitest";
import { themes } from "../../src/themes/themes";

describe("theme keys", () => {
  it("every key in client themes is in BUILT_IN_THEME_KEYS and the reverse", () => {
    expect(Object.keys(themes).sort()).toEqual([...BUILT_IN_THEME_KEYS].sort());
  });

  it("isBuiltInThemeKey accepts only built-in keys", () => {
    expect(isBuiltInThemeKey("peek")).toBe(true);
    expect(isBuiltInThemeKey("theHub")).toBe(true);
    expect(isBuiltInThemeKey("dark")).toBe(false);
    expect(isBuiltInThemeKey("custom-1")).toBe(false);
    expect(isBuiltInThemeKey(null)).toBe(false);
  });

  it("custom keys round-trip through customThemeKey and parseCustomThemeKey", () => {
    expect(customThemeKey(9)).toBe("custom-9");
    expect(parseCustomThemeKey("custom-9")).toBe(9);
    expect(parseCustomThemeKey("custom-")).toBeNull();
    expect(parseCustomThemeKey("custom-9x")).toBeNull();
    expect(parseCustomThemeKey("custom-0")).toBeNull();
    expect(parseCustomThemeKey("peek")).toBeNull();
    expect(parseCustomThemeKey(null)).toBeNull();
  });
});
