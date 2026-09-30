import { useEffect, useRef, useState } from "react";
import { useLocation, useParams, useSearchParams } from "react-router-dom";
import {
  ScenePlayerProvider,
  useScenePlayer,
} from "../../contexts/ScenePlayerContext";
import { describeLookupFailure } from "../../hooks/useEntityLookup";
import { useInitialFocus } from "../../hooks/useFocusTrap";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useNavigationState } from "../../hooks/useNavigationState";
import { usePageTitle } from "../../hooks/usePageTitle";
import { makeCompositeKey } from "../../utils/compositeKey";
import { canDirectPlayVideo } from "../../utils/videoFormat";
import { GalleryGrid, GroupGrid } from "../grids/index";
import PlaylistSidebar from "../playlist/PlaylistSidebar";
import PlaylistStatusCard from "../playlist/PlaylistStatusCard";
import TabNavigation, { TAB_COUNT_LOADING } from "../ui/TabNavigation";
import ViewInStashButton from "../ui/ViewInStashButton";
import {
  Button,
  EntityNotFound,
  ExternalPlayerButton,
  LibraryInitializingBanner,
  RecommendedSidebar,
  ScenesLikeThis,
} from "../ui/index";
import PlaybackControls from "../video-player/PlaybackControls";
import VideoPlayer from "../video-player/VideoPlayer";
import SceneDetails from "./SceneDetails";

// Inner component that reads from context
const SceneContent = () => {
  const pageRef = useRef<HTMLDivElement>(null);
  const leftColumnRef = useRef<HTMLDivElement>(null);

  // Read state from context
  const { scene, sceneLoading, sceneError, playlist, retryScene } =
    useScenePlayer();

  // Navigation state for back button
  const { goBack, backButtonText } = useNavigationState();

  // The sidebar column exists from lg up; below it, mount nothing there
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  // Set page title to scene title (with fallback to filename)
  const sceneFiles = scene?.files as Array<Record<string, unknown>> | undefined;
  const displayTitle =
    (scene?.title as string) ||
    (sceneFiles?.[0]?.basename as string) ||
    "Scene";
  usePageTitle(displayTitle);

  // Set initial focus to video player when page loads (excluding back button)
  useInitialFocus(pageRef, ".vjs-big-play-button", !sceneLoading);

  // Local UI state (not managed by context)
  const [showDetails, setShowDetails] = useState(true);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [sidebarHeight, setSidebarHeight] = useState<number | null>(null);
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "similar";
  // TAB_COUNT_LOADING means loading (show tab without count badge), updated by ScenesLikeThis onCountChange
  const [similarScenesCount, setSimilarScenesCount] =
    useState(TAB_COUNT_LOADING);

  // Reset similar scenes count when scene changes (back to loading state)
  useEffect(() => {
    setSimilarScenesCount(TAB_COUNT_LOADING);
  }, [scene?.id]);

  // Seek to timestamp from URL query param (e.g., ?t=120 for 2 minutes)
  useEffect(() => {
    const startTime = searchParams.get("t");
    if (startTime && scene?.id) {
      const seconds = parseInt(startTime, 10);
      if (!isNaN(seconds) && seconds > 0) {
        // Small delay to ensure video player is ready
        const timer = setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent("seekToTime", {
              detail: { seconds },
            })
          );
        }, 500);
        return () => clearTimeout(timer);
      }
    }
    return undefined;
  }, [scene?.id, searchParams]);

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
        <EntityNotFound
          entityType="scene"
          {...describeLookupFailure(sceneError)}
          onRetry={retryScene}
        />
      </div>
    );
  }

  return (
    <div
      ref={pageRef}
      className="min-h-screen"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <LibraryInitializingBanner className="mx-4 lg:mx-6 xl:mx-8 mt-6" />

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
              sceneId={scene?.id as string}
              instanceId={scene?.instanceId as string}
              title={displayTitle}
            />
            <ViewInStashButton stashUrl={scene?.stashUrl ?? ""} size={20} />
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
                <PlaylistSidebar maxHeight={sidebarHeight ?? undefined} />
              ) : (
                isDesktop &&
                scene && (
                  <RecommendedSidebar
                    sceneId={scene.id}
                    instanceId={scene.instanceId}
                    maxHeight={sidebarHeight ?? undefined}
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
                {
                  id: "similar",
                  label: "Similar Scenes",
                  count: similarScenesCount,
                },
                ...((scene.groups as unknown[])?.length > 0
                  ? [
                      {
                        id: "collections",
                        label: "Collections",
                        count: (scene.groups as unknown[]).length,
                      },
                    ]
                  : []),
                ...((scene.galleries as unknown[])?.length > 0
                  ? [
                      {
                        id: "galleries",
                        label: "Galleries",
                        count: (scene.galleries as unknown[]).length,
                      },
                    ]
                  : []),
              ]}
              defaultTab="similar"
              showSingleTab
            />

            {/* Tab Content */}
            {activeTab === "similar" && (
              <div className="mt-6">
                <ScenesLikeThis
                  sceneId={scene.id}
                  instanceId={scene.instanceId}
                  onCountChange={setSimilarScenesCount}
                />
              </div>
            )}

            {activeTab === "collections" && (
              <div className="mt-6">
                <GroupGrid
                  lockedFilters={{
                    group_filter: {
                      scenes: {
                        value: [makeCompositeKey(scene.id, scene.instanceId)],
                        modifier: "INCLUDES",
                      },
                    },
                  }}
                  hideLockedFilters
                  emptyMessage="No collections found for this scene"
                />
              </div>
            )}

            {activeTab === "galleries" && (
              <div className="mt-6">
                <GalleryGrid
                  lockedFilters={{
                    gallery_filter: {
                      scenes: {
                        value: [makeCompositeKey(scene.id, scene.instanceId)],
                        modifier: "INCLUDES",
                      },
                    },
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

/** A player queue as the Scene page stores it for a page refresh */
interface StoredPlaylist {
  scenes?: unknown;
  [key: string]: unknown;
}

/**
 * Is this queue entry the scene the URL names? Two servers can hold the same
 * scene id, so with an instance in the URL the entry's instance (or, in a
 * queue saved before entries carried one, its scene's) must match too.
 */
function isEntryOf(
  entry: unknown,
  sceneId: string | undefined,
  instanceId: string | null
): boolean {
  if (typeof entry !== "object" || entry === null) return false;
  const {
    sceneId: entrySceneId,
    instanceId: entryInstance,
    scene,
  } = entry as { sceneId?: unknown; instanceId?: unknown; scene?: unknown };
  if (entrySceneId !== sceneId) return false;
  if (!instanceId) return true;
  const sceneInstance =
    typeof scene === "object" && scene !== null
      ? (scene as { instanceId?: unknown }).instanceId
      : undefined;
  const entryServer = entryInstance ?? sceneInstance;
  return entryServer === undefined || entryServer === instanceId;
}

/** What a navigation to a scene hands over in `location.state` */
interface SceneLocationState {
  playlist?: StoredPlaylist;
  scene?: { files?: Array<Parameters<typeof canDirectPlayVideo>[0]> };
  shouldResume?: boolean;
  shouldAutoplay?: boolean;
}

// Outer component that wraps everything in ScenePlayerProvider
const Scene = () => {
  const { sceneId } = useParams<{ sceneId: string }>();
  const location = useLocation();

  // Extract instance ID from URL query params for multi-instance support
  const searchParams = new URLSearchParams(location.search);
  const instanceId = searchParams.get("instance");

  // Capture location state in a ref to preserve it across re-renders
  // React Router sometimes loses state on initial render, so we store it once it arrives
  const locationStateRef = useRef<SceneLocationState | null>(null);

  // Update ref synchronously during render (not in useEffect)
  const navigationState = location.state as SceneLocationState | null;
  if (navigationState && !locationStateRef.current) {
    locationStateRef.current = navigationState;
  }

  // Extract data from location.state (prefer current state, fall back to ref)
  const stateToUse = navigationState ?? locationStateRef.current;
  let playlist = stateToUse?.playlist;
  const shouldResume = stateToUse?.shouldResume;

  // Persist auto-playlists to sessionStorage for page refresh support
  // Use a stable key that doesn't change when navigating between scenes
  const PLAYLIST_STORAGE_KEY = "currentPlaylist";

  // If playlist came via location.state, save it once per navigation, after
  // render. A full storage (or a browser that refuses it) only loses the
  // refresh support; the player still gets the queue from navigation state.
  const statePlaylist = stateToUse?.playlist;
  useEffect(() => {
    if (!statePlaylist) return;
    try {
      sessionStorage.setItem(
        PLAYLIST_STORAGE_KEY,
        JSON.stringify(statePlaylist)
      );
    } catch (e) {
      console.warn("Could not store the playback queue:", e);
    }
  }, [statePlaylist]);

  // If no playlist in location.state, try to restore from sessionStorage
  // This handles page refresh for auto-generated playlists
  if (!playlist) {
    try {
      const storedPlaylist = sessionStorage.getItem(PLAYLIST_STORAGE_KEY);
      if (storedPlaylist) {
        const parsed = JSON.parse(storedPlaylist) as StoredPlaylist | null;
        // Verify the current scene, on this URL's server, is in this playlist
        const currentIndex = Array.isArray(parsed?.scenes)
          ? parsed.scenes.findIndex((entry) =>
              isEntryOf(entry, sceneId, instanceId)
            )
          : -1;
        if (parsed && currentIndex >= 0) {
          // Resume the queue at the current scene
          playlist = { ...parsed, currentIndex };
        } else {
          // Scene not in stored playlist, clear it
          sessionStorage.removeItem(PLAYLIST_STORAGE_KEY);
        }
      }
    } catch (e) {
      console.error("Failed to restore stored playlist:", e);
      try {
        sessionStorage.removeItem(PLAYLIST_STORAGE_KEY);
      } catch {
        // Storage refuses even a removal: nothing left to clean up
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

  // Extract shouldAutoplay from location state (set by PlaylistDetail's Play button or clip cards)
  const shouldAutoplayFromState = stateToUse?.shouldAutoplay ?? false;

  return (
    <ScenePlayerProvider
      sceneId={sceneId ?? ""}
      instanceId={instanceId ?? undefined}
      playlist={playlist ?? undefined}
      shouldResume={shouldResume ?? undefined}
      compatibility={compatibility ?? undefined}
      initialQuality={initialQuality}
      initialShouldAutoplay={shouldAutoplayFromState}
    >
      <SceneContent />
    </ScenePlayerProvider>
  );
};

export default Scene;
