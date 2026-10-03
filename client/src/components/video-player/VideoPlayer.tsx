import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import "video.js/dist/video-js.css";
import { useSceneClips } from "../../api/hooks/useSceneClips";
import { useUserSettings } from "../../api/hooks/useUserSettings";
import { useScenePlayer } from "../../contexts/ScenePlayerContext";
import { usePlaylistMediaKeys } from "../../hooks/useMediaKeys";
import { useQueueNavigation } from "../../hooks/useQueueNavigation";
import { useWatchHistory } from "../../hooks/useWatchHistory";
import { makeCompositeKey } from "../../utils/compositeKey";
import "./VideoPlayer.css";
import type { ClipMarkerInput } from "./plugins/markers";
import { useOrientationFullscreen } from "./useOrientationFullscreen";
import { useVideoPlayer } from "./useVideoPlayer";

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
 * - Read the play threshold from the user-settings query
 * - Render video element and loading overlay
 *
 * DATA FLOW:
 * - ScenePlayerContext provides scene, playlist and control state
 * - Hooks manage side effects and player lifecycle
 * - Watch history tracks playback progress
 */
const VideoPlayer = () => {
  const location = useLocation();

  const videoRef = useRef<HTMLDivElement | null>(null); // Container div (Video.js element appended here)
  const playerRef = useRef<any>(null); // Video.js player instance
  const hasResumedRef = useRef(false); // Prevent double-resume
  const initialResumeTimeRef = useRef<number | null>(null); // Capture resume time once

  // The shared user-settings query: one request per session, not one per scene
  const { data: userSettings } = useUserSettings();
  const minimumPlayPercent = userSettings?.settings.minimumPlayPercent ?? 20;

  // ============================================================================
  // CONTEXT
  // ============================================================================
  const {
    scene: rawScene,
    ready,
    shouldAutoplay,
    playlist,
    currentIndex,
    autoplayNext,
    repeat,
    restartCount,
    queueSteps,
    dispatch,
    registerPlayer,
    requested,
  } = useScenePlayer();
  const { next, prev } = useQueueNavigation();

  const scene = rawScene;

  const firstFile = scene?.files?.[0];

  // Calculate aspect ratio from actual video dimensions
  const videoWidth = firstFile?.width || 1920;
  const videoHeight = firstFile?.height || 1080;
  const aspectRatio = `${videoWidth} / ${videoHeight}`;

  // The scene's clips, shared with the details panel. The query is keyed by
  // the scene and its instance, so an answer for a scene the user has left
  // never reaches this one's timeline.
  const { data: clipsAnswer } = useSceneClips(
    scene?.id ?? "",
    scene?.instanceId ?? ""
  );
  const clips: ClipMarkerInput[] | undefined = clipsAnswer?.clips;

  // Add clip markers to timeline using the markers plugin
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const markersPlugin = player.markers?.();
    if (!markersPlugin) return;

    // Clear existing markers before adding new ones
    markersPlugin.clearMarkers();

    // Every clip gets a dot; one with no generated preview is drawn hollow
    if (clips && clips.length > 0) {
      markersPlugin.addClipMarkers(clips);
    }
  }, [clips]);

  // ============================================================================
  // WATCH HISTORY TRACKING
  // ============================================================================
  const { watchHistory, loading: loadingWatchHistory } = useWatchHistory(
    scene?.id ?? "",
    scene?.instanceId ?? ""
  );

  // ============================================================================
  // CUSTOM HOOKS: VIDEO PLAYER LOGIC
  // ============================================================================

  // Consolidated hook: Manages all Video.js player operations
  useVideoPlayer({
    videoRef,
    playerRef,
    scene,
    ready,
    shouldAutoplay,
    playlist,
    currentIndex,
    autoplayNext,
    repeat,
    restartCount,
    queueSteps,
    dispatch,
    nextScene: next,
    prevScene: prev,
    registerPlayer,
    location,
    sceneRequest: requested
      ? makeCompositeKey(requested.sceneId, requested.instanceId)
      : null,
    hasResumedRef,
    initialResumeTimeRef,
    watchHistory,
    loadingWatchHistory,
    minimumPlayPercent,
  });

  // Media keys for playlist navigation
  // Always enabled - shortcuts check playerRef.current before executing
  usePlaylistMediaKeys({
    playerRef,
    playlist,
    playNext: next,
    playPrevious: prev,
    enabled: true,
    // Keys act only while focus is in the player's element or on nothing
    root: () =>
      (playerRef.current as { el(): Element | null } | null)?.el() ?? null,
  });

  // Auto-fullscreen on mobile orientation change
  useOrientationFullscreen(playerRef, scene?.id, true);

  // Listen for seekToTime events (e.g., from ClipList clicks)
  useEffect(() => {
    const handleSeekToTime = (event: any) => {
      const { seconds } = event.detail;
      if (playerRef.current && typeof seconds === "number") {
        playerRef.current.currentTime(seconds);
      }
    };

    window.addEventListener("seekToTime", handleSeekToTime);
    return () => {
      window.removeEventListener("seekToTime", handleSeekToTime);
    };
  }, []);

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

        {/* Loading overlay until the scene's data arrives */}
        {!scene && (
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
                Loading scene...
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default VideoPlayer;
