import { useCallback, useEffect, useRef } from "react";
import airplay from "@silvermine/videojs-airplay";
import "@silvermine/videojs-airplay/dist/silvermine-videojs-airplay.css";
import chromecast from "@silvermine/videojs-chromecast";
import "@silvermine/videojs-chromecast/dist/silvermine-videojs-chromecast.css";
import axios from "axios";
import videojs from "video.js";
import {
  setupPlaylistControls,
  setupTranscodedSeeking,
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
  enableAutoFallback,
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
  // Track previous quality and scene for detecting changes
  const prevQualityRef = useRef(null);
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
  // VIDEO SOURCES LOADING (from useVideoPlayerSources)
  // ============================================================================

  useEffect(() => {
    const player = playerRef.current;

    // Guard: Need player, video data, and scene
    if (!player || !video || !scene) {
      return;
    }

    const isDirectPlay = quality === "direct";
    const firstFile = scene?.files?.[0];

    // For transcoded, we need a session ID
    if (!isDirectPlay && !sessionId) {
      return;
    }

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
            src: `/api/video/play?sceneId=${scene.id}&quality=direct`,
            type: `video/${firstFile?.format}`,
            duration,
          },
        ]
      : [
          {
            src: `/api/video/playlist/${sessionId}/master.m3u8`,
            type: "application/x-mpegURL",
            duration,
          },
        ];

    // Set ready=true when loadstart fires
    const handleLoadStart = () => {
      if (!playerRef.current) return;
      dispatch({ type: "SET_READY", payload: true });
    };

    player.one("loadstart", handleLoadStart);
    player.src(sources);
    player.load();

    // Configure player
    if (!isDirectPlay) {
      setupTranscodedSeeking(player, sessionId, api);
    }

    togglePlaybackRateControl(player, isDirectPlay);
    if (isDirectPlay) {
      player.playbackRates([0.5, 1, 1.25, 1.5, 2]);
    }

    dispatch({ type: "SET_INITIALIZING", payload: false });

    // Auto-fallback to 480p if direct play codec unsupported
    if (isDirectPlay) {
      let hasTriggeredFallback = false;

      const handleError = async () => {
        if (hasTriggeredFallback) return;

        const error = player.error();

        // Error codes: 3 = MEDIA_ERR_DECODE, 4 = MEDIA_ERR_SRC_NOT_SUPPORTED
        if (error && (error.code === 3 || error.code === 4)) {
          console.log("[SOURCES] Codec error, falling back to 480p");
          hasTriggeredFallback = true;
          player.off("error", handleError);

          const result = await enableAutoFallback();

          if (result?.success && playerRef.current) {
            setupTranscodedSeeking(player, result.sessionId, api);

            // Include duration in source object
            player.src({
              src: `/api/video/playlist/${result.sessionId}/master.m3u8`,
              type: "application/x-mpegURL",
              duration: firstFile?.duration,
            });

            player.one("loadedmetadata", () => {
              if (playerRef.current) {
                player.currentTime(0);
              }
            });
          }
        }
      };

      player.on("error", handleError);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video, sessionId, quality]);

  // ============================================================================
  // QUALITY SWITCHING (from useVideoPlayerSources)
  // ============================================================================

  // Track quality changes for watch history
  useEffect(() => {
    if (quality) {
      updateQuality(quality);
    }
  }, [quality, updateQuality]);

  // Handle user-initiated quality changes (preserve playback position)
  useEffect(() => {
    const player = playerRef.current;
    const firstFile = scene?.files?.[0];

    // Guard: Need player, scene, and actual quality change (not auto-fallback)
    if (
      !player ||
      !scene ||
      isAutoFallback ||
      prevQualityRef.current === null ||
      prevQualityRef.current === quality
    ) {
      prevQualityRef.current = quality;
      return;
    }

    const isDirectPlay = quality === "direct";
    const currentTime = player.currentTime(); // Capture current position

    dispatch({ type: "SET_SWITCHING_MODE", payload: true });
    player.pause();

    api
      .get(`/video/play?sceneId=${scene.id}&quality=${quality}`)
      .then((response) => {
        if (!playerRef.current) return;

        if (isDirectPlay) {
          player.src({
            src: `/api/video/play?sceneId=${scene.id}&quality=direct`,
            type: `video/${firstFile?.format}`,
            duration: firstFile?.duration,
          });
          dispatch({ type: "SET_SESSION_ID", payload: null });
          dispatch({ type: "SET_VIDEO", payload: { directPlay: true } });
        } else {
          player.src({
            src: response.data.playlistUrl,
            type: "application/x-mpegURL",
            duration: firstFile?.duration,
          });
          dispatch({
            type: "SET_SESSION_ID",
            payload: response.data.sessionId,
          });
          dispatch({ type: "SET_VIDEO", payload: response.data.scene });
          setupTranscodedSeeking(player, response.data.sessionId, api);
        }

        togglePlaybackRateControl(player, isDirectPlay);

        // Restore playback position after metadata loads
        player.one("loadedmetadata", () => {
          if (playerRef.current && currentTime > 0) {
            player.currentTime(currentTime);
          }
        });

        player.play().catch(() => {});
        dispatch({ type: "SET_SWITCHING_MODE", payload: false });
      })
      .catch((error) => {
        console.error("[QUALITY] Quality switch failed:", error);
        dispatch({ type: "SET_SWITCHING_MODE", payload: false });
      });

    prevQualityRef.current = quality;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quality, scene?.id, isAutoFallback]);

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
  }, [currentIndex, video]);

  // Return playlist navigation functions for use by media keys hook
  return {
    playNextInPlaylist,
    playPreviousInPlaylist,
  };
}
