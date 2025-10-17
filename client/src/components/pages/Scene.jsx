import { useState, useEffect } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { canDirectPlayVideo } from "../../utils/videoFormat.js";
import Navigation from "../ui/Navigation.jsx";
import VideoPlayer from "../video-player/VideoPlayer.jsx";
import PlaybackControls from "../video-player/PlaybackControls.jsx";
import SceneDetails from "./SceneDetails.jsx";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { libraryApi } from "../../services/api.js";
import LoadingSpinner from "../ui/LoadingSpinner.jsx";

const Scene = () => {
  const { sceneId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  // Get scene and playlist from navigation state (preferred for performance)
  const sceneFromState = location.state?.scene;
  const playlistFromState = location.state?.playlist;

  // Local state for fetched data
  const [scene, setScene] = useState(sceneFromState);
  const [playlist, setPlaylist] = useState(playlistFromState);
  const [isLoading, setIsLoading] = useState(!sceneFromState);
  const [fetchError, setFetchError] = useState(null);

  // Set page title to scene title
  usePageTitle(scene?.title || "Scene");

  const [showDetails, setShowDetails] = useState(true);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [quality, setQuality] = useState("direct");

  // Fetch scene data if not provided via navigation state
  useEffect(() => {
    const fetchScene = async () => {
      // If we already have scene data from navigation, skip fetching
      if (sceneFromState) {
        return;
      }

      try {
        setIsLoading(true);
        setFetchError(null);
        const response = await libraryApi.findScenes({ ids: [sceneId] });
        const sceneData = response?.findScenes?.scenes?.[0];

        if (sceneData) {
          setScene(sceneData);
        } else {
          setFetchError("Scene not found");
        }
      } catch (error) {
        console.error("Error fetching scene:", error);
        setFetchError(error.message || "Failed to load scene");
      } finally {
        setIsLoading(false);
      }
    };

    fetchScene();
  }, [sceneId, sceneFromState]);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: "var(--bg-primary)" }}>
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
      <div className="min-h-screen" style={{ backgroundColor: "var(--bg-primary)" }}>
        <Navigation />
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h2 className="text-xl mb-2" style={{ color: "var(--text-primary)" }}>
              {fetchError || "Scene not found"}
            </h2>
            <p style={{ color: "var(--text-secondary)" }}>Scene ID: {sceneId}</p>
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
    <div className="min-h-screen" style={{ backgroundColor: "var(--bg-primary)" }}>
      {/* Full Navigation Header */}
      <Navigation />

      {/* Video Player Header */}
      <header
        className="container-fluid py-3"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderBottom: "1px solid var(--border-color)",
        }}
      >
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="btn"
            style={{
              backgroundColor: "var(--bg-card)",
              border: "1px solid var(--border-color)",
              padding: "8px 16px",
            }}
          >
            ← Back
          </button>
          <h1
            className="text-2xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            {scene.title}
          </h1>
          <div></div>
        </div>
      </header>

      {/* Main content area */}
      <main className="container-fluid">
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
          onReset={() => window.location.reload()}
        />

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
