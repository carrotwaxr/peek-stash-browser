import { useEffect, useRef } from "react";
import "videojs-seek-buttons";
import "videojs-seek-buttons/dist/videojs-seek-buttons.css";
import { useQueryClient } from "@tanstack/react-query";
import videojs from "video.js";
import { redirectToLogin } from "../../api";
import {
  sceneMediaLinkQuery,
  useSceneMediaLink,
} from "../../api/hooks/useScenes";
import { usePlayerHotkeys } from "../../hooks/useMediaKeys";
import { canDecode } from "../../utils/browserPlayback";
import { makeCompositeKey } from "../../utils/compositeKey";
import { getSceneTitle } from "../../utils/format";
import { mayTakeFocus } from "../../utils/pageFocus";
import { type Viewing, createViewing } from "./activitySenders";
import type { CastAwarePlayer } from "./cast/castMiddleware";
import type { CastScene } from "./cast/castSession";
import { useCast } from "./cast/useCast";
import { buildPlayerSources } from "./playerSources";
import type { AirPlayPlayer } from "./plugins/airplay";
import { startAirPlay } from "./plugins/loadAirPlay";
import {
  SESSION_EXPIRED_PLAYBACK_MESSAGE,
  isSessionExpired,
} from "./sessionCheck";
import type { LinkPlayer, LoadedLink } from "./signedLink";
import { setupSubtitles } from "./videoPlayerUtils";
import { type VrModeScene, useVrMode } from "./vr/useVrMode";
import "./vtt-thumbnails.js";
import "./plugins/big-buttons.js";
import "./plugins/markers.js";
import "./plugins/pause-on-scrub.js";
import "./plugins/persist-volume.js";
import "./plugins/skip-buttons.js";
import "./plugins/source-selector.js";
import "./plugins/track-activity.js";
import "./plugins/media-session.js";

/**
 * Focus the player, so its keys work, unless the user has moved focus to
 * another control since the page or scene change began, `start` being what
 * had focus then (see `mayTakeFocus`)
 */
function focusPlayer(
  player: { el(): Element; focus(): void },
  start: Element | null
) {
  if (mayTakeFocus(player.el(), start)) player.focus();
}

/**
 * useVideoPlayer
 *
 * Consolidated hook that manages all Video.js player operations.
 * Combines logic from useVideoPlayerLifecycle, useVideoPlayerSources,
 * useResumePlayback, and usePlaylistPlayer.
 *
 * Uses context actions and dispatch instead of individual setters.
 */
export function useVideoPlayer({
  videoRef,
  playerRef,
  scene,
  ready,
  shouldAutoplay,
  playlist,
  currentIndex,
  autoplayNext,
  repeat,
  restartCount,
  dispatch,
  nextScene,
  prevScene,
  registerPlayer,
  location,
  hasResumedRef,
  initialResumeTimeRef,
  watchHistory,
  loadingWatchHistory,
  minimumPlayPercent = 20,
}: {
  videoRef: React.RefObject<HTMLDivElement | null>;
  playerRef: React.RefObject<any>;
  scene: any;
  ready: boolean;
  shouldAutoplay: boolean;
  playlist: any;
  currentIndex: number;
  /** The player's controls (the context's), never the queue's */
  autoplayNext: boolean;
  repeat: string;
  /** Bumped by a queue step to an entry of the scene already loaded */
  restartCount: number;
  dispatch: (action: any) => void;
  /** The queue's steps (`useQueueNavigation`), which know what is playing */
  nextScene: () => void;
  prevScene: () => void;
  /** Tells the player context which player this is (null: it is gone) */
  registerPlayer: (player: { paused(): boolean } | null) => void;
  location: any;
  hasResumedRef: React.RefObject<boolean>;
  initialResumeTimeRef: React.RefObject<number | null>;
  watchHistory: any;
  loadingWatchHistory: boolean;
  minimumPlayPercent?: number;
}) {
  // The scene's id with its instance: two servers reuse small ids, so
  // A:123 and B:123 are different scenes and moving between them is a
  // scene change for every effect below
  const { id: sceneId, instanceId: sceneInstanceId } = (scene ?? {}) as {
    id?: string;
    instanceId?: string;
  };
  const sceneKey = sceneId
    ? makeCompositeKey(sceneId, sceneInstanceId)
    : undefined;

  // Track previous scene for detecting changes
  const prevSceneKeyRef = useRef<string | null>(null);

  // The scene's one viewing, shared by the local and the cast tracker
  const viewingRef = useRef<Viewing | null>(null);

  // Safari plays the signed media link's Direct and HLS (so AirPlay can take
  // the stream over); the sources wait for the link, or its error. The flag,
  // not the data, drives the sources effect: the hourly renewal reloads
  // nothing.
  const queryClient = useQueryClient();
  const safari = videojs.browser.IS_SAFARI;
  const link = useSceneMediaLink(sceneId ?? "", sceneInstanceId ?? "", {
    enabled: safari,
  });
  const linkSettled = !safari || link.isSuccess || link.isError;
  // What the loaded sources were built from, for the expired-link refetch
  const loadedLinkRef = useRef<LoadedLink | null>(null);

  // Keys video.js's controls stop go to the shortcut dispatcher (stable)
  const hotkeys = usePlayerHotkeys();

  // What had focus when the page opened or the route last changed (a scene
  // change begins with its URL, before the scene lands): the player may take
  // focus from it, the control that started the change. Recorded before the
  // effects below run, by declaration order. The route, not the history
  // key: the queue's controls rewrite the entry at the same URL, and a
  // control the user toggles while a scene loads starts no change.
  const focusAtStartRef = useRef<Element | null>(null);
  const { pathname, search } = location as {
    pathname?: string;
    search?: string;
  };
  const route = `${pathname ?? ""}${search ?? ""}`;
  useEffect(() => {
    focusAtStartRef.current = document.activeElement;
  }, [route]);

  // ============================================================================
  // PLAYER INITIALIZATION (from useVideoPlayerLifecycle)
  // ============================================================================

  useEffect(() => {
    const container = videoRef.current;
    if (!container) {
      return;
    }

    // Create video element programmatically (not managed by React)
    const videoElement = document.createElement("video-js");
    videoElement.setAttribute("data-vjs-player", "true");
    videoElement.setAttribute("crossorigin", "anonymous");
    videoElement.classList.add("vjs-big-play-centered");

    // Append to container before initialization
    container.appendChild(videoElement);

    const renewExpiredLink = async () => {
      const loaded = loadedLinkRef.current;
      if (!loaded || Date.now() < Date.parse(loaded.expiresAt)) return false;
      const { id, instanceId } = loaded.scene as {
        id: string;
        instanceId: string;
      };
      const { renewSignedLink } = await import("./signedLink");
      return renewSignedLink(
        playerRef.current as LinkPlayer | null,
        loaded,
        () =>
          queryClient.fetchQuery({
            ...sceneMediaLinkQuery(id, instanceId),
            staleTime: 0,
          }),
        (streams) =>
          buildPlayerSources(
            loaded.scene as Parameters<typeof buildPlayerSources>[0],
            canDecode,
            streams
          ),
        () => loadedLinkRef.current === loaded
      );
    };

    // Initialize Video.js (matching Stash configuration)
    const player = videojs(videoElement, {
      autoplay: false,
      controls: true,
      controlBar: {
        pictureInPictureToggle: false,
        volumePanel: {
          inline: false, // Popup menu like Stash/YouTube
        },
        chaptersButton: false,
      },
      responsive: true,
      fluid: true,
      preload: "none",
      liveui: false,
      playsinline: true,
      playbackRates: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
      inactivityTimeout: 2000,
      userActions: { hotkeys },
      techOrder: ["html5"],
      html5: {
        vhs: {
          overrideNative: !videojs.browser.IS_SAFARI,
          enableLowInitialPlaylist: false,
          smoothQualityChange: true,
          useBandwidthFromLocalStorage: true,
          limitRenditionByPlayerDimensions: true,
          useDevicePixelRatio: true,
        },
        nativeAudioTracks: false,
        nativeVideoTracks: false,
      },
      plugins: {
        vttThumbnails: {
          showTimestamp: true,
          spriteUrl: scene?.paths?.sprite || null,
        },
        markers: {},
        pauseOnScrub: {},
        // The one fallback path: a source that fails moves to the next.
        // A <video> element cannot see its source's HTTP status, so the
        // server is asked first: a lost session goes to login instead.
        sourceSelector: {
          beforeFallback: async () => {
            // A signed source that fails to load after its link ran out
            // (a <video> cannot see the 401): sign it again, and the
            // selector retries the same source at the same time
            if (await renewExpiredLink()) return false;
            if (!(await isSessionExpired())) return false;
            redirectToLogin(SESSION_EXPIRED_PLAYBACK_MESSAGE);
            return true;
          },
        },
        persistVolume: {},
        bigButtons: {},
        seekButtons: {
          forward: 10,
          back: 10,
        },
        skipButtons: {},
        trackActivity: {},
        mediaSession: {},
      },
    });

    playerRef.current = player;
    registerPlayer(player as { paused(): boolean });
    focusPlayer(
      player as { el(): Element; focus(): void },
      focusAtStartRef.current
    );

    // Safari's AirPlay button (and the attribute on the tech's <video>),
    // whose code loads only in Safari
    const stopAirPlay = startAirPlay(player as AirPlayPlayer);

    // Volume persistence is now handled by persistVolume plugin
    // Watch history tracking is now handled by the trackActivity plugin

    // Cleanup
    return () => {
      playerRef.current = null;
      registerPlayer(null);
      stopAirPlay();

      try {
        player.dispose();
      } catch (error) {
        console.error("[LIFECYCLE] Disposal error:", error);
      }

      if (videoElement.parentNode) {
        videoElement.remove();
      }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The VR button and projection menu (after the player exists: its effects
  // run once the effect above has made it), and the headset HUD's queue
  // steps and favourite
  useVrMode({
    playerRef,
    scene: scene as VrModeScene | null | undefined,
    sceneKey,
    nextScene,
    prevScene,
    queueLength:
      (playlist as { scenes?: unknown[] } | null)?.scenes?.length ?? 0,
    dispatch,
  });

  // ============================================================================
  // CASTING (after the player exists: its effect reads the player)
  // ============================================================================

  useCast({
    playerRef,
    scene: scene as CastScene | null,
    sceneKey,
    dispatch,
    autoplayNext,
    repeat,
    restartCount,
    playlist,
    // The user's resume point for the scene, where a cast starts when the
    // local player has not played (not the Continue Watching resume)
    resumeTime:
      (watchHistory as { resumeTime?: number | null } | null)?.resumeTime ??
      null,
    minimumPlayPercent,
    viewing: viewingRef,
  });

  // ============================================================================
  // VTT THUMBNAILS UPDATE (from useVideoPlayerLifecycle)
  // ============================================================================

  const vttUrl = scene?.paths?.vtt as string | undefined;
  const spriteUrl = scene?.paths?.sprite as string | undefined;

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const vttPlugin = player.vttThumbnails?.() as
      | { src(vtt: string, sprite: string): void; detach(): void }
      | undefined;
    if (!vttPlugin) return;

    // A scene with no sprite shows no previews, not the last scene's
    if (!vttUrl || !spriteUrl) {
      vttPlugin.detach();
      return;
    }
    vttPlugin.src(vttUrl, spriteUrl);
  }, [vttUrl, spriteUrl, playerRef]);

  // ============================================================================
  // MEDIA SESSION METADATA (OS media controls - title, artist, poster)
  // ============================================================================

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !scene) return;

    const mediaSessionPlugin = player.mediaSession?.();
    if (!mediaSessionPlugin) return;

    // Build performer string from scene performers
    const performers =
      scene.performers?.map((p: any) => p.name).join(", ") || "";

    // Set metadata for OS media controls
    mediaSessionPlugin.setMetadata(
      getSceneTitle(scene),
      performers,
      scene.paths?.screenshot || ""
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps list all accessed scene properties individually; adding `scene` object would cause re-runs on every render
  }, [
    sceneKey,
    scene?.title,
    scene?.performers,
    scene?.paths?.screenshot,
    playerRef,
  ]);

  // ============================================================================
  // TRACK ACTIVITY PLUGIN (Stash pattern - integrates with watch history)
  // ============================================================================

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !sceneId || !sceneInstanceId) return;

    const trackActivityPlugin = player.trackActivity();
    if (!trackActivityPlugin) return;

    // One viewing of this scene, for this tracker and the cast tracker: its
    // play-count token is the same on every retry and the play counts once,
    // whichever tracker reaches the threshold. Saves go every 10 s during
    // playback, at a scene change, and with `keepalive` when the tab is
    // hidden or the page closes.
    const viewing = createViewing(sceneId, sceneInstanceId);
    viewingRef.current = viewing;
    trackActivityPlugin.saveActivity = viewing.save;
    trackActivityPlugin.incrementPlayCount = viewing.countPlay;
    trackActivityPlugin.minimumPlayPercent = minimumPlayPercent;
    // Off while a cast is attached: the cast tracker records the TV
    trackActivityPlugin.setEnabled(
      !(player as CastAwarePlayer).peekCastConnected
    );

    return () => {
      trackActivityPlugin.setEnabled(false);
      trackActivityPlugin.reset();
    };
    // Keyed on the scene's id and instance together: A:123 and B:123 are
    // different scenes
  }, [sceneId, sceneInstanceId, playerRef, minimumPlayPercent]);

  // ============================================================================
  // ASPECT RATIO UPDATES (fix layout when switching scenes)
  // ============================================================================

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !scene) return;

    const firstFile = scene?.files?.[0];
    if (!firstFile?.width || !firstFile?.height) return;

    // Set Video.js's internal aspect ratio directly
    // This ensures proper layout before metadata loads
    const aspectRatio = `${firstFile.width}:${firstFile.height}`;
    player.aspectRatio(aspectRatio);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sceneKey captures scene changes; adding `scene` object would re-run aspect ratio setup on every render
  }, [sceneKey, playerRef]);

  // ============================================================================
  // RESUME PLAYBACK CAPTURE (from useResumePlayback)
  // ============================================================================

  // Reset resume state when scene changes
  useEffect(() => {
    hasResumedRef.current = false;
    initialResumeTimeRef.current = null;
  }, [sceneKey, hasResumedRef, initialResumeTimeRef]);

  // Capture resume time and set autoplay flag when watch history loads
  useEffect(() => {
    const shouldResume = location.state?.shouldResume;

    if (
      shouldResume &&
      initialResumeTimeRef.current === null &&
      !loadingWatchHistory &&
      watchHistory?.resumeTime > 0
    ) {
      initialResumeTimeRef.current = watchHistory.resumeTime;
      dispatch({ type: "SET_SHOULD_AUTOPLAY", payload: true });
    }
  }, [
    loadingWatchHistory,
    watchHistory,
    location.state,
    initialResumeTimeRef,
    dispatch,
  ]);

  // ============================================================================
  // VIDEO SOURCES LOADING (using sourceSelector plugin - Stash pattern)
  // ============================================================================

  useEffect(() => {
    const player = playerRef.current;

    // Guard: Need player and scene
    if (!player || !scene) {
      return;
    }

    // Don't re-initialize unless scene has changed (Stash line 568)
    if (sceneKey === prevSceneKeyRef.current) {
      return;
    }

    // Safari waits for the link (or its error) before the sources are set;
    // until then the last scene's ready flag must not autoplay
    if (!linkSettled) {
      dispatch({ type: "SET_READY", payload: false });
      return;
    }

    // Mark this scene as loaded
    prevSceneKeyRef.current = sceneKey ?? null;

    // Set ready=false at START of scene loading (Stash line 572)
    dispatch({ type: "SET_READY", payload: false });

    // Set poster
    const posterUrl = scene?.paths?.screenshot;
    if (posterUrl) {
      player.poster(posterUrl);
    }

    // Get sourceSelector plugin
    const sourceSelector = player.sourceSelector();

    // Sources are the server's stream paths (Stash's list for this file, as
    // keyless Peek proxy paths), with Direct and MKV after the transcodes
    // when this browser cannot decode the file
    const streams = link.data?.streams;
    const sources = buildPlayerSources(scene, canDecode, streams);
    loadedLinkRef.current =
      safari && link.data ? { scene, expiresAt: link.data.expiresAt } : null;

    // The plugin loads the first, falls back through the rest and shows the
    // rate menu only on Direct and MKV
    sourceSelector.setSources(sources);

    // Setup subtitles if available (using sourceSelector for track management)
    if (scene.captions && scene.captions.length > 0) {
      setupSubtitles(player, scene.id, scene.captions, scene.instanceId);
    }

    // The rates the menu offers where it shows (Direct and MKV)
    player.playbackRates([0.5, 1, 1.25, 1.5, 2]);

    // Load the source (Stash line 693)
    player.load();
    focusPlayer(
      player as { el(): Element; focus(): void },
      focusAtStartRef.current
    );

    // Use player.ready() callback like Stash does (line 696)
    // This ensures player is truly ready to accept commands
    player.ready(() => {
      dispatch({ type: "SET_READY", payload: true });
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneKey, linkSettled]); // Only the scene, and a Safari link settling

  // ============================================================================
  // RESTART (a queue step to an entry of the same scene)
  // ============================================================================

  // Nothing loads again for a duplicate entry, or a one-scene queue on
  // repeat all: start the scene over (the autoplay effect below plays it)
  const seenRestartRef = useRef(restartCount);
  useEffect(() => {
    if (restartCount === seenRestartRef.current) return;
    seenRestartRef.current = restartCount;
    const player = playerRef.current as {
      isDisposed(): boolean;
      currentTime(seconds: number): void;
    } | null;
    if (!player || player.isDisposed()) return;
    player.currentTime(0);
  }, [restartCount, playerRef]);

  // ============================================================================
  // AUTOPLAY AND RESUME (Stash pattern - simple and clean)
  // ============================================================================

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !ready || !shouldAutoplay) return;

    const shouldResume = location.state?.shouldResume;
    const resumeTime = initialResumeTimeRef.current;

    // While casting, the load on the receiver plays the scene there (and a
    // session playing another scene is not taken over by an autoplay)
    if (!(player as CastAwarePlayer).peekCastRemote) {
      // Handle resume playback before starting
      if (
        shouldResume &&
        !hasResumedRef.current &&
        resumeTime != null &&
        resumeTime > 0
      ) {
        hasResumedRef.current = true;
        player.currentTime(resumeTime);
      }

      // A browser that blocks autoplay with sound may still play it muted
      player.play()?.catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "NotAllowedError") {
          player.muted(true);
          void player.play()?.catch(() => {});
        }
      });
    }

    // Clear autoplay flag
    dispatch({ type: "SET_SHOULD_AUTOPLAY", payload: false });
  }, [
    ready,
    shouldAutoplay,
    location.state,
    initialResumeTimeRef,
    hasResumedRef,
    playerRef,
    dispatch,
  ]);

  // ============================================================================
  // PLAYLIST NAVIGATION: the end of a video and the skip buttons
  // ============================================================================

  // At the end of a video: repeat one replays it; otherwise, with autoplay
  // on, the queue steps on through the reducer's one advance path (which
  // owns shuffle, its history and repeat all)
  useEffect(() => {
    const player = playerRef.current;

    if (!player || player.isDisposed?.()) {
      return;
    }

    const handleEnded = () => {
      if (repeat === "one") {
        player.currentTime(0);
        player
          .play()
          .catch((err: unknown) => console.error("Repeat play failed:", err));
        return;
      }

      if (!autoplayNext) {
        return;
      }

      dispatch({ type: "NEXT_SCENE", payload: { autoplay: true } });
    };

    player.on("ended", handleEnded);

    return () => {
      if (!player.isDisposed()) {
        player.off("ended", handleEnded);
      }
    };
  }, [playerRef, autoplayNext, repeat, dispatch]);

  // Configure skipButtons plugin for playlist navigation (Stash pattern)
  useEffect(() => {
    const player = playerRef.current;

    if (!player || player.isDisposed?.()) {
      return;
    }

    const skipButtonsPlugin = player.skipButtons();

    // Set handlers based on playlist availability
    if (playlist && playlist.scenes && playlist.scenes.length > 1) {
      skipButtonsPlugin.setForwardHandler(nextScene);
      skipButtonsPlugin.setBackwardHandler(prevScene);
    } else {
      // Clear handlers if no playlist or single scene
      skipButtonsPlugin.setForwardHandler(undefined);
      skipButtonsPlugin.setBackwardHandler(undefined);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, playlist]);
}
