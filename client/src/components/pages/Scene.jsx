import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { canDirectPlayVideo } from "../../utils/videoFormat.js";
import Navigation from "../ui/Navigation.jsx";
import VideoPlayer from "../video-player/VideoPlayer.jsx";
import PlaybackControls from "../video-player/PlaybackControls.jsx";
import SceneDetails from "./SceneDetails.jsx";
import PlaylistStatusCard from "../playlist/PlaylistStatusCard.jsx";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useInitialFocus } from "../../hooks/useFocusTrap.js";
import { libraryApi } from "../../services/api.js";
import LoadingSpinner from "../ui/LoadingSpinner.jsx";

const Scene = () => {
  const { sceneId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const pageRef = useRef(null);

  // Local state for fetched data
  const [scene, setScene] = useState(location.state?.scene);
  const [playlist, setPlaylist] = useState(location.state?.playlist);
  const [isLoading, setIsLoading] = useState(!location.state?.scene);
  const [fetchError, setFetchError] = useState(null);

  // Update scene and playlist when location state changes (playlist navigation)
  useEffect(() => {
    if (location.state?.scene) {
      setScene(location.state.scene);
      setPlaylist(location.state.playlist);
      setIsLoading(false);
      setFetchError(null);
    }
  }, [location.state]);

  // Set page title to scene title (with fallback to filename)
  const displayTitle = scene?.title || scene?.files?.[0]?.basename || "Scene";
  usePageTitle(displayTitle);

  // Set initial focus to video player when page loads
  useInitialFocus(pageRef, ".vjs-big-play-button, button", !isLoading);

  const [showDetails, setShowDetails] = useState(true);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [quality, setQuality] = useState("direct");

  // Fetch scene data if not provided via navigation state
  useEffect(() => {
    const fetchScene = async () => {
      // If we already have scene data from navigation state, skip fetching
      if (location.state?.scene && location.state.scene.id === sceneId) {
        return;
      }

      try {
        setIsLoading(true);
        setFetchError(null);
        const sceneData = await libraryApi.findSceneById(sceneId);

        if (sceneData) {
          setScene(sceneData);
        } else {
          setFetchError("Scene not found");
        }
      } catch (error) {
        setFetchError(error.message || "Failed to load scene");
      } finally {
        setIsLoading(false);
      }
    };

    fetchScene();
  }, [sceneId, location.state]);

  // Loading state
  if (isLoading) {
    return (
      <div
        className="min-h-screen"
        style={{ backgroundColor: "var(--bg-primary)" }}
      >
        <Navigation />
        <div className="flex items-center justify-center min-h-screen">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  // Error or scene not found
  if (fetchError || !scene) {
    return (
      <div
        className="min-h-screen"
        style={{ backgroundColor: "var(--bg-primary)" }}
      >
        <Navigation />
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h2
              className="text-xl mb-2"
              style={{ color: "var(--text-primary)" }}
            >
              {fetchError || "Scene not found"}
            </h2>
            <p style={{ color: "var(--text-secondary)" }}>
              Scene ID: {sceneId}
            </p>
            <button
              onClick={() => navigate("/scenes")}
              className="mt-4 px-4 py-2 rounded-lg"
              style={{
                backgroundColor: "var(--accent-color)",
                color: "white",
              }}
            >
              Browse Scenes
            </button>
          </div>
        </div>
      </div>
    );
  }

  const firstFile = scene.files?.[0];
  const compatibility = firstFile ? canDirectPlayVideo(firstFile) : null;

  return (
    <div
      ref={pageRef}
      className="min-h-screen"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      {/* Full Navigation Header */}
      <Navigation />

      {/* Video Player Header */}
      <header className="container-fluid py-3 mt-6 mb-6">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 px-4 py-3 rounded-md text-sm transition-colors flex-shrink-0 self-start"
            style={{
              color: "var(--accent-primary)",
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-color)",
              border: "1px solid",
            }}
          >
            <span>←</span>
            <span className="whitespace-nowrap">Back to Scenes</span>
          </button>
          <h1
            className="text-2xl font-bold line-clamp-2"
            style={{ color: "var(--text-primary)" }}
          >
            {displayTitle}
          </h1>
        </div>
      </header>

      {/* Main content area */}
      <main className="container-fluid" style={{ marginTop: 0, paddingTop: 0 }}>
        {/* Video player section */}
        <VideoPlayer
          scene={scene}
          playlist={playlist}
          compatibility={compatibility}
          firstFile={firstFile}
          externalQuality={quality}
          externalSetQuality={setQuality}
        />

        {/* Playback Controls */}
        <PlaybackControls
          scene={scene}
          playlist={playlist}
          currentPlaylistIndex={playlist?.currentIndex || 0}
          quality={quality}
          setQuality={setQuality}
        />

        {/* Playlist Status Card */}
        {playlist && (
          <PlaylistStatusCard
            playlist={playlist}
            currentIndex={playlist.currentIndex || 0}
          />
        )}

        {/* Scene Details */}
        <SceneDetails
          scene={scene}
          firstFile={firstFile}
          compatibility={compatibility}
          showDetails={showDetails}
          setShowDetails={setShowDetails}
          showTechnicalDetails={showTechnicalDetails}
          setShowTechnicalDetails={setShowTechnicalDetails}
        />
      </main>
    </div>
  );
};

export default Scene;
