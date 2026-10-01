/**
 * The theme this browser last painted, kept in localStorage so the first
 * paint of the next load is already themed: `main.tsx` applies the cached
 * variables before React renders, and `ThemeProvider` reads the key until the
 * account's stored theme arrives.
 *
 * Only a built-in theme's variables are cached. For a custom theme the key is
 * kept but the variables cached are peek's, so a browser several people use
 * never paints one user's custom colours for the next (invariant 6).
 */
import { isBuiltInThemeKey } from "@peek/shared-types/themes.js";
import { defaultTheme, themes } from "./themes";

const THEME_KEY = "app-theme";
const THEME_VARS_KEY = "app-theme-vars";

/** The key of the theme this browser last painted, or null */
export function readStoredThemeKey(): string | null {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

const isThemeVars = (value: unknown): value is Record<string, string> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.entries(value).every(
    ([name, property]) => name.startsWith("--") && typeof property === "string"
  );

/** The cached variables, or null. A corrupt cache is removed. */
export function readCachedThemeVars(): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(THEME_VARS_KEY);
    if (raw === null) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = undefined;
    }
    if (isThemeVars(parsed)) return parsed;
    localStorage.removeItem(THEME_VARS_KEY);
    return null;
  } catch {
    return null;
  }
}

/**
 * Remember the painted theme: its key, and its variables when it is a
 * built-in theme (peek's for a custom one).
 */
export function writeCachedThemeVars(
  key: string,
  vars: Record<string, string>
): void {
  const cached = isBuiltInThemeKey(key)
    ? vars
    : themes[defaultTheme].properties;
  try {
    localStorage.setItem(THEME_KEY, key);
    localStorage.setItem(THEME_VARS_KEY, JSON.stringify(cached));
  } catch {
    // Storage full or blocked: the next load paints base.css's defaults
  }
}

/** Set the cached variables on the document root, before the first render */
export function applyCachedTheme(): void {
  const vars = readCachedThemeVars();
  if (!vars) return;
  const root = document.documentElement;
  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(name, value);
  }
}
