import { useCallback, useEffect, useRef } from "react";
import airplay from "@silvermine/videojs-airplay";
import "@silvermine/videojs-airplay/dist/silvermine-videojs-airplay.css";
import chromecast from "@silvermine/videojs-chromecast";
import "@silvermine/videojs-chromecast/dist/silvermine-videojs-chromecast.css";
import "videojs-seek-buttons";
import "videojs-seek-buttons/dist/videojs-seek-buttons.css";
import axios from "axios";
import videojs from "video.js";
import { apiPost } from "../../services/api.js";
import { getSceneTitle } from "../../utils/format.js";
import { setupSubtitles, togglePlaybackRateControl } from "./videoPlayerUtils.js";
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

// Register Video.js plugins
airplay(videojs);
chromecast(videojs);

/**
 * Build video stream URL with optional instanceId for multi-instance support
 * @param {string} sceneId - Scene ID
 * @param {string} path - Stream path (e.g., "stream", "stream.m3u8", "proxy-stream/stream.m3u8")
 * @param {string|null} instanceId - Optional instance ID for disambiguation
 * @param {Object} params - Additional query parameters
 * @returns {string} Full URL with instanceId if provided
 */
function buildStreamUrl(sceneId, path, instanceId, params = {}) {
  const url = new URL(`/api/scene/${sceneId}/${path}`, window.location.origin);
  if (instanceId) {
    url.searchParams.set('instanceId', instanceId);
  }
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
async function retryWithBackoff(fn, maxAttempts = 3, baseDelay = 1000) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.warn(`[RETRY] Attempt ${attempt} failed, retrying in ${delay}ms...`, error.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

const _api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

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
function getBestTranscodeQuality(sourceHeight) {
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
// eslint-disable-next-line no-unused-vars
function getAvailableQualities(sourceHeight) {
  return QUALITY_PRESETS.filter(preset => preset.height <= sourceHeight);
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
  isAutoFallback, // eslint-disable-line no-unused-vars
  ready,
  shouldAutoplay,
  playlist,
  currentIndex,
  dispatch,
  nextScene,
  prevScene,
  updateQuality,
  location,
  hasResumedRef,
  initialResumeTimeRef,
  watchHistory,
  loadingWatchHistory,
  enableCast = true,
}) {
  // Track previous scene for detecting changes
  const prevSceneIdRef = useRef(null);

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
      techOrder: enableCast ? ["chromecast", "html5"] : ["html5"],
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
        ...(enableCast && { airPlay: {} }),
        ...(enableCast && { chromecast: {} }),
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
    player.focus();

    // Volume persistence is now handled by persistVolume plugin
    // Watch history tracking is now handled by the trackActivity plugin

    // Cleanup
    return () => {
      playerRef.current = null;

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
    const performers = scene.performers?.map((p) => p.name).join(", ") || "";

    // Set metadata for OS media controls
    mediaSessionPlugin.setMetadata(
      getSceneTitle(scene),
      performers,
      scene.paths?.screenshot || ""
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps list all accessed scene properties individually; adding `scene` object would cause re-runs on every render
  }, [scene?.id, scene?.title, scene?.performers, scene?.paths?.screenshot, playerRef]);

  // ============================================================================
  // TRACK ACTIVITY PLUGIN (Stash pattern - integrates with watch history)
  // ============================================================================

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !scene?.id) return;

    const trackActivityPlugin = player.trackActivity();
    if (!trackActivityPlugin) return;

    const sceneId = scene.id;

    // Enable tracking
    trackActivityPlugin.setEnabled(true);
    trackActivityPlugin.minimumPlayPercent = 10; // Match Stash's 10% threshold

    // Connect plugin callbacks to API endpoints
    // saveActivity is called periodically (every 10s) during playback
    trackActivityPlugin.saveActivity = async (resumeTime, playDuration) => {
      try {
        await retryWithBackoff(() =>
          apiPost("/watch-history/save-activity", {
            sceneId,
            resumeTime,
            playDuration,
          })
        );
      } catch (error) {
        console.error("Failed to save activity after 3 attempts:", error);
      }
    };

    // incrementPlayCount is called once per session when threshold is reached
    trackActivityPlugin.incrementPlayCount = async () => {
      try {
        await retryWithBackoff(() =>
          apiPost("/watch-history/increment-play-count", { sceneId })
        );
      } catch (error) {
        console.error("Failed to increment play count after 3 attempts:", error);
      }
    };

    return () => {
      trackActivityPlugin.setEnabled(false);
      trackActivityPlugin.reset();
    };
  }, [scene?.id, playerRef]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scene?.id captures scene changes; adding `scene` object would re-run aspect ratio setup on every render
  }, [scene?.id, playerRef]);

  // ============================================================================
  // RESUME PLAYBACK CAPTURE (from useResumePlayback)
  // ============================================================================

  // Reset resume state when scene changes
  useEffect(() => {
    hasResumedRef.current = false;
    initialResumeTimeRef.current = null;
  }, [scene?.id, hasResumedRef, initialResumeTimeRef]);

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
      if (hasFallbackTriggeredRef.current) {
        console.log("[AUTO-FALLBACK] Already triggered for this scene, ignoring");
        return;
      }

      const error = player.error();
      if (!error) return;

      // Only handle codec errors (3 = MEDIA_ERR_DECODE, 4 = MEDIA_ERR_SRC_NOT_SUPPORTED)
      if (error.code !== 3 && error.code !== 4) return;

      // Only auto-fallback if we're currently on direct play
      const currentSrc = player.currentSrc();
      if (!currentSrc || currentSrc.includes('.m3u8')) return;  // Already on HLS

      // Determine best transcode quality based on source resolution
      const sourceHeight = scene?.files?.[0]?.height || 1080;
      const bestQuality = getBestTranscodeQuality(sourceHeight);

      console.log(`[AUTO-FALLBACK] Codec error detected, falling back to ${bestQuality} transcoding (source: ${sourceHeight}p)`);
      hasFallbackTriggeredRef.current = true;
      isAutoFallbackRef.current = true; // Set ref flag (no re-render)

      // Preserve current playback position (exactly like Stash does)
      const currentTime = player.currentTime();

      // Map quality preset to Stash resolution parameter
      const qualityToResolution = {
        '2160p': 'FOUR_K',
        '1080p': 'FULL_HD',
        '720p': 'STANDARD_HD',
        '480p': 'STANDARD',
        '360p': 'LOW',
      };
      const resolution = qualityToResolution[bestQuality] || 'STANDARD_HD';
      const hlsUrl = buildStreamUrl(scene.id, 'proxy-stream/stream.m3u8', scene.instanceId, { resolution });

      console.log(`[AUTO-FALLBACK] Trying next source: '${bestQuality} Transcode'`);

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
      player.play().catch((err) => console.error("[AUTO-FALLBACK] Play failed:", err));
    };

    player.on("error", handleError);

    return () => {
      player.off("error", handleError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scene?.id captures scene changes; playerRef is a stable ref; adding `scene` object would re-initialize error handler on every render
  }, [scene?.id, playerRef, dispatch]); // Only re-run when scene changes

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
    if (scene.id === prevSceneIdRef.current) {
      return;
    }

    // Mark this scene as loaded
    prevSceneIdRef.current = scene.id;

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

    // Build sources array from scene.sceneStreams (Stash pattern)
    // sceneStreams contains ALL available stream formats from Stash:
    // - Direct stream (original file)
    // - HLS transcodes (various resolutions)
    // - MP4/WEBM/DASH transcodes (if configured in Stash)
    let sources = [];

    if (scene.sceneStreams && scene.sceneStreams.length > 0) {
      // Get video duration from first file (needed for HLS transcodes to show correct duration)
      const duration = scene.files?.[0]?.duration || undefined;

      // Helper to check if stream is Direct (not transcoded)
      const isDirect = (url) => {
        return (
          url.pathname.endsWith('/stream') ||
          url.pathname.endsWith('/stream.mpd') ||
          url.pathname.endsWith('/stream.m3u8')
        );
      };

      // Rewrite Stash URLs to use Peek's proxy
      sources = scene.sceneStreams.map((stream) => {
        try {
          const url = new URL(stream.url);

          // Extract path after /scene/{id}/
          // e.g., "stream.m3u8" from "http://stash:9999/scene/123/stream.m3u8?resolution=STANDARD_HD"
          const pathParts = url.pathname.split(`/scene/${scene.id}/`);
          const streamPath = pathParts[1] || 'stream'; // "stream.m3u8" or "stream"

          // Strip apikey from query params (security: don't expose Stash API key to client)
          url.searchParams.delete('apikey');
          url.searchParams.delete('ApiKey');
          url.searchParams.delete('APIKEY');
          // Add instanceId for multi-instance support
          if (scene.instanceId) {
            url.searchParams.set('instanceId', scene.instanceId);
          }
          const queryString = url.search; // "?resolution=STANDARD_HD&instanceId=..." or ""

          // Rewrite to Peek's proxy endpoint
          const proxiedUrl = `/api/scene/${scene.id}/proxy-stream/${streamPath}${queryString}`;

          return {
            src: proxiedUrl,
            type: stream.mime_type || undefined,
            label: stream.label || undefined,
            offset: !isDirect(url), // Transcoded streams need time offset correction
            duration, // Total video duration (fixes HLS duration incrementing)
          };
        } catch (error) {
          console.error('[VideoPlayer] Error parsing stream URL:', stream.url, error);
          return null;
        }
      }).filter(Boolean); // Remove any null entries from errors
    } else {
      console.warn('[VideoPlayer] No sceneStreams available, falling back to legacy Direct stream');
      // Fallback: Use legacy Direct stream if sceneStreams not available
      // This maintains backward compatibility during transition
      const directUrl = buildStreamUrl(scene.id, 'stream', scene.instanceId);
      sources.push({
        src: directUrl,
        label: "Direct",
      });
    }

    // Set sources using sourceSelector plugin
    // Plugin handles source switching, fallback, and playback state preservation
    sourceSelector.setSources(sources);

    // Setup subtitles if available (using sourceSelector for track management)
    if (scene.captions && scene.captions.length > 0) {
      setupSubtitles(player, scene.id, scene.captions);
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

    dispatch({ type: "SET_INITIALIZING", payload: false });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene?.id, quality]); // Stateless: only scene and quality matter

  // ============================================================================
  // QUALITY SWITCHING (from useVideoPlayerSources)
  // ============================================================================

  // ============================================================================
  // AUTOPLAY AND RESUME (Stash pattern - simple and clean)
  // ============================================================================

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !ready || !shouldAutoplay) return;

    const shouldResume = location.state?.shouldResume;
    const resumeTime = initialResumeTimeRef.current;

    // Handle resume playback before starting
    if (shouldResume && !hasResumedRef.current && resumeTime > 0) {
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
  // PLAYLIST NAVIGATION (from usePlaylistPlayer)
  // ============================================================================

  // Navigate to previous scene, preserving autoplay state if playing
  const playPreviousInPlaylist = useCallback(() => {
    const player = playerRef.current;
    if (player && !player.paused()) {
      dispatch({ type: "SET_SHOULD_AUTOPLAY", payload: true });
    }
    prevScene();
  }, [playerRef, prevScene, dispatch]);

  // Navigate to next scene, preserving autoplay state if playing
  const playNextInPlaylist = useCallback(() => {
    const player = playerRef.current;
    if (player && !player.paused()) {
      dispatch({ type: "SET_SHOULD_AUTOPLAY", payload: true });
    }
    nextScene();
  }, [playerRef, nextScene, dispatch]);

  // Auto-play next video when current video ends (respects shuffle/repeat/autoplayNext)
  useEffect(() => {
    const player = playerRef.current;

    if (!player || player.isDisposed?.() || !playlist || !playlist.scenes) {
      return;
    }

    const handleEnded = () => {
      // Repeat One: replay current scene
      if (playlist.repeat === "one") {
        player.currentTime(0);
        player.play().catch((err) => console.error("Repeat play failed:", err));
        return;
      }

      // Autoplay Next is OFF: stop playback
      if (!playlist.autoplayNext) {
        return;
      }

      // Determine next scene index
      let nextIndex = null;

      if (playlist.shuffle) {
        // Shuffle mode: pick random unplayed scene
        const totalScenes = playlist.scenes.length;
        const unplayedScenes = [];

        for (let i = 0; i < totalScenes; i++) {
          if (i !== currentIndex && !playlist.shuffleHistory.includes(i)) {
            unplayedScenes.push(i);
          }
        }

        if (unplayedScenes.length > 0) {
          // Pick random from unplayed
          nextIndex =
            unplayedScenes[Math.floor(Math.random() * unplayedScenes.length)];
        } else if (playlist.repeat === "all") {
          // All scenes played, reset shuffle history and start over
          dispatch({ type: "SET_SHUFFLE_HISTORY", payload: [] });
          // Pick random scene (excluding current)
          const candidates = Array.from({ length: totalScenes }, (_, i) => i).filter(
            (i) => i !== currentIndex
          );
          nextIndex = candidates[Math.floor(Math.random() * candidates.length)];
        }
        // else: no more scenes and repeat is not "all", stop playback
      } else {
        // Sequential mode
        if (currentIndex < playlist.scenes.length - 1) {
          nextIndex = currentIndex + 1;
        } else if (playlist.repeat === "all") {
          nextIndex = 0; // Loop back to start
        }
        // else: last scene and repeat is not "all", stop playback
      }

      // Navigate to next scene if determined
      if (nextIndex !== null) {
        // Add current index to shuffle history
        if (playlist.shuffle) {
          const newHistory = [...playlist.shuffleHistory, currentIndex];
          dispatch({ type: "SET_SHUFFLE_HISTORY", payload: newHistory });
        }

        // Navigate to next scene with autoplay enabled
        dispatch({
          type: "GOTO_SCENE_INDEX",
          payload: { index: nextIndex, shouldAutoplay: true },
        });
      }
    };

    player.on("ended", handleEnded);

    return () => {
      if (player && !player.isDisposed()) {
        player.off("ended", handleEnded);
      }
    };
  }, [
    playerRef,
    playlist,
    currentIndex,
    dispatch,
  ]);

  // Configure skipButtons plugin for playlist navigation (Stash pattern)
  useEffect(() => {
    const player = playerRef.current;

    if (!player || player.isDisposed?.()) {
      return;
    }

    const skipButtonsPlugin = player.skipButtons();

    // Set handlers based on playlist availability
    if (playlist && playlist.scenes && playlist.scenes.length > 1) {
      skipButtonsPlugin.setForwardHandler(playNextInPlaylist);
      skipButtonsPlugin.setBackwardHandler(playPreviousInPlaylist);
    } else {
      // Clear handlers if no playlist or single scene
      skipButtonsPlugin.setForwardHandler(undefined);
      skipButtonsPlugin.setBackwardHandler(undefined);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, playlist]);

  // Return playlist navigation functions for use by media keys hook
  return {
    playNextInPlaylist,
    playPreviousInPlaylist,
  };
}
