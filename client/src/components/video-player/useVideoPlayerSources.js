import { useEffect, useRef } from "react";
import {
  setupTranscodedSeeking,
  togglePlaybackRateControl,
} from "./videoPlayerUtils.js";

/**
 * useVideoPlayerSources
 *
 * Manages video sources, poster, and quality switching.
 * Following Stash's pattern: includes duration in source objects, uses loadstart event,
 * and separates autoplay logic from source loading.
 */
export function useVideoPlayerSources({
  playerRef,
  scene,
  video,
  sessionId,
  quality,
  isAutoFallback,
  ready,
  shouldAutoplay,
  setIsInitializing,
  setIsAutoFallback,
  setSwitchingMode,
  setVideo,
  setSessionId,
  setQuality,
  setReady,
  setShouldAutoplay,
  updateQuality,
  location,
  hasResumedRef,
  initialResumeTimeRef,
  firstFile,
  api,
}) {
  // Track previous quality to detect changes
  const prevQualityRef = useRef(null);

  // Track previous scene to detect changes
  const prevSceneIdRef = useRef(null);

  // Reset ready state when scene changes (Stash's pattern)
  useEffect(() => {
    if (scene?.id && scene.id !== prevSceneIdRef.current) {
      setReady(false);
      prevSceneIdRef.current = scene.id;
    }
  }, [scene?.id, setReady]);

  // Load video sources when data becomes available
  useEffect(() => {
    const player = playerRef.current;

    // Guard: Need player, video data, and scene
    if (!player || !video || !scene) {
      return;
    }

    const isDirectPlay = quality === "direct";

    // For transcoded, we need a session ID
    if (!isDirectPlay && !sessionId) {
      return;
    }

    // Set poster (Stash doesn't use reset(), just changes sources)
    const posterUrl = scene?.paths?.screenshot;
    if (posterUrl) {
      player.poster(posterUrl);
    }

    // Build sources with duration (prevents Infinity duration in HLS)
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

    // Set ready=true when loadstart fires (Stash's pattern)
    const handleLoadStart = () => {
      if (!playerRef.current) return;
      setReady(true);
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

    setIsInitializing(false);

    // Auto-fallback to 480p if direct play codec unsupported
    if (isDirectPlay) {
      let hasTriggeredFallback = false;

      const handleError = () => {
        if (hasTriggeredFallback) return;

        const error = player.error();

        // Error codes: 3 = MEDIA_ERR_DECODE, 4 = MEDIA_ERR_SRC_NOT_SUPPORTED
        if (error && (error.code === 3 || error.code === 4)) {
          console.log('[SOURCES] Codec error, falling back to 480p');
          hasTriggeredFallback = true;
          player.off("error", handleError);
          setIsAutoFallback(true);
          setQuality("480p");

          api
            .get(`/video/play?sceneId=${scene.id}&quality=480p`)
            .then((response) => {
              if (!playerRef.current) return;

              setVideo(response.data.scene);
              setSessionId(response.data.sessionId);
              setupTranscodedSeeking(player, response.data.sessionId, api);

              // Include duration in source object (Stash's pattern)
              player.src({
                src: response.data.playlistUrl,
                type: "application/x-mpegURL",
                duration: firstFile?.duration,
              });

              player.one("loadedmetadata", () => {
                if (playerRef.current) {
                  player.currentTime(0);
                }
              });

              setIsAutoFallback(false);
            })
            .catch(() => {
              console.error('[Sources] Fallback failed');
              setIsAutoFallback(false);
            });
        }
      };

      player.on("error", handleError);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video, sessionId, quality]);

  // Handle quality changes (user switching quality)
  useEffect(() => {
    // Guard: Need player, scene, and actual quality change (not auto-fallback)
    if (
      !playerRef.current ||
      !scene ||
      isAutoFallback ||
      prevQualityRef.current === null ||
      prevQualityRef.current === quality
    ) {
      prevQualityRef.current = quality;
      return;
    }

    const player = playerRef.current;
    setSwitchingMode(true);
    player.pause();

    const isDirectPlay = quality === "direct";

    api
      .get(`/video/play?sceneId=${scene.id}&quality=${quality}`)
      .then((response) => {
        if (isDirectPlay) {
          player.src({
            src: `/api/video/play?sceneId=${scene.id}&quality=direct`,
            type: "video/mp4",
          });
          setSessionId(null);
          setVideo({ directPlay: true });
        } else {
          // Include duration in source object (Stash's pattern)
          player.src({
            src: response.data.playlistUrl,
            type: "application/x-mpegURL",
            duration: firstFile?.duration,
          });
          player.currentTime(0);
          setSessionId(response.data.sessionId);
          setVideo(response.data.scene);
          setupTranscodedSeeking(player, response.data.sessionId, api);
        }

        togglePlaybackRateControl(player, isDirectPlay);
        player.play().catch(() => {});
        setSwitchingMode(false);
      })
      .catch((error) => {
        console.error('[SOURCES] Quality switch failed:', error);
        setSwitchingMode(false);
      });

    prevQualityRef.current = quality;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quality, scene?.id, isAutoFallback]);

  // Autoplay when ready (Stash's pattern - decouples play trigger from metadata event)
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !ready || !shouldAutoplay) return;

    const shouldResume = location.state?.shouldResume;
    const resumeTime = initialResumeTimeRef.current;

    // Priority: Resume > Autoplay
    if (shouldResume && !hasResumedRef.current && resumeTime > 0) {
      hasResumedRef.current = true;
      player.currentTime(resumeTime);
      player.play().catch((err) => console.error('Resume failed:', err));
    } else {
      player.play().catch((err) => console.error('Autoplay failed:', err));
    }

    // Clear shouldAutoplay flag after triggering
    setShouldAutoplay(false);
  }, [ready, shouldAutoplay, location.state, initialResumeTimeRef, hasResumedRef, playerRef, setShouldAutoplay]);

  // Track quality changes for watch history
  useEffect(() => {
    if (quality) {
      updateQuality(quality);
    }
  }, [quality, updateQuality]);
}
