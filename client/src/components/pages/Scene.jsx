import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ScenePlayerProvider,
  useScenePlayer,
} from "../../contexts/ScenePlayerContext.jsx";
import { useInitialFocus } from "../../hooks/useFocusTrap.js";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { canDirectPlayVideo } from "../../utils/videoFormat.js";
import PlaylistSidebar from "../playlist/PlaylistSidebar.jsx";
import PlaylistStatusCard from "../playlist/PlaylistStatusCard.jsx";
import {
  Button,
  Navigation,
  RecommendedSidebar,
  ScenesLikeThis,
} from "../ui/index.js";
import PlaybackControls from "../video-player/PlaybackControls.jsx";
import VideoPlayer from "../video-player/VideoPlayer.jsx";
import SceneDetails from "./SceneDetails.jsx";

// Inner component that reads from context
const SceneContent = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const pageRef = useRef(null);
  const leftColumnRef = useRef(null);

  // Read state from context
  const { scene, sceneLoading, sceneError, playlist } = useScenePlayer();

  // Set page title to scene title (with fallback to filename)
  const displayTitle = scene?.title || scene?.files?.[0]?.basename || "Scene";
  usePageTitle(displayTitle);

  // Set initial focus to video player when page loads (excluding back button)
  useInitialFocus(pageRef, ".vjs-big-play-button", !sceneLoading);

  // Local UI state (not managed by context)
  const [showDetails, setShowDetails] = useState(true);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [sidebarHeight, setSidebarHeight] = useState(null);

  // Measure left column height and sync to sidebar
  useEffect(() => {
    if (!leftColumnRef.current) return;

    const updateSidebarHeight = () => {
      // Guard against ref being null (can happen during unmount)
      if (!leftColumnRef.current) return;

      const height = leftColumnRef.current.offsetHeight;
      setSidebarHeight(height);
    };

    // Initial measurement
    updateSidebarHeight();

    // Watch for size changes using ResizeObserver
    const resizeObserver = new ResizeObserver(updateSidebarHeight);
    resizeObserver.observe(leftColumnRef.current);

    // Also update on window resize
    window.addEventListener("resize", updateSidebarHeight);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateSidebarHeight);
    };
  }, [scene, playlist]); // Re-measure when scene or playlist changes

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
        {/* Two-column layout on desktop, single column on mobile */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6 mb-6">
          {/* Left Column: Video + Controls */}
          <div ref={leftColumnRef} className="flex flex-col gap-2">
            <VideoPlayer />
            <PlaybackControls />

            {/* Mobile-only playlist card (below controls on small screens) */}
            {playlist && (
              <div className="lg:hidden">
                <PlaylistStatusCard />
              </div>
            )}
          </div>

          {/* Right Column: Sidebar (only visible on lg+) */}
          <aside className="hidden lg:block">
            <div className="sticky top-4 space-y-4">
              {/* Show playlist sidebar if we have a playlist, otherwise show recommendations */}
              {playlist ? (
                <PlaylistSidebar maxHeight={sidebarHeight} />
              ) : (
                scene && (
                  <RecommendedSidebar
                    sceneId={scene.id}
                    maxHeight={sidebarHeight}
                  />
                )
              )}
            </div>
          </aside>
        </div>

        {/* Full-width sections below (all screen sizes) */}
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

  // Extract shouldAutoplay from location state (set by PlaylistDetail's Play button)
  const shouldAutoplayFromState = location.state?.shouldAutoplay ?? false;

  return (
    <ScenePlayerProvider
      sceneId={sceneId}
      playlist={playlist}
      shouldResume={shouldResume}
      compatibility={compatibility}
      initialQuality={initialQuality}
      initialShouldAutoplay={shouldAutoplayFromState}
    >
      <SceneContent />
    </ScenePlayerProvider>
  );
};

export default Scene;
