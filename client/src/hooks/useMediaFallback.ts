import { useCallback, useEffect, useRef, useState } from "react";

/** Answers kept; the oldest go first (as `utils/previewProbeCache.ts` does) */
export const MEDIA_PROBE_LIMIT = 500;

/** What a HEAD request found behind an image URL that failed to load */
type MediaKind = "video" | "other";

const probeCache = new Map<string, MediaKind>();

const rememberProbe = (src: string, kind: MediaKind): void => {
  // A rewritten entry counts as the newest
  probeCache.delete(src);
  probeCache.set(src, kind);
  if (probeCache.size <= MEDIA_PROBE_LIMIT) return;
  const oldest = probeCache.keys().next();
  if (!oldest.done) probeCache.delete(oldest.value);
};

/** Forget every answer (tests start from an empty cache) */
export const clearMediaProbeCache = (): void => {
  probeCache.clear();
  inFlight.clear();
};

/** A HEAD request several cards may wait on at once */
interface SharedProbe {
  promise: Promise<MediaKind>;
  controller: AbortController;
  callers: number;
}

const inFlight = new Map<string, SharedProbe>();

/**
 * Join the HEAD request for a src, starting it when none is running. The
 * request is aborted only when every caller has released it; the entry goes
 * when the request settles, and only a completed answer is remembered.
 */
const joinProbe = (
  src: string
): { promise: Promise<MediaKind>; release: () => void } => {
  let shared = inFlight.get(src);
  if (!shared) {
    const controller = new AbortController();
    const entry: SharedProbe = {
      controller,
      callers: 0,
      promise: fetch(src, { method: "HEAD", signal: controller.signal })
        .then((res): MediaKind => {
          const kind: MediaKind = res.headers
            .get("Content-Type")
            ?.startsWith("video/")
            ? "video"
            : "other";
          rememberProbe(src, kind);
          return kind;
        })
        .finally(() => {
          if (inFlight.get(src) === entry) inFlight.delete(src);
        }),
    };
    // Every caller handles the rejection; one that left must not leave it unhandled
    entry.promise.catch(() => {});
    inFlight.set(src, entry);
    shared = entry;
  }
  const probe = shared;
  probe.callers += 1;
  let released = false;
  return {
    promise: probe.promise,
    release: () => {
      if (released) return;
      released = true;
      probe.callers -= 1;
      if (probe.callers > 0) return;
      if (inFlight.get(src) === probe) inFlight.delete(src);
      probe.controller.abort();
    },
  };
};

interface FallbackState {
  /** The src this state belongs to; another src starts over */
  src: string | null | undefined;
  isVideo: boolean;
  hasError: boolean;
}

/**
 * An `<img>` whose file is really a video (tag images imported as .mp4 or
 * .webm) fails to load. `onImageError` asks with one HEAD request what the
 * URL holds: a `video/*` type turns it into a video, anything else is an
 * error. The answer is remembered per src (a grid that remounts its cards
 * does not ask again), a src change or an unmount releases the pending request
 * (aborted once no card waits for it),
 * and a network error is an error that is not remembered. Cards asking about
 * the same src at the same moment share one request.
 */
export const useMediaFallback = (src: string | null | undefined) => {
  const [state, setState] = useState<FallbackState>({
    src,
    isVideo: false,
    hasError: false,
  });
  const releaseRef = useRef<(() => void) | null>(null);

  // A new src's answer starts blank; the old state is never shown for it
  const current =
    state.src === src ? state : { src, isVideo: false, hasError: false };

  useEffect(
    () => () => {
      releaseRef.current?.();
      releaseRef.current = null;
    },
    [src]
  );

  const onImageError = useCallback((): void => {
    const settle = (isVideo: boolean, hasError: boolean) =>
      setState({ src, isVideo, hasError });

    if (!src) {
      settle(false, true);
      return;
    }
    const known = probeCache.get(src);
    if (known) {
      settle(known === "video", known !== "video");
      return;
    }

    releaseRef.current?.();
    const { promise, release } = joinProbe(src);
    let active = true;
    releaseRef.current = () => {
      active = false;
      release();
    };
    promise.then(
      (kind) => {
        if (active) settle(kind === "video", kind !== "video");
      },
      () => {
        // Network error or CORS issue: an error, and worth asking again.
        // An abort means this caller left: nothing to show
        if (active) settle(false, true);
      }
    );
  }, [src]);

  const onVideoError = useCallback((): void => {
    setState({ src, isVideo: true, hasError: true });
  }, [src]);

  return {
    isVideo: current.isVideo,
    hasError: current.hasError,
    onImageError,
    onVideoError,
  };
};
