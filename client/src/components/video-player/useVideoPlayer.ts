import { useEffect, useRef } from "react";
import "videojs-seek-buttons";
import "videojs-seek-buttons/dist/videojs-seek-buttons.css";
import videojs from "video.js";
import { apiFetch, apiPost, redirectToLogin } from "../../api";
import { usePlayerHotkeys } from "../../hooks/useMediaKeys";
import { newClientToken } from "../../utils/clientToken";
import { makeCompositeKey } from "../../utils/compositeKey";
import { getSceneTitle } from "../../utils/format";
import { buildPlayerSources } from "./playerSources";
import {
  SESSION_EXPIRED_PLAYBACK_MESSAGE,
  isSessionExpired,
} from "./sessionCheck";
import { setupSubtitles, togglePlaybackRateControl } from "./videoPlayerUtils";
import "./vtt-thumbnails.js";
import "./plugins/big-buttons.js";
import "./plugins/markers.js";
import "./plugins/pause-on-scrub.js";
import "./plugins/persist-volume.js";
import "./plugins/skip-buttons.js";
import "./plugins/source-selector.js";
import "./plugins/track-activity.js";
import "./plugins/vrmode.js";
import "./plugins/media-session.js";

/**
 * Build a scene's stream URL on the scene's own instance
 * @param {string} sceneId - Scene ID
 * @param {string} path - Stream path (e.g., "stream", "stream.m3u8", "proxy-stream/stream.m3u8")
 * @param {string} instanceId - The scene's instance; the server refuses a stream without one
 * @param {Object} params - Additional query parameters
 * @returns {string} The URL's path and query
 */
function buildStreamUrl(
  sceneId: string,
  path: string,
  instanceId: string,
  params: Record<string, string | undefined | null> = {}
) {
  const url = new URL(`/api/scene/${sceneId}/${path}`, window.location.origin);
  url.searchParams.set("instanceId", instanceId);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  });
  return url.pathname + url.search;
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} maxAttempts - Maximum number of attempts (default: 3)
 * @param {number} baseDelay - Base delay in ms (default: 1000)
 * @returns {Promise} Result of the function or throws after all retries
 */
async function retryWithBackoff(
  fn: () => Promise<any>,
  maxAttempts = 3,
  baseDelay = 1000
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;
      if (attempt < maxAttempts) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.warn(
          `[RETRY] Attempt ${attempt} failed, retrying in ${delay}ms...`,
          (error as Error).message
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

/**
 * Quality presets in descending order of resolution
 * Must match the presets defined in TranscodingManager.ts
 */
const QUALITY_PRESETS = [
  { height: 2160, quality: "2160p" },
  { height: 1080, quality: "1080p" },
  { height: 720, quality: "720p" },
  { height: 480, quality: "480p" },
  { height: 360, quality: "360p" },
];

/**
 * Get the best transcode quality for a given source resolution
 * Returns the highest quality preset that is <= source height
 *
 * @param {number} sourceHeight - Height of the source video
 * @returns {string} Quality string (e.g., "1080p", "720p")
 */
function getBestTranscodeQuality(sourceHeight: number): string {
  // Find highest preset <= source resolution
  for (const preset of QUALITY_PRESETS) {
    if (preset.height <= sourceHeight) {
      return preset.quality;
    }
  }
  // Fallback to lowest quality if source is very small
  return "360p";
}

/**
 * Get available quality options for a given source resolution
 * Only includes presets that are <= source height (no upscaling)
 * Always includes "direct" option
 *
 * @param {number} sourceHeight - Height of the source video
 * @returns {Array<{quality: string, height: number}>} Available quality options
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getAvailableQualities(sourceHeight: number) {
  return QUALITY_PRESETS.filter((preset) => preset.height <= sourceHeight);
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
  quality,
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
  updateQuality,
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
  quality: string;
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
  updateQuality: (quality: string) => void;
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

  // Keys video.js's controls stop go to the shortcut dispatcher (stable)
  const hotkeys = usePlayerHotkeys();

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
        sourceSelector: {},
        persistVolume: {},
        bigButtons: {},
        seekButtons: {
          forward: 10,
          back: 10,
        },
        skipButtons: {},
        trackActivity: {},
        mediaSession: {},
        vrMenu: {},
      },
    });

    playerRef.current = player;
    registerPlayer(player as { paused(): boolean });
    player.focus();

    // Volume persistence is now handled by persistVolume plugin
    // Watch history tracking is now handled by the trackActivity plugin

    // Cleanup
    return () => {
      playerRef.current = null;
      registerPlayer(null);

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

  // ============================================================================
  // VTT THUMBNAILS UPDATE (from useVideoPlayerLifecycle)
  // ============================================================================

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !scene?.paths?.vtt || !scene?.paths?.sprite) return;

    const vttPlugin = player.vttThumbnails?.();
    if (vttPlugin) {
      vttPlugin.src(scene.paths.vtt, scene.paths.sprite);
    }
  }, [scene?.paths?.vtt, scene?.paths?.sprite, playerRef]);

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
    if (!player || !sceneId) return;

    const trackActivityPlugin = player.trackActivity();
    if (!trackActivityPlugin) return;

    // Enable tracking
    trackActivityPlugin.setEnabled(true);
    trackActivityPlugin.minimumPlayPercent = minimumPlayPercent;

    // One token per viewing of this scene, the same on every retry of its
    // play-count request: the server counts a token once, so a retry after
    // a lost answer cannot count the play twice
    const playToken = newClientToken();

    // Connect plugin callbacks to API endpoints
    // saveActivity is called periodically (every 10s) during playback, when
    // the scene changes, and when the tab is hidden or the page closes. The
    // last two send with `keepalive`, so the request outlives the page, and
    // once: a retry timer would not.
    trackActivityPlugin.saveActivity = async (
      resumeTime: number,
      playDuration: number,
      options?: { keepalive?: boolean }
    ) => {
      const body = {
        sceneId,
        instanceId: sceneInstanceId,
        resumeTime,
        playDuration,
      };
      try {
        if (options?.keepalive) {
          await apiFetch("/watch-history/save-activity", {
            method: "POST",
            body: JSON.stringify(body),
            keepalive: true,
          });
        } else {
          await retryWithBackoff(() =>
            apiPost("/watch-history/save-activity", body)
          );
        }
      } catch (error) {
        console.error("Failed to save activity:", error);
      }
    };

    // incrementPlayCount is called once per session when threshold is reached
    trackActivityPlugin.incrementPlayCount = async (options?: {
      keepalive?: boolean;
    }) => {
      const body = { sceneId, instanceId: sceneInstanceId, playToken };
      try {
        if (options?.keepalive) {
          await apiFetch("/watch-history/increment-play-count", {
            method: "POST",
            body: JSON.stringify(body),
            keepalive: true,
          });
        } else {
          await retryWithBackoff(() =>
            apiPost("/watch-history/increment-play-count", body)
          );
        }
      } catch (error) {
        console.error("Failed to increment play count:", error);
      }
    };

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
  // AUTO-FALLBACK ERROR HANDLER (set up once per scene)
  // ============================================================================

  const hasFallbackTriggeredRef = useRef(false);
  const isAutoFallbackRef = useRef(false); // Use ref instead of state to avoid re-renders

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !scene) return;

    // Reset fallback flags when scene changes
    hasFallbackTriggeredRef.current = false;
    isAutoFallbackRef.current = false;

    const handleError = async () => {
      const error = player.error();
      if (!error) return;

      // A <video> element cannot see its source's HTTP status, so ask the
      // server once per error. This runs before the auto-fallback, which
      // would otherwise take a 401 on direct play for a codec error.
      if (await isSessionExpired()) {
        redirectToLogin(SESSION_EXPIRED_PLAYBACK_MESSAGE);
        return;
      }

      if (hasFallbackTriggeredRef.current) {
        console.log(
          "[AUTO-FALLBACK] Already triggered for this scene, ignoring"
        );
        return;
      }

      // Only handle codec errors (3 = MEDIA_ERR_DECODE, 4 = MEDIA_ERR_SRC_NOT_SUPPORTED)
      if (error.code !== 3 && error.code !== 4) return;

      // Only auto-fallback if we're currently on direct play
      const currentSrc = player.currentSrc();
      if (!currentSrc || currentSrc.includes(".m3u8")) return; // Already on HLS

      // Determine best transcode quality based on source resolution
      const sourceHeight = scene?.files?.[0]?.height || 1080;
      const bestQuality = getBestTranscodeQuality(sourceHeight);

      console.log(
        `[AUTO-FALLBACK] Codec error detected, falling back to ${bestQuality} transcoding (source: ${sourceHeight}p)`
      );
      hasFallbackTriggeredRef.current = true;
      isAutoFallbackRef.current = true; // Set ref flag (no re-render)

      // Preserve current playback position (exactly like Stash does)
      const currentTime = player.currentTime();

      // Map quality preset to Stash resolution parameter
      const qualityToResolution = {
        "2160p": "FOUR_K",
        "1080p": "FULL_HD",
        "720p": "STANDARD_HD",
        "480p": "STANDARD",
        "360p": "LOW",
      };
      const resolution =
        (qualityToResolution as Record<string, string>)[bestQuality] ||
        "STANDARD_HD";
      const hlsUrl = buildStreamUrl(
        scene.id,
        "proxy-stream/stream.m3u8",
        scene.instanceId,
        { resolution }
      );

      console.log(
        `[AUTO-FALLBACK] Trying next source: '${bestQuality} Transcode'`
      );

      // Configure transcoded playback
      togglePlaybackRateControl(player, false);

      // Switch source exactly like Stash does - no clearing, no resetting
      player.src({
        src: hlsUrl,
        type: "application/x-mpegURL",
      });

      player.load();

      player.one("canplay", () => {
        console.log("[AUTO-FALLBACK] canplay fired, restoring position");
        player.currentTime(currentTime);
        console.log("[AUTO-FALLBACK] Playback started successfully");
        // Update quality in state (quality selector UI) and track for watch history
        dispatch({ type: "SET_QUALITY", payload: bestQuality });
        updateQuality(bestQuality);
        // Clear auto-fallback flag
        isAutoFallbackRef.current = false;
      });

      // Call play() immediately to prevent big play button from showing
      player
        .play()
        .catch((err: any) =>
          console.error("[AUTO-FALLBACK] Play failed:", err)
        );
    };

    player.on("error", handleError);

    return () => {
      player.off("error", handleError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sceneKey captures scene changes; playerRef is a stable ref; adding `scene` object would re-initialize error handler on every render
  }, [sceneKey, playerRef, dispatch]); // Only re-run when scene changes

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

    // Mark this scene as loaded
    prevSceneKeyRef.current = sceneKey ?? null;

    // Set ready=false at START of scene loading (Stash line 572)
    dispatch({ type: "SET_READY", payload: false });

    const isDirectPlay = quality === "direct";
    // const firstFile = scene?.files?.[0]; // Unused - keeping for future use

    // Set poster
    const posterUrl = scene?.paths?.screenshot;
    if (posterUrl) {
      player.poster(posterUrl);
    }

    // Get sourceSelector plugin
    const sourceSelector = player.sourceSelector();

    // Sources are the server's stream paths, used unchanged (Stash's list
    // for this file, as keyless Peek proxy paths)
    const sources = buildPlayerSources(scene);

    // Set sources using sourceSelector plugin
    // Plugin handles source switching, fallback, and playback state preservation
    sourceSelector.setSources(sources);

    // Setup subtitles if available (using sourceSelector for track management)
    if (scene.captions && scene.captions.length > 0) {
      setupSubtitles(player, scene.id, scene.captions, scene.instanceId);
    }

    // Configure player
    togglePlaybackRateControl(player, isDirectPlay);
    if (isDirectPlay) {
      player.playbackRates([0.5, 1, 1.25, 1.5, 2]);
    }

    // Load the source (Stash line 693)
    player.load();
    player.focus();

    // Use player.ready() callback like Stash does (line 696)
    // This ensures player is truly ready to accept commands
    player.ready(() => {
      dispatch({ type: "SET_READY", payload: true });
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneKey, quality]); // Stateless: only scene and quality matter

  // ============================================================================
  // QUALITY SWITCHING (from useVideoPlayerSources)
  // ============================================================================

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

    // Just play - like Stash does
    player.play();

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
