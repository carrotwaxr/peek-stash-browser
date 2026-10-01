/**
 * Theme keys. A user's stored theme is one of the built-in keys or
 * `custom-<id>` for one of their own custom themes; anything else is not a
 * theme. The server validates against these and the client types its built-in
 * `themes` map from the same list.
 */

export const BUILT_IN_THEME_KEYS = [
  "peek",
  "light",
  "midnight",
  "deepPurple",
  "theHub",
] as const;

export type BuiltInThemeKey = (typeof BUILT_IN_THEME_KEYS)[number];

const CUSTOM_THEME_PREFIX = "custom-";

export function isBuiltInThemeKey(
  key: string | null | undefined
): key is BuiltInThemeKey {
  return (
    key !== null &&
    key !== undefined &&
    (BUILT_IN_THEME_KEYS as readonly string[]).includes(key)
  );
}

/** The stored key of a custom theme */
export function customThemeKey(id: number): string {
  return `${CUSTOM_THEME_PREFIX}${id}`;
}

/** The id in a `custom-<id>` key, or null when the key is not one */
export function parseCustomThemeKey(
  key: string | null | undefined
): number | null {
  if (key === null || key === undefined) return null;
  if (!key.startsWith(CUSTOM_THEME_PREFIX)) return null;
  const digits = key.slice(CUSTOM_THEME_PREFIX.length);
  if (!/^\d+$/.test(digits)) return null;
  const id = Number(digits);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
