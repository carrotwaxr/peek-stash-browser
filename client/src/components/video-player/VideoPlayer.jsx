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
import {
  setupVideoJsLogging,
  setupNetworkLogging,
  logInitialSetup,
} from "./videoPlayerLogging.js";

const VideoPlayer = ({
  scene,
  playlist,
  compatibility,
  firstFile,
  externalPlaybackMode,
  externalSetPlaybackMode,
}) => {
  const {
    videoRef,
    playerRef,
    prevPlaybackModeRef,
    video,
    sessionId,
    playbackMode: internalPlaybackMode,
    showPoster,
    isInitializing,
    isLoadingAPI,
    isAutoFallback,
    isSwitchingMode,
    currentPlaylistIndex,
    setVideo,
    setSessionId,
    setTranscodingStatus,
    setPlaybackMode: internalSetPlaybackMode,
    setIsInitializing,
    setIsAutoFallback,
    setIsSwitchingMode,
    fetchVideoData,
    navigate,
    api,
  } = useVideoPlayer(scene, playlist, compatibility);

  // Use external playback mode if provided, otherwise use internal
  const playbackMode = externalPlaybackMode !== undefined ? externalPlaybackMode : internalPlaybackMode;
  const setPlaybackMode = externalSetPlaybackMode || internalSetPlaybackMode;

  // Sync internal playback mode with external when external changes
  useEffect(() => {
    if (externalPlaybackMode !== undefined && externalPlaybackMode !== internalPlaybackMode) {
      console.log("[VideoPlayer] Syncing internal playbackMode to:", externalPlaybackMode);
      internalSetPlaybackMode(externalPlaybackMode);
    }
  }, [externalPlaybackMode, internalPlaybackMode, internalSetPlaybackMode]);

  const { playPreviousInPlaylist, playNextInPlaylist } = usePlaylistNavigation(
    playlist,
    currentPlaylistIndex,
    navigate
  );

  // Handle playback mode changes
  useEffect(() => {
    if (
      playerRef.current &&
      !isAutoFallback &&
      prevPlaybackModeRef.current !== null &&
      prevPlaybackModeRef.current !== playbackMode
    ) {
      const player = playerRef.current;
      console.log(
        `Manual mode switch: ${prevPlaybackModeRef.current} -> ${playbackMode}`
      );

      setIsSwitchingMode(true);
      player.pause();

      const isDirect = playbackMode === "direct";

      api
        .get(`/video/play?sceneId=${scene.id}&direct=${isDirect}&userId=user1`)
        .then((response) => {
          console.log("Mode switch session created:", response.data);

          if (isDirect) {
            const directUrl = `/api/video/play?sceneId=${scene.id}&direct=true`;
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
            disableLiveTracker(player, "after mode switch");
          }

          player.play().catch((e) => {
            console.log(
              "Autoplay failed after mode switch, user interaction required:",
              e
            );
          });

          setIsSwitchingMode(false);
        })
        .catch((error) => {
          console.error("Mode switch failed:", error);
          setIsSwitchingMode(false);
        });
    }

    prevPlaybackModeRef.current = playbackMode;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackMode, scene.id, isAutoFallback]);

  // Initialize player
  useEffect(() => {
    if (!playerRef.current && video && !showPoster && !isSwitchingMode) {
      const videoElement = videoRef.current;
      if (!videoElement) return;

      let canDirectPlay;
      if (playbackMode === "direct") {
        canDirectPlay = true;
      } else if (playbackMode === "transcode") {
        canDirectPlay = false;
      } else {
        canDirectPlay = compatibility?.canDirectPlay || false;
      }

      if (!canDirectPlay && !sessionId) {
        console.log(
          "Waiting for sessionId before initializing player...",
          sessionId
        );
        return;
      }

      console.log(
        "Initializing player with sessionId:",
        sessionId,
        "canDirectPlay:",
        canDirectPlay,
        "video:",
        video
      );

      let sources;
      if (canDirectPlay) {
        const apiUrl = `/api/video/play?sceneId=${scene.id}&direct=true`;
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
        console.log("player is ready");
        console.log("Video object:", video);

        videojs.log.level("debug");

        const player = playerRef.current;

        // Setup comprehensive logging
        setupVideoJsLogging(player);

        if (!canDirectPlay && player.liveTracker) {
          disableLiveTracker(player);
        }

        setIsInitializing(false);

        player.ready(() => {
          player.play().catch((err) => {
            console.warn("Autoplay failed, user interaction required:", err);
          });
        });

        // Add error handler for direct play failures
        if (canDirectPlay) {
          let hasTriggeredFallback = false;

          player.on("error", () => {
            if (hasTriggeredFallback) return;

            const error = player.error();
            if (error) {
              console.error("Direct play error:", error);

              if (error.code === 3 || error.code === 4) {
                hasTriggeredFallback = true;
                console.log(
                  "Direct play failed, automatically switching to transcoding..."
                );

                player.off("error");
                setIsAutoFallback(true);
                setPlaybackMode("transcode");

                api
                  .get(
                    `/video/play?sceneId=${scene.id}&direct=false&userId=user1`
                  )
                  .then((response) => {
                    console.log(
                      "Fallback transcode session created:",
                      response.data
                    );

                    setVideo(response.data.scene);
                    setSessionId(response.data.sessionId);
                    setTranscodingStatus(response.data.status);

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
                      console.log("Reset currentTime to 0 after source change");
                    });

                    console.log(
                      "Transcoded stream ready. Waiting for buffer..."
                    );

                    setIsAutoFallback(false);
                  })
                  .catch((error) => {
                    console.error("Error fetching transcoded session:", error);
                    setIsAutoFallback(false);
                  });
              }
            }
          });
        }

        // Configure HLS for VOD behavior if not direct play
        if (!canDirectPlay) {
          setupHLSforVOD(player, scene);
          setupLoadingBuffer(player, 6);
        }

        setupQualitySelector(player);

        if (!canDirectPlay && sessionId) {
          setupTranscodedSeeking(player, sessionId, api);
        }

        // Setup playlist navigation controls
        console.log("Playlist check:", {
          playlist,
          hasScenes: playlist?.scenes,
          length: playlist?.scenes?.length,
          currentIndex: currentPlaylistIndex,
        });
        if (playlist && playlist.scenes && playlist.scenes.length > 1) {
          console.log("Calling setupPlaylistControls");
          setupPlaylistControls(
            player,
            playlist,
            currentPlaylistIndex,
            playPreviousInPlaylist,
            playNextInPlaylist
          );
        } else {
          console.log(
            "Skipping playlist controls - not in a playlist or only 1 scene"
          );
        }

        // Setup auto-play next scene in playlist when video ends
        if (playlist && playlist.scenes && playlist.scenes.length > 1) {
          player.on("ended", () => {
            console.log("Video ended, auto-playing next in playlist...");
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
    compatibility?.canDirectPlay,
    playbackMode,
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
            console.warn("Player disposal warning:", e);
          }
        }, 0);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePlay = () => {
    console.log("[handlePlay] Called with playbackMode:", playbackMode);
    console.log("[handlePlay] Internal playbackMode:", internalPlaybackMode);
    logInitialSetup(scene, compatibility, playbackMode);
    setIsInitializing(true);
    console.log("[handlePlay] About to call fetchVideoData");
    fetchVideoData();
    console.log("[handlePlay] fetchVideoData called");
  };

  // Setup network logging once on mount
  useEffect(() => {
    setupNetworkLogging();
  }, []);

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
