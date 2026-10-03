/**
 * The one way into the VR code. `vrPlugin.ts`, the fork and three.js (about
 * 750 kB) form the lazy `vr` chunk, fetched only by the dynamic import here:
 * on a VR scene page, at the VR click, or earlier through `prefetchVr()` where
 * the browser can enter a headset. Lint refuses a static import of
 * `vrPlugin.ts` or the fork anywhere else.
 */

export interface VrLoader {
  /** Resolves once `peekVr` is registered on video.js. */
  load: () => Promise<void>;
  /** Starts the same load early; a failure is left for the next `load()`. */
  prefetch: () => void;
}

/**
 * One import shared by every caller. A failed import is not kept: the next
 * call tries again (a network blip at prefetch must not break the click).
 */
export function createVrLoader(importer: () => Promise<unknown>): VrLoader {
  let loading: Promise<void> | null = null;
  const load = () => {
    loading ??= importer().then(
      () => undefined,
      (error: unknown) => {
        loading = null;
        throw error;
      }
    );
    return loading;
  };
  return {
    load,
    prefetch: () => {
      load().catch(() => undefined);
    },
  };
}

const loader = createVrLoader(() => import("./vrPlugin"));

export const loadVr = (): Promise<void> => loader.load();

export const prefetchVr = (): void => {
  loader.prefetch();
};
