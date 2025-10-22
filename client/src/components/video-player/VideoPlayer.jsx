import { useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import videojs from "video.js";
import "video.js/dist/video-js.css";
import "./VideoPlayer.css";
import VideoPoster from "./VideoPoster.jsx";
import SeekPreview from "./SeekPreview.jsx";
import { useVideoPlayer } from "./useVideoPlayer.js";
import { usePlaylistNavigation } from "./usePlaylistNavigation.js";
import { usePlaylistMediaKeys } from "../../hooks/useMediaKeys.js";
import { useWatchHistory } from "../../hooks/useWatchHistory.js";
import { useOrientationFullscreen } from "../../hooks/useOrientationFullscreen.js";
import {
  setupHLSforVOD,
  setupLoadingBuffer,
  setupQualitySelector,
  setupTranscodedSeeking,
  setupPlaylistControls,
  getVideoJsOptions,
  disableLiveTracker,
  setupDoubleTapFullscreen,
} from "./videoPlayerUtils.js";
// Logging utilities removed - verbose logging disabled for production

const VideoPlayer = ({
  scene,
  playlist,
  compatibility,
  firstFile,
  externalQuality,
  externalSetQuality,
}) => {
  const location = useLocation();
  const hasResumedRef = useRef(false); // Track if we've already resumed
  const initialResumeTimeRef = useRef(null); // Store initial resume time
  const {
    videoRef,
    playerRef,
    prevQualityRef,
    video,
    sessionId,
    quality: internalQuality,
    showPoster,
    isInitializing,
    isLoadingAPI,
    isAutoFallback,
    isSwitchingMode,
    currentPlaylistIndex,
    setVideo,
    setSessionId,
    setQuality: internalSetQuality,
    setIsInitializing,
    setIsAutoFallback,
    setIsSwitchingMode,
    fetchVideoData,
    navigate,
    api,
  } = useVideoPlayer(scene, playlist, compatibility);

  // Use external quality if provided, otherwise use internal
  const quality = externalQuality !== undefined ? externalQuality : internalQuality;
  const setQuality = externalSetQuality || internalSetQuality;

  // Watch history tracking
  const {
    watchHistory,
    loading: loadingWatchHistory,
    startTracking,
    stopTracking,
    trackSeek,
    updateQuality,
  } = useWatchHistory(scene?.id, playerRef);


  // Sync internal quality with external when external changes
  useEffect(() => {
    if (externalQuality !== undefined && externalQuality !== internalQuality) {
      internalSetQuality(externalQuality);
    }
  }, [externalQuality, internalQuality, internalSetQuality]);

  const { playPreviousInPlaylist: originalPlayPrevious, playNextInPlaylist: originalPlayNext } = usePlaylistNavigation(
    playlist,
    currentPlaylistIndex,
    navigate
  );

  // Wrap navigation functions to preserve fullscreen state and playing state
  const playPreviousInPlaylist = useCallback(() => {
    const player = playerRef.current;
    if (player) {
      if (player.isFullscreen && player.isFullscreen()) {
        sessionStorage.setItem('videoPlayerFullscreen', 'true');
      }
      // Store playing state for autoplay
      if (!player.paused()) {
        sessionStorage.setItem('videoPlayerAutoplay', 'true');
      }
    }
    originalPlayPrevious();
  }, [originalPlayPrevious]);

  const playNextInPlaylist = useCallback(() => {
    const player = playerRef.current;
    if (player) {
      if (player.isFullscreen && player.isFullscreen()) {
        sessionStorage.setItem('videoPlayerFullscreen', 'true');
      }
      // Store playing state for autoplay
      if (!player.paused()) {
        sessionStorage.setItem('videoPlayerAutoplay', 'true');
      }
    }
    originalPlayNext();
  }, [originalPlayNext]);

  // Reset resume flag and initial resume time when scene changes
  useEffect(() => {
    hasResumedRef.current = false;
    initialResumeTimeRef.current = null;
  }, [scene.id]);

  // Capture initial resume time when watch history loads (before tracking starts and resets it)
  useEffect(() => {
    const shouldResume = location.state?.shouldResume;

    if (shouldResume && initialResumeTimeRef.current === null && !loadingWatchHistory && watchHistory?.resumeTime > 0) {
      console.log('[Resume Debug] Captured initial resume time:', watchHistory.resumeTime);
      initialResumeTimeRef.current = watchHistory.resumeTime;
    }
  }, [loadingWatchHistory, watchHistory, location.state]);


  // Media key support (play/pause, next/prev track)
  usePlaylistMediaKeys({
    playerRef,
    playlist,
    playNext: playNextInPlaylist,
    playPrevious: playPreviousInPlaylist,
    enabled: !showPoster, // Only enable when video is playing
  });

  // Auto-fullscreen on landscape orientation (mobile)
  useOrientationFullscreen(playerRef, !showPoster);

  // Handle quality changes
  useEffect(() => {
    if (
      playerRef.current &&
      !isAutoFallback &&
      prevQualityRef.current !== null &&
      prevQualityRef.current !== quality
    ) {
      const player = playerRef.current;

      setIsSwitchingMode(true);
      player.pause();

      const isDirectPlay = quality === "direct";

      api
        .get(`/video/play?sceneId=${scene.id}&quality=${quality}`)
        .then((response) => {
          if (isDirectPlay) {
            const directUrl = `/api/video/play?sceneId=${scene.id}&quality=direct`;
            player.src({ src: directUrl, type: "video/mp4" });
            setSessionId(null);
            setVideo({ directPlay: true });
          } else {
            player.src({
              src: response.data.playlistUrl,
              type: "application/x-mpegURL",
            });
            player.currentTime(0);
            setSessionId(response.data.sessionId);
            setVideo(response.data.scene);

            setupHLSforVOD(player, response.data.scene);
            setupQualitySelector(player);
            setupTranscodedSeeking(player, response.data.sessionId, api);
            setupLoadingBuffer(player, 6);
            disableLiveTracker(player, "after quality switch");
          }

          player.play().catch(() => {
            // Autoplay failed, user interaction required
          });

          setIsSwitchingMode(false);
        })
        .catch(() => {
          setIsSwitchingMode(false);
        });
    }

    prevQualityRef.current = quality;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quality, scene.id, isAutoFallback]);

  // Initialize player
  useEffect(() => {
    if (!playerRef.current && video && !showPoster && !isSwitchingMode) {
      const videoElement = videoRef.current;
      if (!videoElement) return;

      const isDirectPlay = quality === "direct";

      if (!isDirectPlay && !sessionId) {
        return;
      }

      let sources;
      if (isDirectPlay) {
        const apiUrl = `/api/video/play?sceneId=${scene.id}&quality=direct`;
        sources = [
          {
            src: apiUrl,
            type: `video/${firstFile?.format}`,
            label: "Direct Play",
          },
        ];
      } else {
        const playlistUrl = `/api/video/playlist/${sessionId}/master.m3u8`;
        sources = [
          {
            src: playlistUrl,
            type: "application/x-mpegURL",
            label: "Adaptive Streaming",
          },
        ];
      }

      const videoJsOptions = getVideoJsOptions(sources);

      playerRef.current = videojs(videoElement, videoJsOptions, () => {
        const player = playerRef.current;

        // Check if player was disposed during async initialization
        if (!player || player.isDisposed()) {
          return;
        }

        if (!isDirectPlay && player.liveTracker) {
          disableLiveTracker(player);
        }

        setIsInitializing(false);

        player.ready(() => {
          // Check again if player still exists and is not disposed
          if (!playerRef.current || playerRef.current.isDisposed()) {
            return;
          }

          // Handle resume or normal play
          const shouldResume = location.state?.shouldResume;
          const resumeTime = initialResumeTimeRef.current;

          // Check for playlist navigation flags
          const wasFullscreen = sessionStorage.getItem('videoPlayerFullscreen');
          const shouldAutoplay = sessionStorage.getItem('videoPlayerAutoplay');

          if (wasFullscreen === 'true') {
            sessionStorage.removeItem('videoPlayerFullscreen');
          }
          if (shouldAutoplay === 'true') {
            sessionStorage.removeItem('videoPlayerAutoplay');
          }

          if (shouldResume && !hasResumedRef.current && resumeTime > 0) {
            // Resume from saved position
            console.log('[Resume Debug] Player ready, resuming to:', resumeTime);
            hasResumedRef.current = true;

            player.currentTime(resumeTime);

            player.play().then(() => {
              console.log('[Resume Debug] Playing from resume time:', player.currentTime());
              // Re-enter fullscreen if it was active before navigation
              // Note: Browser auto-exits fullscreen when player element is removed during navigation
              // We can't reliably re-enter without a user gesture, so skip this
              // User can manually re-enter fullscreen if desired
            }).catch((err) => {
              console.log('[Resume Debug] Autoplay failed:', err.message);
            });
          } else if (shouldAutoplay === 'true') {
            // Autoplay for playlist navigation (user was watching and navigated)
            player.play().then(() => {
              // Re-enter fullscreen if it was active before navigation
              // Note: Browser auto-exits fullscreen when player element is removed during navigation
              // We can't reliably re-enter without a user gesture, so skip this
              // User can manually re-enter fullscreen if desired
            }).catch(() => {
              // Autoplay failed, user interaction required
            });
          }
        });

        // Add error handler for direct play failures
        if (isDirectPlay) {
          let hasTriggeredFallback = false;

          player.on("error", () => {
            // Check if player still exists and is not disposed
            if (!playerRef.current || playerRef.current.isDisposed()) {
              return;
            }

            if (hasTriggeredFallback) return;

            const error = player.error();
            if (error) {
              if (error.code === 3 || error.code === 4) {
                hasTriggeredFallback = true;

                player.off("error");
                setIsAutoFallback(true);
                setQuality("480p");

                api
                  .get(
                    `/video/play?sceneId=${scene.id}&quality=480p`
                  )
                  .then((response) => {
                    // Check again if player still exists before applying changes
                    if (!playerRef.current || playerRef.current.isDisposed()) {
                      return;
                    }

                    setVideo(response.data.scene);
                    setSessionId(response.data.sessionId);

                    setupHLSforVOD(player, response.data.scene);
                    setupTranscodedSeeking(player, response.data.sessionId, api);
                    setupLoadingBuffer(player, 6);

                    const playlistUrl = response.data.playlistUrl;
                    player.src({
                      src: playlistUrl,
                      type: "application/x-mpegURL",
                    });

                    disableLiveTracker(player, "after fallback");

                    player.one("loadedmetadata", () => {
                      if (!playerRef.current || playerRef.current.isDisposed()) {
                        return;
                      }
                      player.currentTime(0);
                    });

                    setIsAutoFallback(false);
                  })
                  .catch(() => {
                    setIsAutoFallback(false);
                  });
              }
            }
          });
        }

        // Configure HLS for VOD behavior if not direct play
        if (!isDirectPlay) {
          setupHLSforVOD(player, scene);
          setupLoadingBuffer(player, 6);
        }

        setupQualitySelector(player);

        if (!isDirectPlay && sessionId) {
          setupTranscodedSeeking(player, sessionId, api);
        }

        // Setup double-tap to toggle fullscreen on mobile
        setupDoubleTapFullscreen(player);

        // Setup playlist navigation controls
        // Note: Don't set up here - will be set up by the useEffect that watches currentPlaylistIndex
        // This avoids setting up with stale index values

        // Setup auto-play next scene in playlist when video ends
        if (playlist && playlist.scenes && playlist.scenes.length > 1) {
          player.on("ended", () => {
            playNextInPlaylist();
          });
        }

        // Setup watch history event listeners
        const handlePlay = () => {
          startTracking();
        };

        const handlePause = () => {
          stopTracking();
        };

        const handleSeeked = () => {
          const currentTime = player.currentTime();
          trackSeek(0, currentTime);
        };

        const handleEnded = () => {
          stopTracking();
        };

        player.on('play', handlePlay);
        player.on('pause', handlePause);
        player.on('seeked', handleSeeked);
        player.on('ended', handleEnded);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    scene,
    video,
    sessionId,
    firstFile?.format,
    quality,
    showPoster,
    fetchVideoData,
    isSwitchingMode,
    playlist,
    currentPlaylistIndex,
    playPreviousInPlaylist,
    playNextInPlaylist,
  ]);

  // Update playlist buttons when currentPlaylistIndex changes or when player becomes ready
  useEffect(() => {
    const player = playerRef.current;
    if (player && !player.isDisposed() && playlist && playlist.scenes && playlist.scenes.length > 1) {
      setupPlaylistControls(
        player,
        playlist,
        currentPlaylistIndex,
        playPreviousInPlaylist,
        playNextInPlaylist
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlaylistIndex, showPoster]); // showPoster changes when player is ready

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const player = playerRef.current;
      if (player) {
        // Stop watch history tracking
        stopTracking();

        playerRef.current = null;
        setTimeout(() => {
          try {
            player.dispose();
          } catch {
            // Player disposal warning - can be ignored
          }
        }, 0);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Track quality changes for watch history
  useEffect(() => {
    if (quality) {
      updateQuality(quality);
    }
  }, [quality, updateQuality]);

  const handlePlay = useCallback(() => {
    setIsInitializing(true);
    fetchVideoData();
  }, [fetchVideoData]);

  // Auto-start playback if navigating from a playing video in a playlist OR resuming from Continue Watching
  useEffect(() => {
    const shouldAutoplay = sessionStorage.getItem('videoPlayerAutoplay');
    const shouldResume = location.state?.shouldResume;

    // For shouldResume, wait until we've captured the resume time from watch history
    // For shouldAutoplay, trigger immediately
    const canAutoplay = shouldAutoplay === 'true' ||
                       (shouldResume && initialResumeTimeRef.current !== null);

    if (canAutoplay && showPoster && !isInitializing && !video) {
      // Automatically start playing (skip poster)
      handlePlay();
    }
  }, [scene.id, showPoster, isInitializing, video, handlePlay, location.state, watchHistory]);

  return (
    <section>
      <div className="video-container" style={{ position: 'relative' }}>
        {showPoster && (
          <VideoPoster
            scene={scene}
            isInitializing={isInitializing}
            isLoadingAPI={isLoadingAPI}
            isAutoFallback={isAutoFallback}
            onPlay={handlePlay}
          />
        )}

        <div key={scene.id} data-vjs-player style={{ position: 'relative', display: showPoster ? 'none' : 'block' }}>
          <video ref={videoRef} className="video-js vjs-big-play-centered" />
          {!showPoster && <SeekPreview scene={scene} playerRef={playerRef} />}
        </div>
      </div>
    </section>
  );
};

export default VideoPlayer;
