import { useCallback, useEffect, useRef } from "react";
import airplay from "@silvermine/videojs-airplay";
import "@silvermine/videojs-airplay/dist/silvermine-videojs-airplay.css";
import chromecast from "@silvermine/videojs-chromecast";
import "@silvermine/videojs-chromecast/dist/silvermine-videojs-chromecast.css";
import axios from "axios";
import videojs from "video.js";
import {
  setupPlaylistControls,
  setupSubtitles,
  togglePlaybackRateControl,
} from "./videoPlayerUtils.js";
import "./vtt-thumbnails.js";

// Register Video.js plugins
airplay(videojs);
chromecast(videojs);

const api = axios.create({
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
  video,
  sessionId,
  quality,
  isAutoFallback,
  ready,
  shouldAutoplay,
  playlist,
  currentIndex,
  dispatch,
  nextScene,
  prevScene,
  updateQuality,
  stopTracking,
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

    // Initialize Video.js
    const player = videojs(videoElement, {
      autoplay: false,
      controls: true,
      controlBar: {
        pictureInPictureToggle: false,
      },
      responsive: true,
      fluid: true,
      preload: "none",
      liveui: false,
      playsinline: true,
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
        qualityLevels: {},
        vttThumbnails: {
          showTimestamp: true,
          spriteUrl: scene?.paths?.sprite || null,
        },
      },
    });

    playerRef.current = player;
    player.focus();

    player.ready(() => {
      // Restore volume and mute state from localStorage
      const savedVolume = localStorage.getItem("videoPlayerVolume");
      const savedMuted = localStorage.getItem("videoPlayerMuted");

      if (savedVolume !== null) {
        player.volume(parseFloat(savedVolume));
      }
      if (savedMuted !== null) {
        player.muted(savedMuted === "true");
      }

      // Save volume changes to localStorage
      player.on("volumechange", () => {
        localStorage.setItem("videoPlayerVolume", player.volume().toString());
        localStorage.setItem("videoPlayerMuted", player.muted().toString());
      });

      // Disable hover-to-open for popup menus (click-only)
      // This prevents frustrating behavior where menus close when moving mouse
      setTimeout(() => {
        const menuButtons = player.el().querySelectorAll(
          ".vjs-menu-button-popup, .vjs-quality-selector, .vjs-subs-caps-button"
        );

        menuButtons.forEach((button) => {
          // Remove hover event listeners by cloning and replacing the node
          const clone = button.cloneNode(true);
          button.parentNode.replaceChild(clone, button);

          // Re-add click handler for menu toggle
          clone.addEventListener("click", (e) => {
            e.stopPropagation();
            const isOpen = clone.classList.contains("vjs-lock-showing");

            // Close all other menus first
            menuButtons.forEach((btn) => {
              if (btn !== clone) {
                btn.classList.remove("vjs-lock-showing");
              }
            });

            // Toggle this menu
            if (isOpen) {
              clone.classList.remove("vjs-lock-showing");
            } else {
              clone.classList.add("vjs-lock-showing");
            }
          });
        });

        // Close menus when clicking outside
        player.el().addEventListener("click", (e) => {
          const clickedMenu = e.target.closest(
            ".vjs-menu-button-popup, .vjs-quality-selector, .vjs-subs-caps-button"
          );
          if (!clickedMenu) {
            menuButtons.forEach((btn) => {
              btn.classList.remove("vjs-lock-showing");
            });
          }
        });
      }, 100);
    });

    // Cleanup
    return () => {
      stopTracking();
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
  // SCENE CHANGE DETECTION (from useVideoPlayerSources)
  // ============================================================================

  useEffect(() => {
    if (scene?.id && scene.id !== prevSceneIdRef.current) {
      dispatch({ type: "SET_READY", payload: false });
      prevSceneIdRef.current = scene.id;
    }
  }, [scene?.id, dispatch]);

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
      const hlsUrl = `/api/scene/${scene.id}/stream.m3u8?quality=${bestQuality}`;

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
        // Update quality in state (quality selector UI)
        dispatch({ type: "SET_QUALITY", payload: bestQuality });
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
  }, [scene?.id, dispatch]); // Only re-run when scene changes

  // ============================================================================
  // VIDEO SOURCES LOADING
  // ============================================================================

  useEffect(() => {
    const player = playerRef.current;

    // Guard: Need player and scene (video/sessionId no longer needed for stateless)
    if (!player || !scene) {
      return;
    }

    const isDirectPlay = quality === "direct";
    const firstFile = scene?.files?.[0];

    // Set poster
    const posterUrl = scene?.paths?.screenshot;
    if (posterUrl) {
      player.poster(posterUrl);
    }

    // Build sources with duration
    const duration = firstFile?.duration;

    const sources = isDirectPlay
      ? [
          {
            src: `/api/scene/${scene.id}/stream`,  // Direct video file (no .m3u8)
            type: `video/${firstFile?.format}`,
            duration,
          },
        ]
      : [
          {
            src: `/api/scene/${scene.id}/stream.m3u8?quality=${quality}`,
            type: "application/x-mpegURL",
            duration,
          },
        ];

    // Check if source has changed before reloading
    // Compare full URL path (excluding query params) to detect scene changes
    const currentSrc = player.currentSrc();
    const targetSrc = sources[0].src;
    const currentPath = currentSrc ? currentSrc.split('?')[0] : '';
    const targetPath = targetSrc.split('?')[0];
    const needsReload = !currentSrc || currentPath !== targetPath;

    if (needsReload) {
      // Determine if this is a quality switch (user-initiated) vs initial load
      // Quality switch: currentSrc exists and is different from target
      // Initial load: no currentSrc (empty string)
      const isQualitySwitch = currentSrc !== "";

      // Preserve playback state ONLY for quality switches (like Stash does)
      // For initial loads, let the AUTOPLAY effect handle playback
      let wasPaused = true;
      let savedTime = 0;

      if (isQualitySwitch) {
        wasPaused = player.paused();
        savedTime = player.currentTime();
      }

      // Set ready=true when loadstart fires
      const handleLoadStart = () => {
        if (!playerRef.current) return;
        dispatch({ type: "SET_READY", payload: true });
      };

      // Restore playback state after source loads (only for quality switches)
      const handleCanPlay = () => {
        if (!playerRef.current) return;

        if (isQualitySwitch) {
          // Restore playback position
          if (savedTime > 0) {
            player.currentTime(savedTime);
          }

          // If video was paused before, pause it now (Stash pattern)
          if (wasPaused) {
            player.pause();
          }
        }
      };

      player.one("loadstart", handleLoadStart);
      player.one("canplay", handleCanPlay);
      player.src(sources);
      player.load();

      // Setup subtitles if available
      if (scene.captions && scene.captions.length > 0) {
        setupSubtitles(player, scene.id, scene.captions);
      }

      // Call play() immediately if video was playing (like Stash does)
      // Only for quality switches - initial load uses AUTOPLAY effect
      if (isQualitySwitch && !wasPaused) {
        player.play().catch((err) => console.error("[VIDEO] Play failed:", err));
      }
    }

    // Configure player
    togglePlaybackRateControl(player, isDirectPlay);
    if (isDirectPlay) {
      player.playbackRates([0.5, 1, 1.25, 1.5, 2]);
    }

    dispatch({ type: "SET_INITIALIZING", payload: false });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene?.id, quality]); // Stateless: only scene and quality matter

  // ============================================================================
  // QUALITY SWITCHING (from useVideoPlayerSources)
  // ============================================================================

  // Track quality changes for watch history
  useEffect(() => {
    if (quality) {
      updateQuality(quality);
    }
  }, [quality, updateQuality]);

  // ============================================================================
  // AUTOPLAY AND RESUME (from useVideoPlayerSources)
  // ============================================================================

  useEffect(() => {
    const player = playerRef.current;

    if (!player || !ready || !shouldAutoplay) return;

    const shouldResume = location.state?.shouldResume;
    const resumeTime = initialResumeTimeRef.current;

    // Priority: Resume > Autoplay
    if (shouldResume && !hasResumedRef.current && resumeTime > 0) {
      hasResumedRef.current = true;
      player.currentTime(resumeTime);
      player.play().catch((err) => console.error("Resume failed:", err));
    } else {
      player.play().catch((err) => console.error("Autoplay failed:", err));
    }

    // Clear shouldAutoplay flag after triggering
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

  // Update Video.js playlist controls when index changes
  useEffect(() => {
    const player = playerRef.current;

    if (
      !player ||
      player.isDisposed?.() ||
      !playlist ||
      !playlist.scenes ||
      playlist.scenes.length <= 1
    ) {
      return;
    }

    setupPlaylistControls(
      player,
      playlist,
      currentIndex,
      playPreviousInPlaylist,
      playNextInPlaylist
    );

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, video, playlist]);

  // Return playlist navigation functions for use by media keys hook
  return {
    playNextInPlaylist,
    playPreviousInPlaylist,
  };
}
