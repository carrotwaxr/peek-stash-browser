/**
 * Make the given media queries match, and every other query not.
 *
 * setup.ts stubs `window.matchMedia` so nothing matches (no hover, a fine
 * pointer). This swaps the stub by hand and returns a function that puts the
 * previous one back: spying on setup's mock and restoring the spy would leave
 * it with no implementation.
 */
export const matchMediaQueries = (
  matching: readonly string[]
): (() => void) => {
  const original = window.matchMedia;
  window.matchMedia = (query: string): MediaQueryList => {
    const list = original(query);
    return Object.assign(list, { matches: matching.includes(query) });
  };
  return () => {
    window.matchMedia = original;
  };
};

/** A phone or tablet: no hover, a coarse pointer */
export const TOUCH_QUERIES = ["(hover: none)", "(pointer: coarse)"] as const;

/** A mouse: hover, a fine pointer */
export const MOUSE_QUERIES = ["(hover: hover)", "(pointer: fine)"] as const;
