import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const api = axios.create({
  baseURL: "/api",
});

/**
 * Custom hook for managing video player state and initialization
 */
export const useVideoPlayer = (scene, playlist, compatibility) => {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const prevPlaybackModeRef = useRef(null);

  const [video, setVideo] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [transcodingStatus, setTranscodingStatus] = useState("loading");
  const [playbackMode, setPlaybackMode] = useState("auto");
  const [showPoster, setShowPoster] = useState(true);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isLoadingAPI, setIsLoadingAPI] = useState(false);
  const [isAutoFallback, setIsAutoFallback] = useState(false);
  const [isSwitchingMode, setIsSwitchingMode] = useState(false);
  const [currentPlaylistIndex, setCurrentPlaylistIndex] = useState(
    playlist?.currentIndex || 0
  );

  // Sync currentPlaylistIndex with playlist.currentIndex
  useEffect(() => {
    if (playlist && playlist.currentIndex !== undefined) {
      setCurrentPlaylistIndex(playlist.currentIndex);
    }
  }, [playlist]);

  // Reset player state when scene changes
  useEffect(() => {
    console.log("[SCENE CHANGE] Scene ID changed to:", scene.id);
    setVideo(null);
    setSessionId(null);
    setTranscodingStatus("loading");
    setShowPoster(true);
    setIsInitializing(false);
    setIsLoadingAPI(false);
    setIsAutoFallback(false);
    setIsSwitchingMode(false);

    if (playerRef.current) {
      try {
        playerRef.current.dispose();
        playerRef.current = null;
        console.log("[SCENE CHANGE] Player disposed");
      } catch (e) {
        console.warn("[SCENE CHANGE] Error disposing player:", e);
      }
    }
  }, [scene.id]);

  // Fetch video data when user clicks play
  const fetchVideoData = useCallback(
    async (force = false) => {
      console.log("[fetchVideoData] Called with:", {
        force,
        sceneId: scene.id,
        video,
        isLoadingAPI,
        playbackMode,
        compatibility: compatibility?.canDirectPlay
      });

      if (!force && (!scene.id || video || isLoadingAPI)) {
        console.log("[fetchVideoData] Early return - conditions not met:", {
          noForce: !force,
          noSceneId: !scene.id,
          hasVideo: !!video,
          isLoading: isLoadingAPI
        });
        return;
      }

      const canDirectPlay =
        playbackMode === "transcode"
          ? false
          : compatibility?.canDirectPlay || false;

      console.log(
        `[fetchVideoData] Making API call for ${
          canDirectPlay ? "direct" : "transcoded"
        } session...`
      );
      setIsLoadingAPI(true);

      try {
        if (canDirectPlay) {
          setVideo({ directPlay: true });
          setShowPoster(false);
        } else {
          const response = await api.get(
            `/video/play?sceneId=${scene.id}&direct=false&userId=user1`
          );

          console.log("API response:", response.data);
          setVideo(response.data.scene);
          setSessionId(response.data.sessionId);
          setTranscodingStatus(response.data.status);
          console.log("Set sessionId:", response.data.sessionId);
          setShowPoster(false);
        }
      } catch (error) {
        console.error("Error fetching video:", error);
      } finally {
        setIsLoadingAPI(false);
        setIsInitializing(false);
      }
    },
    [scene.id, video, isLoadingAPI, playbackMode, compatibility]
  );

  return {
    // Refs
    videoRef,
    playerRef,
    prevPlaybackModeRef,
    // State
    video,
    sessionId,
    transcodingStatus,
    playbackMode,
    showPoster,
    isInitializing,
    isLoadingAPI,
    isAutoFallback,
    isSwitchingMode,
    currentPlaylistIndex,
    // Setters
    setVideo,
    setSessionId,
    setTranscodingStatus,
    setPlaybackMode,
    setShowPoster,
    setIsInitializing,
    setIsLoadingAPI,
    setIsAutoFallback,
    setIsSwitchingMode,
    setCurrentPlaylistIndex,
    // Functions
    fetchVideoData,
    navigate,
    api,
  };
};
