import { useState, useEffect } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { canDirectPlayVideo } from "../../utils/videoFormat.js";
import Navigation from "../ui/Navigation.jsx";
import VideoPlayer from "../video-player/VideoPlayer.jsx";
import PlaybackControls from "../video-player/PlaybackControls.jsx";
import SceneDetails from "./SceneDetails.jsx";
import { usePageTitle } from "../../hooks/usePageTitle.js";

const Scene = () => {
  const { sceneId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  // Get scene and playlist from navigation state
  const scene = location.state?.scene;
  const playlist = location.state?.playlist;

  // Set page title to scene title
  usePageTitle(scene?.title || "Scene");

  const [showDetails, setShowDetails] = useState(true);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [playbackMode, setPlaybackMode] = useState("auto");
  const [transcodingStatus, setTranscodingStatus] = useState("loading");

  // Redirect if scene data is missing
  useEffect(() => {
    if (!scene) {
      console.error("No scene data provided, redirecting to home");
      navigate("/");
    }
  }, [scene, navigate]);

  if (!scene) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: "var(--bg-primary)" }}>
        <Navigation />
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h2 className="text-xl mb-2" style={{ color: "var(--text-primary)" }}>
              Scene not found
            </h2>
            <p style={{ color: "var(--text-secondary)" }}>Scene ID: {sceneId}</p>
            <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>
              Try navigating from the scenes or home page
            </p>
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
          externalPlaybackMode={playbackMode}
          externalSetPlaybackMode={setPlaybackMode}
        />

        {/* Playback Controls */}
        <PlaybackControls
          scene={scene}
          playlist={playlist}
          currentPlaylistIndex={playlist?.currentIndex || 0}
          playbackMode={playbackMode}
          setPlaybackMode={setPlaybackMode}
          compatibility={compatibility}
          transcodingStatus={transcodingStatus}
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
