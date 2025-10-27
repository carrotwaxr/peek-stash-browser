import { useState, useRef, useEffect } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { canDirectPlayVideo } from "../../utils/videoFormat.js";
import {
  ScenePlayerProvider,
  useScenePlayer,
} from "../../contexts/ScenePlayerContext.jsx";
import Navigation from "../ui/Navigation.jsx";
import VideoPlayer from "../video-player/VideoPlayer.jsx";
import PlaybackControls from "../video-player/PlaybackControls.jsx";
import SceneDetails from "./SceneDetails.jsx";
import PlaylistStatusCard from "../playlist/PlaylistStatusCard.jsx";
import ScenesLikeThis from "../ui/ScenesLikeThis.jsx";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useInitialFocus } from "../../hooks/useFocusTrap.js";
import Button from "../ui/Button.jsx";

// Inner component that reads from context
const SceneContent = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const pageRef = useRef(null);

  // Read state from context
  const { scene, sceneLoading, sceneError, playlist } = useScenePlayer();

  // Set page title to scene title (with fallback to filename)
  const displayTitle = scene?.title || scene?.files?.[0]?.basename || "Scene";
  usePageTitle(displayTitle);

  // Set initial focus to video player when page loads
  useInitialFocus(pageRef, ".vjs-big-play-button, button", !sceneLoading);

  // Local UI state (not managed by context)
  const [showDetails, setShowDetails] = useState(true);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  // Only show full-page error for critical failures (no scene at all)
  // Let individual components handle loading states
  if (sceneError && !scene) {
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
              {sceneError?.message || "Scene not found"}
            </h2>
            <Button onClick={() => navigate("/scenes")} variant="primary">
              Browse Scenes
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={pageRef}
      className="min-h-screen"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      {/* Full Navigation Header */}
      <Navigation />

      {/* Spacer to prevent content from going under fixed navbar */}
      <div style={{ height: '60px' }} />

      {/* Video Player Header */}
      <header className="w-full py-8 px-4 lg:px-6 xl:px-8">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <Button
            onClick={() => {
              // If we have a referrer URL with filters, navigate to it
              // Otherwise use browser back
              if (location.state?.referrerUrl) {
                navigate(location.state.referrerUrl);
              } else {
                navigate(-1);
              }
            }}
            variant="secondary"
            className="inline-flex items-center gap-2 flex-shrink-0 self-start"
          >
            <span>←</span>
            <span className="whitespace-nowrap">Back to Scenes</span>
          </Button>
          <h1
            className="text-2xl font-bold line-clamp-2"
            style={{ color: "var(--text-primary)" }}
          >
            {sceneLoading && !scene ? "Loading..." : displayTitle}
          </h1>
        </div>
      </header>

      {/* Main content area */}
      <main className="w-full px-4 lg:px-6 xl:px-8">
        {/* Video player section */}
        <VideoPlayer />

        {/* Playback Controls */}
        <PlaybackControls />

        {/* Playlist Status Card */}
        {playlist && <PlaylistStatusCard />}

        {/* Scene Details */}
        <SceneDetails
          showDetails={showDetails}
          setShowDetails={setShowDetails}
          showTechnicalDetails={showTechnicalDetails}
          setShowTechnicalDetails={setShowTechnicalDetails}
        />

        {/* Scenes Like This - lazy loaded */}
        {scene && <ScenesLikeThis sceneId={scene.id} />}
      </main>
    </div>
  );
};

// Outer component that wraps everything in ScenePlayerProvider
const Scene = () => {
  const { sceneId } = useParams();
  const location = useLocation();

  // Extract data from location.state
  let playlist = location.state?.playlist;
  const shouldResume = location.state?.shouldResume;

  // Persist auto-playlists to sessionStorage for page refresh support
  // Use a stable key that doesn't change when navigating between scenes
  const PLAYLIST_STORAGE_KEY = "currentPlaylist";

  // If playlist came via location.state, save it
  if (playlist) {
    sessionStorage.setItem(PLAYLIST_STORAGE_KEY, JSON.stringify(playlist));
  }

  // If no playlist in location.state, try to restore from sessionStorage
  // This handles page refresh for auto-generated playlists
  if (!playlist) {
    const storedPlaylist = sessionStorage.getItem(PLAYLIST_STORAGE_KEY);
    if (storedPlaylist) {
      try {
        const parsed = JSON.parse(storedPlaylist);
        // Verify the current scene is actually in this playlist
        const sceneInPlaylist = parsed.scenes?.some(
          (s) => s.sceneId === sceneId
        );
        if (sceneInPlaylist) {
          playlist = parsed;
          // Update currentIndex to match the current scene
          const currentIndex = parsed.scenes.findIndex(
            (s) => s.sceneId === sceneId
          );
          if (currentIndex >= 0) {
            playlist.currentIndex = currentIndex;
          }
        } else {
          // Scene not in stored playlist, clear it
          sessionStorage.removeItem(PLAYLIST_STORAGE_KEY);
        }
      } catch (e) {
        console.error("Failed to parse stored playlist:", e);
        sessionStorage.removeItem(PLAYLIST_STORAGE_KEY);
      }
    }
  }

  // Cleanup: Clear playlist when navigating away from scene player
  useEffect(() => {
    return () => {
      // Only clear if we're navigating away, not just to another scene
      // This is handled by checking if location.state has a playlist on next navigation
    };
  }, []);

  // Compute compatibility if scene data is available from navigation state
  // (only available when navigating from scene cards, not on direct page load)
  const scene = location.state?.scene;
  const firstFile = scene?.files?.[0];
  const compatibility = firstFile ? canDirectPlayVideo(firstFile) : null;

  // Always default to "direct" quality - the auto-fallback mechanism in
  // useVideoPlayerSources will switch to 480p if browser can't play the codec
  const initialQuality = "direct";

  return (
    <ScenePlayerProvider
      sceneId={sceneId}
      playlist={playlist}
      shouldResume={shouldResume}
      compatibility={compatibility}
      initialQuality={initialQuality}
    >
      <SceneContent />
    </ScenePlayerProvider>
  );
};

export default Scene;
