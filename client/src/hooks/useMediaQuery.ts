import { useSyncExternalStore } from "react";

/** One MediaQueryList per query and the components reading it */
interface QueryStore {
  list: MediaQueryList;
  readers: Set<() => void>;
  onChange: () => void;
}

const stores = new Map<string, QueryStore>();

/** Stable subscribe and snapshot functions for each query */
const accessors = new Map<
  string,
  { subscribe: (notify: () => void) => () => void; snapshot: () => boolean }
>();

const accessorsFor = (query: string) => {
  const known = accessors.get(query);
  if (known) return known;

  const subscribe = (notify: () => void) => {
    let store = stores.get(query);
    if (!store) {
      const list = window.matchMedia(query);
      const readers = new Set<() => void>();
      const onChange = () => readers.forEach((read) => read());
      list.addEventListener("change", onChange);
      store = { list, readers, onChange };
      stores.set(query, store);
    }
    const owner = store;
    owner.readers.add(notify);
    return () => {
      owner.readers.delete(notify);
      if (owner.readers.size > 0) return;
      // The last reader left: nothing listens until one comes back
      owner.list.removeEventListener("change", owner.onChange);
      if (stores.get(query) === owner) stores.delete(query);
    };
  };
  const snapshot = () =>
    (stores.get(query)?.list ?? window.matchMedia(query)).matches;

  const made = { subscribe, snapshot };
  accessors.set(query, made);
  return made;
};

/**
 * Whether a CSS media query matches, with one `change` listener per query
 * however many components read it (a grid of cards reads the same few
 * queries). `useHoverCapable.ts` re-exports it as `useSharedMediaQuery`.
 *
 * @example
 * const isMobile = useMediaQuery("(max-width: 768px)");
 */
export const useMediaQuery = (query: string): boolean => {
  const { subscribe, snapshot } = accessorsFor(query);
  return useSyncExternalStore(subscribe, snapshot);
};
