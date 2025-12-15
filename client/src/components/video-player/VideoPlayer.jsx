import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import axios from "axios";
import "video.js/dist/video-js.css";
import { useScenePlayer } from "../../contexts/ScenePlayerContext.jsx";
import { usePlaylistMediaKeys } from "../../hooks/useMediaKeys.js";
import { useWatchHistory } from "../../hooks/useWatchHistory.js";
import "./VideoPlayer.css";
import { useOrientationFullscreen } from "./useOrientationFullscreen.js";
import { useVideoPlayer } from "./useVideoPlayer.js";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

/**
 * VideoPlayer
 *
 * Main video player component for scene playback.
 *
 * ARCHITECTURE:
 * This component orchestrates custom hooks to manage video player behavior:
 *
 * 1. useVideoPlayer - Consolidated player management (init, sources, playlist, resume)
 * 2. useWatchHistory - Watch progress tracking
 * 3. usePlaylistMediaKeys - Keyboard shortcuts for playlist navigation
 * 4. useOrientationFullscreen - Auto-fullscreen on mobile orientation change
 *
 * RESPONSIBILITIES:
 * - Manage refs (videoRef, playerRef, hasResumedRef, initialResumeTimeRef)
 * - Fetch user settings (enableCast preference)
 * - Render video element and loading overlay
 *
 * DATA FLOW:
 * - ScenePlayerContext provides scene, video, quality, playlist state
 * - Hooks manage side effects and player lifecycle
 * - Watch history tracks playback progress
 */
const VideoPlayer = () => {
  const location = useLocation();

  const videoRef = useRef(null); // Container div (Video.js element appended here)
  const playerRef = useRef(null); // Video.js player instance
  const hasResumedRef = useRef(false); // Prevent double-resume
  const initialResumeTimeRef = useRef(null); // Capture resume time once

  const [enableCast, setEnableCast] = useState(true); // Default to true

  // Fetch user settings for cast preference
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await api.get("/user/settings");
        setEnableCast(response.data.settings.enableCast !== false);
      } catch (error) {
        // If error, default to true (enabled)
        console.error("Failed to fetch user settings:", error);
      }
    };
    fetchSettings();
  }, []);

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
    _shuffle,
    _repeat,
    _shuffleHistory,
    dispatch,
    nextScene,
    prevScene,
  } = useScenePlayer();

  const firstFile = scene?.files?.[0];

  // Calculate aspect ratio from actual video dimensions
  const videoWidth = firstFile?.width || 1920;
  const videoHeight = firstFile?.height || 1080;
  const aspectRatio = `${videoWidth} / ${videoHeight}`;

  // ============================================================================
  // WATCH HISTORY TRACKING
  // ============================================================================
  const {
    watchHistory,
    loading: loadingWatchHistory,
    updateQuality,
  } = useWatchHistory(scene?.id, playerRef);

  // ============================================================================
  // CUSTOM HOOKS: VIDEO PLAYER LOGIC
  // ============================================================================

  // Consolidated hook: Manages all Video.js player operations
  const { playNextInPlaylist, playPreviousInPlaylist } = useVideoPlayer({
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
    location,
    hasResumedRef,
    initialResumeTimeRef,
    watchHistory,
    loadingWatchHistory,
    enableCast,
  });

  // Media keys for playlist navigation
  // Always enabled - shortcuts check playerRef.current before executing
  usePlaylistMediaKeys({
    playerRef,
    playlist,
    playNext: playNextInPlaylist,
    playPrevious: playPreviousInPlaylist,
    enabled: true,
  });

  // Auto-fullscreen on mobile orientation change
  useOrientationFullscreen(playerRef, scene?.id, true);

  return (
    <section className="video-container">
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
          aspectRatio,
          overflow: "hidden",
          maxWidth: "100%",
          maxHeight: "90vh", // Constrain to viewport height (fit-within approach)
          margin: "0 auto", // Center horizontally when height-constrained
          backgroundColor: "#000",
        }}
      >
        <div
          ref={videoRef}
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
          }}
        />

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
    </section>
  );
};

export default VideoPlayer;
