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

/** A media query list a test can flip, counting the listeners on it */
interface FakeQuery {
  list: MediaQueryList;
  listeners: Set<(event: MediaQueryListEvent) => void>;
  matches: boolean;
}

/**
 * Replace `window.matchMedia` with one stable list per query that a test can
 * flip: `set` changes `matches` and fires `change` on its listeners, the way
 * a browser does when a phone turns. `listenerCount` is what is attached now.
 */
export const controlMatchMedia = (matching: readonly string[] = []) => {
  const original = window.matchMedia;
  const queries = new Map<string, FakeQuery>();

  const queryFor = (query: string): FakeQuery => {
    const known = queries.get(query);
    if (known) return known;
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    const made: FakeQuery = {
      listeners,
      matches: matching.includes(query),
      list: {
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => true,
        addEventListener: (type: string, handler: unknown) => {
          if (type === "change")
            listeners.add(handler as (event: MediaQueryListEvent) => void);
        },
        removeEventListener: (type: string, handler: unknown) => {
          if (type === "change")
            listeners.delete(handler as (event: MediaQueryListEvent) => void);
        },
      } as unknown as MediaQueryList,
    };
    Object.defineProperty(made.list, "matches", { get: () => made.matches });
    queries.set(query, made);
    return made;
  };

  window.matchMedia = (query: string) => queryFor(query).list;

  return {
    set: (query: string, matches: boolean) => {
      const target = queryFor(query);
      target.matches = matches;
      target.listeners.forEach((listener) =>
        listener({ matches, media: query } as MediaQueryListEvent)
      );
    },
    listenerCount: (query: string) => queryFor(query).listeners.size,
    restore: () => {
      window.matchMedia = original;
    },
  };
};
