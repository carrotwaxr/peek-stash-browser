import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import axios from "axios";
import "video.js/dist/video-js.css";
import "./VideoPlayer.css";
import { useScenePlayer } from "../../contexts/ScenePlayerContext.jsx";
import { usePlaylistMediaKeys } from "../../hooks/useMediaKeys.js";
import { useWatchHistory } from "../../hooks/useWatchHistory.js";
import { useOrientationFullscreen } from "../../hooks/useOrientationFullscreen.js";
import { useVideoPlayerLifecycle } from "./useVideoPlayerLifecycle.js";
import { useVideoPlayerSources } from "./useVideoPlayerSources.js";
import { useResumePlayback } from "./useResumePlayback.js";
import { usePlaylistPlayer } from "./usePlaylistPlayer.js";

const api = axios.create({
  baseURL: "/api",
});

/**
 * VideoPlayer
 *
 * Main video player component for scene playback.
 *
 * ARCHITECTURE:
 * This component orchestrates multiple custom hooks to manage complex video player behavior:
 *
 * 1. useVideoPlayerLifecycle - Player initialization and cleanup
 * 2. useVideoPlayerSources - Source loading, poster updates, quality switching
 * 3. useResumePlayback - Resume playback and autoplay behavior
 * 4. usePlaylistPlayer - Playlist navigation and controls
 * 5. useWatchHistory - Watch progress tracking
 * 6. usePlaylistMediaKeys - Keyboard shortcuts for playlist navigation
 * 7. useOrientationFullscreen - Auto-fullscreen on mobile orientation change
 *
 * MINIMAL COMPONENT RESPONSIBILITY:
 * - Manage refs (videoRef, playerRef, hasResumedRef, initialResumeTimeRef)
 * - Wire up watch history event listeners (play, pause, seeked, ended)
 * - Render video element and loading overlay
 *
 * DATA FLOW:
 * - ScenePlayerContext provides scene, video, quality, playlist state
 * - Custom hooks manage side effects and player lifecycle
 * - Watch history hooks into player events for progress tracking
 */
const VideoPlayer = () => {
  const location = useLocation();

  // ============================================================================
  // REFS
  // ============================================================================
  const videoRef = useRef(null); // Container div (Video.js element appended here)
  const playerRef = useRef(null); // Video.js player instance
  const hasResumedRef = useRef(false); // Prevent double-resume
  const initialResumeTimeRef = useRef(null); // Capture resume time once

  // ============================================================================
  // CONTEXT
  // ============================================================================
  const {
    scene,
    video,
    videoLoading,
    sessionId,
    quality,
    isInitializing,
    isAutoFallback,
    ready,
    shouldAutoplay,
    playlist,
    currentIndex,
    setQuality,
    setVideo,
    setSessionId,
    setIsInitializing,
    setIsAutoFallback,
    setSwitchingMode,
    setReady,
    setShouldAutoplay,
    nextScene,
    prevScene,
  } = useScenePlayer();

  const firstFile = scene?.files?.[0];

  // ============================================================================
  // WATCH HISTORY TRACKING
  // ============================================================================
  const {
    watchHistory,
    loading: loadingWatchHistory,
    startTracking,
    stopTracking,
    trackSeek,
    updateQuality,
  } = useWatchHistory(scene?.id, playerRef);

  // ============================================================================
  // CUSTOM HOOKS: VIDEO PLAYER LOGIC
  // ============================================================================

  // Hook 1: Manage player lifecycle (init + cleanup)
  useVideoPlayerLifecycle({
    videoRef,
    playerRef,
    stopTracking,
    scene,
  });

  // Hook 2: Manage playlist navigation and controls
  const { playNextInPlaylist, playPreviousInPlaylist } = usePlaylistPlayer({
    playerRef,
    playlist,
    currentIndex,
    video,
    nextScene,
    prevScene,
    setShouldAutoplay,
  });

  // Hook 3: Capture resume time from watch history
  useResumePlayback({
    scene,
    watchHistory,
    loadingWatchHistory,
    location,
    hasResumedRef,
    initialResumeTimeRef,
    setShouldAutoplay,
  });

  // Hook 4: Manage video sources, poster, and quality switching
  useVideoPlayerSources({
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
  });

  // Hook 5: Media keys for playlist navigation
  usePlaylistMediaKeys({
    playerRef,
    playlist,
    playNext: playNextInPlaylist,
    playPrevious: playPreviousInPlaylist,
    enabled: !!video,
  });

  // Hook 6: Auto-fullscreen on orientation change (mobile)
  useOrientationFullscreen(playerRef, !!video);

  // ============================================================================
  // WATCH HISTORY EVENT LISTENERS
  // ============================================================================
  // WHY: Wire up watch history tracking functions to player events
  // RUNS: When watch history functions change (they shouldn't, but dependencies required)
  // DEPS: [startTracking, stopTracking, trackSeek]
  //
  // This is kept in the main component because it's simple event wiring.
  // Creating a separate hook for this would be over-abstraction.
  useEffect(() => {
    const player = playerRef.current;
    if (!player || player.isDisposed?.()) return;

    const handlePlay = () => startTracking();
    const handlePause = () => stopTracking();
    const handleSeeked = () => trackSeek(0, player.currentTime());
    const handleEnded = () => stopTracking();

    player.on("play", handlePlay);
    player.on("pause", handlePause);
    player.on("seeked", handleSeeked);
    player.on("ended", handleEnded);

    return () => {
      if (player && !player.isDisposed()) {
        player.off("play", handlePlay);
        player.off("pause", handlePause);
        player.off("seeked", handleSeeked);
        player.off("ended", handleEnded);
      }
    };
  }, [startTracking, stopTracking, trackSeek]);

  // ============================================================================
  // ASPECT RATIO CALCULATION
  // ============================================================================
  // Extract video dimensions from scene metadata
  const videoWidth = firstFile?.width || 1920;
  const videoHeight = firstFile?.height || 1080;
  const aspectRatio = videoWidth / videoHeight;

  // Determine container height based on aspect ratio
  // This prevents square/portrait videos from dominating vertical space
  let containerHeight;
  if (aspectRatio > 1.5) {
    // Landscape videos (16:9, etc.) - most common case
    containerHeight = "56.25vw"; // 9/16 * 100
  } else if (aspectRatio < 0.75) {
    // Portrait videos (9:16, etc.) - phone recordings
    containerHeight = "177.78vw"; // 16/9 * 100
  } else {
    // Square-ish videos (4:3, 1:1, etc.)
    containerHeight = "100vw"; // 1:1
  }

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <section>
      <div className="video-container" style={{ position: "relative" }}>
        {/*
          Container div - Video.js element will be programmatically appended here
          This prevents React/Video.js DOM conflicts by keeping the video element
          outside of React's management (following Stash's pattern)

          NOTE: No key={scene?.id} here - that was destroying the container on scene changes
        */}
        <div
          data-vjs-player
          style={{
            position: "relative",
            height: containerHeight,
            maxHeight: "calc(100vh - 200px)", // Reserve space for navbar/controls
            overflow: "hidden",
            width: "100%"
          }}
        >
          <div ref={videoRef} style={{
            position: "absolute",
            width: "100%",
            height: "100%"
          }} />

          {/* Loading overlay for scene or video data */}
          {(!scene || videoLoading || isInitializing || isAutoFallback) && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                zIndex: 10,
              }}
            >
              <div className="flex flex-col items-center gap-2">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
                <span style={{ color: "white", fontSize: "14px" }}>
                  {!scene
                    ? "Loading scene..."
                    : isAutoFallback
                    ? "Switching to transcoded playback..."
                    : "Loading video..."}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default VideoPlayer;
