import {
  type ReactNode,
  type RefObject,
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";

/**
 * Preview slots: how many wall tiles may play a preview at once. A tile that
 * wants to play asks for a slot; it plays only while it holds one. A freed
 * slot goes to the waiting tile that comes first in the document.
 */
export interface PreviewSlotStore {
  /** Tell the store whether a tile wants to play; `element` orders the queue */
  setWanted: (id: string, wanted: boolean, element?: Element | null) => void;
  /** Forget a tile (it unmounted) */
  remove: (id: string) => void;
  has: (id: string) => boolean;
  subscribe: (listener: () => void) => () => void;
}

interface Waiting {
  element: Element | null;
  /** Arrival order, for tiles with no element to compare */
  seq: number;
}

const byDocumentOrder = (
  [, a]: [string, Waiting],
  [, b]: [string, Waiting]
): number => {
  if (a.element && b.element && a.element !== b.element) {
    const position = a.element.compareDocumentPosition(b.element);
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
  }
  return a.seq - b.seq;
};

export const createPreviewSlotStore = (max: number): PreviewSlotStore => {
  const waiting = new Map<string, Waiting>();
  const holders = new Set<string>();
  const listeners = new Set<() => void>();
  let seq = 0;

  // Holders keep their slot while they still want it; free slots go to the
  // waiting tiles in document order
  const assign = (): boolean => {
    let changed = false;
    for (const id of [...holders]) {
      if (!waiting.has(id)) {
        holders.delete(id);
        changed = true;
      }
    }
    if (holders.size < max) {
      const queue = [...waiting].filter(([id]) => !holders.has(id));
      queue.sort(byDocumentOrder);
      for (const [id] of queue) {
        if (holders.size >= max) break;
        holders.add(id);
        changed = true;
      }
    }
    return changed;
  };

  const settle = () => {
    if (assign()) listeners.forEach((listener) => listener());
  };

  return {
    setWanted: (id, wanted, element = null) => {
      if (wanted) {
        const known = waiting.get(id);
        if (known) known.element = element;
        else waiting.set(id, { element, seq: seq++ });
      } else {
        waiting.delete(id);
      }
      settle();
    },
    remove: (id) => {
      waiting.delete(id);
      settle();
    },
    has: (id) => holders.has(id),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

const PreviewSlotContext = createContext<PreviewSlotStore | null>(null);

export const PreviewSlotProvider = ({
  max,
  children,
}: {
  max: number;
  children: ReactNode;
}) => {
  const [store] = useState(() => createPreviewSlotStore(max));
  return createElement(PreviewSlotContext.Provider, { value: store }, children);
};

const noSubscribe = () => () => {};

/**
 * Whether this tile may play now. Without a provider there is no cap and a
 * tile that wants to play plays.
 */
export const usePreviewSlot = (
  id: string,
  wantsToPlay: boolean,
  elementRef?: RefObject<Element | null>
): boolean => {
  const store = useContext(PreviewSlotContext);

  useEffect(() => {
    store?.setWanted(id, wantsToPlay, elementRef?.current);
  }, [store, id, wantsToPlay, elementRef]);

  useEffect(() => () => store?.remove(id), [store, id]);

  const granted = useSyncExternalStore(
    store ? store.subscribe : noSubscribe,
    () => (store ? store.has(id) : false)
  );

  return store ? granted && wantsToPlay : wantsToPlay;
};
