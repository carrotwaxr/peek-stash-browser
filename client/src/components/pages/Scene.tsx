import { useEffect, useRef, useState } from "react";
import { useLocation, useParams, useSearchParams } from "react-router-dom";
import {
  ScenePlayerProvider,
  useScenePlayer,
} from "../../contexts/ScenePlayerContext";
import { useAuth } from "../../hooks/useAuth";
import { describeLookupFailure } from "../../hooks/useEntityLookup";
import { useInitialFocus } from "../../hooks/useFocusTrap";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useNavigationState } from "../../hooks/useNavigationState";
import { usePageTitle } from "../../hooks/usePageTitle";
import { makeCompositeKey } from "../../utils/compositeKey";
import { readSceneLocationState } from "../../utils/playbackQueue";
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

  // Seek to timestamp from URL query param (e.g., ?t=120 for 2 minutes),
  // once per scene and time: a tab click keeps ?t= in the URL and must not
  // seek again
  const startTime = searchParams.get("t");
  const sceneKey = scene ? makeCompositeKey(scene.id, scene.instanceId) : null;
  const seekedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!startTime || !sceneKey) return undefined;
    const seconds = parseInt(startTime, 10);
    if (isNaN(seconds) || seconds <= 0) return undefined;
    const seek = `${sceneKey}@${startTime}`;
    if (seekedRef.current === seek) return undefined;
    // Small delay to ensure video player is ready
    const timer = setTimeout(() => {
      seekedRef.current = seek;
      window.dispatchEvent(
        new CustomEvent("seekToTime", {
          detail: { seconds },
        })
      );
    }, 500);
    return () => clearTimeout(timer);
  }, [sceneKey, startTime]);

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

            {/* Below lg only: the sidebar replaces the card from lg up, and a
                mounted card loads its thumbnails even when hidden */}
            {playlist && !isDesktop && (
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

// Outer component that wraps everything in ScenePlayerProvider
const Scene = () => {
  const { sceneId } = useParams<{ sceneId: string }>();
  const location = useLocation();

  // Extract instance ID from URL query params for multi-instance support
  const searchParams = new URLSearchParams(location.search);
  const instanceId = searchParams.get("instance");

  // The history entry's state is the only source: the queue a navigation
  // handed over, or the one the player wrote back into this entry (a reload
  // or Back finds it there). An entry opened without state has no queue.
  // A queue another user left in the entry (sign-out, sign-in, Back) is none.
  const { user } = useAuth();
  const { playlist, shouldResume, shouldAutoplay } = readSceneLocationState(
    location.state,
    user?.id
  );

  return (
    <ScenePlayerProvider
      sceneId={sceneId ?? ""}
      instanceId={instanceId}
      playlist={playlist ?? null}
      shouldResume={shouldResume ?? false}
      initialShouldAutoplay={shouldAutoplay ?? false}
    >
      <SceneContent />
    </ScenePlayerProvider>
  );
};

export default Scene;
