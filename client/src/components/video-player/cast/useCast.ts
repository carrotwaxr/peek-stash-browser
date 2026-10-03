/**
 * Casting for the Scene page's player.
 *
 * Loads Google's Cast sender where Cast can work (`loadCastSdk`: a secure
 * Chromium tab), never in TV mode, then the cast chunk, and hands the player
 * to a `CastSessionController`, which adds the Cast button and follows the
 * session, which records the TV's progress while attached
 * (`castActivity.ts`). `useVideoPlayer` passes everything the cast features
 * read (the queue and controls are for the queue steps that build on this),
 * so they need no other change to the player hook.
 */
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { sceneMediaLinkQuery } from "../../../api/hooks/useScenes";
import { useTVMode } from "../../../hooks/useTVMode";
import { showError } from "../../../utils/toast";
import type { Viewing } from "../activitySenders";
import { addOrderedControl } from "../controlBarOrder";
import { loadCastSdk } from "./castSdk";
import type { CastPlayer, CastScene } from "./castSession";

/**
 * The cast UI and session code are their own chunk, loaded only once the SDK
 * has resolved a framework: a tab that cannot cast never fetches it, and the
 * Scene chunk stays within its budget. `castMiddleware` stays static, since
 * video.js picks middleware when a source is set. An object, so a test can
 * watch the request.
 */
export const castChunk = {
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

  // The controller outlives renders and reads the page's scene as it is now
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  useEffect(() => {
    // A TV browser never contacts Google, and shows no Cast button
    if (isTVMode) return;
    const player = playerRef.current as CastPlayer | null;
    if (!player) return;

    let cancelled = false;
    // Read through a call: after each await, the cleanup may have run
    const isCancelled = () => cancelled;
    let controller: { detach(): void } | null = null;

    const start = async () => {
      const framework = await loadCastSdk();
      if (isCancelled() || !framework) return;
      const { CastSessionController } = await castChunk.load();
      if (isCancelled() || player.isDisposed()) return;
      const session = new CastSessionController({
        framework,
        media: chrome.cast.media,
        player,
        page: () => latest.current,
        fetchLink: (scene) =>
          queryClient.fetchQuery(
            sceneMediaLinkQuery(scene.id, scene.instanceId)
          ),
        notify: showError,
        addOrderedControl,
      });
      session.attach();
      controller = session;
    };

    void start();

    return () => {
      cancelled = true;
      controller?.detach();
    };
  }, [isTVMode, playerRef, queryClient]);
}
