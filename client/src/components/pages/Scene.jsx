import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ScenePlayerProvider,
  useScenePlayer,
} from "../../contexts/ScenePlayerContext.jsx";
import { useInitialFocus } from "../../hooks/useFocusTrap.js";
import { useNavigationState } from "../../hooks/useNavigationState.js";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { canDirectPlayVideo } from "../../utils/videoFormat.js";
import PlaylistSidebar from "../playlist/PlaylistSidebar.jsx";
import PlaylistStatusCard from "../playlist/PlaylistStatusCard.jsx";
import {
  Button,
  ExternalPlayerButton,
  Navigation,
  RecommendedSidebar,
  ScenesLikeThis,
} from "../ui/index.js";
import { GalleryGrid, GroupGrid } from "../grids/index.js";
import PlaybackControls from "../video-player/PlaybackControls.jsx";
import VideoPlayer from "../video-player/VideoPlayer.jsx";
import ViewInStashButton from "../ui/ViewInStashButton.jsx";
import SceneDetails from "./SceneDetails.jsx";
import TabNavigation, { TAB_COUNT_LOADING } from "../ui/TabNavigation.jsx";

// Inner component that reads from context
const SceneContent = () => {
  const navigate = useNavigate();
  const pageRef = useRef(null);
  const leftColumnRef = useRef(null);

  // Read state from context
  const { scene, sceneLoading, sceneError, playlist } = useScenePlayer();

  // Navigation state for back button
  const { goBack, backButtonText } = useNavigationState();

  // Set page title to scene title (with fallback to filename)
  const displayTitle = scene?.title || scene?.files?.[0]?.basename || "Scene";
  usePageTitle(displayTitle);

  // Set initial focus to video player when page loads (excluding back button)
  useInitialFocus(pageRef, ".vjs-big-play-button", !sceneLoading);

  // Local UI state (not managed by context)
  const [showDetails, setShowDetails] = useState(true);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [sidebarHeight, setSidebarHeight] = useState(null);
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'similar';
  // TAB_COUNT_LOADING means loading (show tab without count badge), updated by ScenesLikeThis onCountChange
  const [similarScenesCount, setSimilarScenesCount] = useState(TAB_COUNT_LOADING);

  // Dispatch zone change event to disable TV navigation on this page
  useEffect(() => {
    // Dispatch event to inform global listeners (Sidebar) that we're on a page without TV navigation zones
    window.dispatchEvent(
      new CustomEvent("tvZoneChange", {
        detail: { zone: null }, // null zone means no TV navigation active
      })
    );
  }, []); // Run once on mount

  // Reset similar scenes count when scene changes (back to loading state)
  useEffect(() => {
    setSimilarScenesCount(TAB_COUNT_LOADING);
  }, [scene?.id]);

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
          <div className="flex items-center gap-2 flex-shrink-0 self-start">
            <Button
              onClick={goBack}
              variant="secondary"
              className="inline-flex items-center gap-2"
            >
              <span>←</span>
              <span className="whitespace-nowrap">{backButtonText}</span>
            </Button>
            <ExternalPlayerButton
              sceneId={scene?.id}
              title={displayTitle}
            />
            <ViewInStashButton stashUrl={scene?.stashUrl} size={20} />
          </div>
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
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(320px,380px)] xl:grid-cols-[1fr_400px] gap-6 mb-6">
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

        {/* Tabbed Relationship Content */}
        {scene && (
          <div className="mt-6">
            <TabNavigation
              tabs={[
                { id: 'similar', label: 'Similar Scenes', count: similarScenesCount },
                ...(scene.groups && scene.groups.length > 0
                  ? [{ id: 'collections', label: 'Collections', count: scene.groups.length }]
                  : []),
                ...(scene.galleries && scene.galleries.length > 0
                  ? [{ id: 'galleries', label: 'Galleries', count: scene.galleries.length }]
                  : []),
              ]}
              defaultTab="similar"
              showSingleTab
            />

            {/* Tab Content */}
            {activeTab === 'similar' && (
              <div className="mt-6">
                <ScenesLikeThis sceneId={scene.id} onCountChange={setSimilarScenesCount} />
              </div>
            )}

            {activeTab === 'collections' && (
              <div className="mt-6">
                <GroupGrid
                  lockedFilters={{
                    group_filter: {
                      scenes: {
                        value: [parseInt(scene.id, 10)],
                        modifier: "INCLUDES"
                      }
                    }
                  }}
                  hideLockedFilters
                  emptyMessage="No collections found for this scene"
                />
              </div>
            )}

            {activeTab === 'galleries' && (
              <div className="mt-6">
                <GalleryGrid
                  lockedFilters={{
                    gallery_filter: {
                      scenes: {
                        value: [parseInt(scene.id, 10)],
                        modifier: "INCLUDES"
                      }
                    }
                  }}
                  hideLockedFilters
                  emptyMessage="No galleries found for this scene"
                />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

// Outer component that wraps everything in ScenePlayerProvider
const Scene = () => {
  const { sceneId } = useParams();
  const location = useLocation();

  // Capture location state in a ref to preserve it across re-renders
  // React Router sometimes loses state on initial render, so we store it once it arrives
  const locationStateRef = useRef(null);

  // Update ref synchronously during render (not in useEffect)
  if (location.state && !locationStateRef.current) {
    locationStateRef.current = location.state;
  }

  // Extract data from location.state (prefer current state, fall back to ref)
  const stateToUse = location.state || locationStateRef.current;
  let playlist = stateToUse?.playlist;
  const shouldResume = stateToUse?.shouldResume;

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
  const scene = stateToUse?.scene;
  const firstFile = scene?.files?.[0];
  const compatibility = firstFile ? canDirectPlayVideo(firstFile) : null;

  // Always default to "direct" quality - the auto-fallback mechanism in
  // useVideoPlayerSources will switch to 480p if browser can't play the codec
  const initialQuality = "direct";

  // Extract shouldAutoplay from location state (set by PlaylistDetail's Play button)
  const shouldAutoplayFromState = stateToUse?.shouldAutoplay ?? false;

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
