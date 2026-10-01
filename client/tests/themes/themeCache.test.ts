/**
 * The theme cache: the key and variables of the theme last painted, applied
 * before React renders so the first paint is already themed. Only built-in
 * variables are cached, so a shared browser never paints the last user's
 * custom colours.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyCachedTheme,
  readCachedThemeVars,
  readStoredThemeKey,
  writeCachedThemeVars,
} from "@/themes/themeCache";
import { themes } from "@/themes/themes";

const rootStyle = () => document.documentElement.style;

describe("themeCache", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("style");
  });

  it("applyCachedTheme sets each cached variable on documentElement; a corrupt cache applies nothing and is removed", () => {
    writeCachedThemeVars("light", themes.light.properties);
    applyCachedTheme();
    expect(rootStyle().getPropertyValue("--bg-primary")).toBe(
      themes.light.properties["--bg-primary"]
    );
    expect(rootStyle().getPropertyValue("--accent-primary")).toBe(
      themes.light.properties["--accent-primary"]
    );

    document.documentElement.removeAttribute("style");
    localStorage.setItem("app-theme-vars", "{not json");
    applyCachedTheme();
    expect(rootStyle().getPropertyValue("--bg-primary")).toBe("");
    expect(localStorage.getItem("app-theme-vars")).toBeNull();

    // Valid JSON of the wrong shape is corrupt as well
    localStorage.setItem("app-theme-vars", JSON.stringify({ color: 5 }));
    applyCachedTheme();
    expect(rootStyle().length).toBe(0);
    expect(localStorage.getItem("app-theme-vars")).toBeNull();
  });

  it("writeCachedThemeVars stores the key and a built-in theme's variables", () => {
    writeCachedThemeVars("midnight", themes.midnight.properties);
    expect(readStoredThemeKey()).toBe("midnight");
    expect(readCachedThemeVars()).toEqual(themes.midnight.properties);
  });

  it("a custom key is stored, but the variables cached are peek's", () => {
    writeCachedThemeVars("custom-7", { "--bg-primary": "#101010" });
    expect(readStoredThemeKey()).toBe("custom-7");
    expect(readCachedThemeVars()).toEqual(themes.peek.properties);
  });

  it("with nothing cached, applyCachedTheme applies nothing", () => {
    applyCachedTheme();
    expect(rootStyle().length).toBe(0);
    expect(readStoredThemeKey()).toBeNull();
  });
});
