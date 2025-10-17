import { useEffect } from "react";
import videojs from "video.js";
import "video.js/dist/video-js.css";
import "./VideoPlayer.css";
import VideoPoster from "./VideoPoster.jsx";
import { useVideoPlayer } from "./useVideoPlayer.js";
import { usePlaylistNavigation } from "./usePlaylistNavigation.js";
import {
  setupHLSforVOD,
  setupLoadingBuffer,
  setupQualitySelector,
  setupTranscodedSeeking,
  setupPlaylistControls,
  getVideoJsOptions,
  disableLiveTracker,
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

  // Sync internal quality with external when external changes
  useEffect(() => {
    if (externalQuality !== undefined && externalQuality !== internalQuality) {
      internalSetQuality(externalQuality);
    }
  }, [externalQuality, internalQuality, internalSetQuality]);

  const { playPreviousInPlaylist, playNextInPlaylist } = usePlaylistNavigation(
    playlist,
    currentPlaylistIndex,
    navigate
  );

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

        if (!isDirectPlay && player.liveTracker) {
          disableLiveTracker(player);
        }

        setIsInitializing(false);

        player.ready(() => {
          player.play().catch(() => {
            // Autoplay failed, user interaction required
          });
        });

        // Add error handler for direct play failures
        if (isDirectPlay) {
          let hasTriggeredFallback = false;

          player.on("error", () => {
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

        // Setup playlist navigation controls
        if (playlist && playlist.scenes && playlist.scenes.length > 1) {
          setupPlaylistControls(
            player,
            playlist,
            currentPlaylistIndex,
            playPreviousInPlaylist,
            playNextInPlaylist
          );
        }

        // Setup auto-play next scene in playlist when video ends
        if (playlist && playlist.scenes && playlist.scenes.length > 1) {
          player.on("ended", () => {
            playNextInPlaylist();
          });
        }
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const player = playerRef.current;
      if (player) {
        playerRef.current = null;
        setTimeout(() => {
          try {
            player.dispose();
          } catch (e) {
            // Player disposal warning - can be ignored
          }
        }, 0);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePlay = () => {
    setIsInitializing(true);
    fetchVideoData();
  };

  return (
    <section className="py-6">
      <div className="video-container">
        {showPoster ? (
          <VideoPoster
            scene={scene}
            isInitializing={isInitializing}
            isLoadingAPI={isLoadingAPI}
            isAutoFallback={isAutoFallback}
            onPlay={handlePlay}
          />
        ) : (
          <div data-vjs-player>
            <video ref={videoRef} className="video-js vjs-big-play-centered" />
          </div>
        )}
      </div>
    </section>
  );
};

export default VideoPlayer;
