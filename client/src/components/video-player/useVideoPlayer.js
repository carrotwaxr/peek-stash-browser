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
  const prevQualityRef = useRef(null);

  const [video, setVideo] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [quality, setQuality] = useState("direct");
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
    setShowPoster(true);
    setIsInitializing(false);
    setIsLoadingAPI(false);
    setIsAutoFallback(false);
    setIsSwitchingMode(false);

    if (playerRef.current) {
      const player = playerRef.current;
      playerRef.current = null;
      console.log("[SCENE CHANGE] Player disposed");

      // Dispose asynchronously to avoid DOM conflicts with React
      setTimeout(() => {
        try {
          player.dispose();
        } catch (e) {
          console.warn("[SCENE CHANGE] Error disposing player:", e);
        }
      }, 0);
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
        quality,
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

      const isDirectPlay = quality === "direct";

      console.log(
        `[fetchVideoData] Making API call for ${
          isDirectPlay ? "direct" : `transcoded (${quality})`
        } session...`
      );
      setIsLoadingAPI(true);

      try {
        if (isDirectPlay) {
          setVideo({ directPlay: true });
          setShowPoster(false);
        } else {
          const response = await api.get(
            `/video/play?sceneId=${scene.id}&quality=${quality}`
          );

          console.log("API response:", response.data);
          setVideo(response.data.scene);
          setSessionId(response.data.sessionId);
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
    [scene.id, video, isLoadingAPI, quality, compatibility]
  );

  return {
    // Refs
    videoRef,
    playerRef,
    prevQualityRef,
    // State
    video,
    sessionId,
    quality,
    showPoster,
    isInitializing,
    isLoadingAPI,
    isAutoFallback,
    isSwitchingMode,
    currentPlaylistIndex,
    // Setters
    setVideo,
    setSessionId,
    setQuality,
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
