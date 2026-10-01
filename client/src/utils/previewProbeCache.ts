import { makeCompositeKey } from "./compositeKey";

/** The preview kinds a card probes with a HEAD request before it plays one */
export type ProbedPreviewType = "mp4" | "webp";

/** What the probe found: the preview exists, or the server has none */
export type PreviewProbeResult = "ok" | "missing";

/** Entries kept per preview type; the oldest go first */
export const PREVIEW_PROBE_LIMIT = 500;

const caches: Record<ProbedPreviewType, Map<string, PreviewProbeResult>> = {
  mp4: new Map(),
  webp: new Map(),
};

/**
 * The earlier probe's result for a scene's preview, or undefined when none is
 * known. A grid that remounts its cards (a page change, a scroll back) reads
 * this instead of asking the server again.
 */
export const getPreviewProbe = (
  type: ProbedPreviewType,
  sceneId: string,
  instanceId: string
): PreviewProbeResult | undefined =>
  caches[type].get(makeCompositeKey(sceneId, instanceId));

/** Remember a probe's result; the oldest entry leaves past the limit */
export const setPreviewProbe = (
  type: ProbedPreviewType,
  sceneId: string,
  instanceId: string,
  result: PreviewProbeResult
): void => {
  const cache = caches[type];
  const key = makeCompositeKey(sceneId, instanceId);
  // A rewritten entry counts as the newest
  cache.delete(key);
  cache.set(key, result);
  if (cache.size <= PREVIEW_PROBE_LIMIT) return;
  const oldest = cache.keys().next();
  if (!oldest.done) cache.delete(oldest.value);
};

/** Forget every result (tests start from an empty cache) */
export const clearPreviewProbeCache = (): void => {
  caches.mp4.clear();
  caches.webp.clear();
};
