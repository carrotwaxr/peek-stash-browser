import type { ShortcutHandler } from "../contexts/shortcutDispatcher";

// r then 1-5 sets 20/40/60/80/100; r then 0 clears
const RATING_KEYS: ReadonlyArray<readonly [string, number | null]> = [
  ["0", null],
  ["1", 20],
  ["2", 40],
  ["3", 60],
  ["4", 80],
  ["5", 100],
];

/**
 * The keys after `r` (Stash's pattern): 1-5 rate, 0 clears, f toggles the
 * favorite when there is one. For a scope's `sequences: { r: ... }`.
 */
export function ratingSequence(
  setRating: (rating: number | null) => void,
  toggleFavorite?: (() => void) | null
): Record<string, ShortcutHandler> {
  const keys: Record<string, ShortcutHandler> = {};
  for (const [key, rating] of RATING_KEYS) {
    keys[key] = () => setRating(rating);
  }
  if (toggleFavorite) {
    keys["f"] = () => toggleFavorite();
  }
  return keys;
}
