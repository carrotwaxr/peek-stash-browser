/**
 * Casting for the Scene page's player.
 *
 * Loads Google's Cast sender where Cast can work (`canCast`: a secure Chromium
 * tab), never in TV mode, then the cast chunk, and hands the player
 * to a `CastSessionController`, which adds the Cast button and follows the
 * session, which records the TV's progress while attached
 * (`castActivity.ts`). Each render tells the controller, so a scene change on
 * the page (a queue step, a restart) moves the TV with it. `useVideoPlayer`
 * passes everything the cast features read (the queue and controls are for
 * the queue steps that build on this), so they need no other change to the
 * player hook.
 */
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { sceneMediaLinkQuery } from "../../../api/hooks/useScenes";
import { useTVMode } from "../../../hooks/useTVMode";
import { showError } from "../../../utils/toast";
import type { Viewing } from "../activitySenders";
import type {
  CastPlayer,
  CastScene,
  CastSessionController,
} from "./castSession";
import { canCast } from "./castSupport";

/**
 * The cast code is two lazy chunks, so the Scene chunk stays within its
 * budget and a tab that cannot cast fetches neither: the SDK loader
 * (`castSdk`), requested once `canCast` passes, and the cast UI and session
 * code (`castSession`), once the SDK has resolved a framework.
 * `castMiddleware` stays static, since video.js picks middleware when a
 * source is set. An object, so a test can watch the requests.
 */
export const castChunk = {
  loadSdk: () => import("./castSdk"),
  load: () => import("./castSession"),
};

export interface UseCastOptions {
  playerRef: React.RefObject<unknown>;
  scene: CastScene | null;
  /** The scene as `id:instanceId` */
  sceneKey: string | undefined;
  dispatch: (action: never) => void;
  autoplayNext: boolean;
  repeat: string;
  restartCount: number;
  /**
   * Bumped by each queue step (Next, Previous, a pick, the end of a scene),
   * never by a route change: only a step moves the TV to the page's scene
   */
  queueSteps: number;
  playlist: unknown;
  /** The user's resume point for the scene (watch history), if any */
  resumeTime: number | null | undefined;
  minimumPlayPercent: number;
  /**
   * The scene's viewing (one per scene load, set by `useVideoPlayer`'s
   * tracker effect): the cast tracker sends through it, so a play the local
   * tracker counted is not counted again
   */
  viewing: { readonly current: Viewing | null };
}

export function useCast(options: UseCastOptions): void {
  // Nothing here renders: the compiler's memo cache would only add bytes to
  // the Scene chunk, and the effects declare their own dependencies
  "use no memo";
  const { playerRef } = options;
  const { isTVMode } = useTVMode();
  const queryClient = useQueryClient();

  // The controller outlives renders and reads the page's scene as it is now;
  // it hears each render, so a new scene or a restart reaches the TV
  const latest = useRef(options);
  const live = useRef<CastSessionController | null>(null);
  useEffect(() => {
    latest.current = options;
    live.current?.update();
  });

  useEffect(() => {
    // A TV browser, or one that cannot cast, never contacts Google, and
    // shows no Cast button
    if (isTVMode || !canCast()) return;
    const player = playerRef.current as CastPlayer | null;
    if (!player) return;

    let cancelled = false;
    // Read through a call: after each await, the cleanup may have run
    const isCancelled = () => cancelled;
    let controller: CastSessionController | null = null;

    const start = async () => {
      const { loadCastSdk } = await castChunk.loadSdk();
      if (isCancelled()) return;
      const framework = await loadCastSdk();
      if (isCancelled() || !framework) return;
      const { CastSessionController } = await castChunk.load();
      if (isCancelled() || player.isDisposed()) return;
      const session = new CastSessionController({
        framework,
        player,
        page: () => latest.current,
        fetchLink: (scene, { fresh = false } = {}) => {
          const query = sceneMediaLinkQuery(scene.id, scene.instanceId);
          return queryClient.fetchQuery(
            fresh ? { ...query, staleTime: 0 } : query
          );
        },
        notify: showError,
      });
      session.attach();
      controller = live.current = session;
    };

    start().catch((error: unknown) => {
      // No Cast button on this page; the next page tries again
      console.error("[Cast] could not load the cast code", error);
    });

    return () => {
      cancelled = true;
      controller?.detach();
    };
  }, [isTVMode, playerRef, queryClient]);
}
