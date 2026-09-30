import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { NormalizedScene } from "@peek/shared-types";
import { useQuery } from "@tanstack/react-query";
import { PlayCircle } from "lucide-react";
import { libraryApi } from "../../api";
import {
  isLibraryInitializing,
  useLibraryReady,
} from "../../api/hooks/useLibraryReady";
import { queryKeys } from "../../api/queryKeys";
import { useConfig } from "../../contexts/ConfigContext";
import { useAllWatchHistory } from "../../hooks/useWatchHistory";
import { makeCompositeKey } from "../../utils/compositeKey";
import { getEntityPath } from "../../utils/entityLinks";
import SceneCarousel from "./SceneCarousel";

interface WatchHistoryEntry {
  sceneId: string;
  instanceId: string;
  resumeTime?: number;
  playCount?: number;
  lastPlayedAt?: string | null;
  playDuration?: number;
  [key: string]: unknown;
}

interface SceneWithProgress extends NormalizedScene {
  watchHistory: WatchHistoryEntry | null;
  resumeTime: number;
  playCount: number;
  lastPlayedAt: string | null;
}

/** Scenes watched less than this share of their length are left out. */
const MIN_WATCH_PERCENT = 2;

/**
 * Continue Watching carousel component
 * Shows scenes that have been partially watched with resume times. While the
 * library is initializing it shows its loading state and asks nothing.
 */
interface Props {
  selectedScenes?: NormalizedScene[];
  onToggleSelect?: (scene: NormalizedScene) => void;
}

const ContinueWatchingCarousel = ({
  selectedScenes = [],
  onToggleSelect,
}: Props) => {
  const navigate = useNavigate();
  const { hasMultipleInstances } = useConfig();
  const { ready } = useLibraryReady();
  const {
    data: watchHistoryList,
    loading: loadingHistory,
    error,
  } = useAllWatchHistory({
    inProgress: true,
    limit: 12,
  });

  const whList = watchHistoryList as WatchHistoryEntry[];
  // "id:instanceId" refs: scene ids repeat across servers
  const sceneRefs = useMemo(
    () => whList.map((wh) => makeCompositeKey(wh.sceneId, wh.instanceId)),
    [whList]
  );

  // The full scene of each watch history entry
  const {
    data: fetchedScenes,
    isLoading: loadingScenes,
    error: scenesFetchError,
  } = useQuery({
    queryKey: queryKeys.homeCarousels.continueWatching(sceneRefs),
    queryFn: async ({ signal }) => {
      const response = (await libraryApi.findScenes(
        { ids: sceneRefs },
        signal
      )) as { findScenes?: { scenes?: NormalizedScene[] } };
      return response.findScenes?.scenes ?? [];
    },
    enabled: ready && !loadingHistory && sceneRefs.length > 0,
  });

  const scenes = useMemo((): SceneWithProgress[] => {
    const historyByScene = new Map(
      whList.map((wh) => [makeCompositeKey(wh.sceneId, wh.instanceId), wh])
    );
    const withProgress = (fetchedScenes ?? []).map((scene) => {
      const watchHistory = historyByScene.get(
        makeCompositeKey(scene.id, scene.instanceId)
      );
      return {
        ...scene,
        watchHistory: watchHistory ?? null,
        resumeTime: watchHistory?.resumeTime || 0,
        playCount: watchHistory?.playCount || 0,
        lastPlayedAt: watchHistory?.lastPlayedAt || null,
      };
    });

    // Only scenes watched for at least 2% of their length: an accidental
    // click does not clutter Continue Watching
    const watched = withProgress.filter((scene) => {
      const duration = scene.files?.[0]?.duration;
      const playDuration = scene.watchHistory?.playDuration;
      if (!duration || !playDuration) return false;
      return (playDuration / duration) * 100 >= MIN_WATCH_PERCENT;
    });

    // Most recently played first
    return watched.sort((a, b) => {
      const dateA = a.lastPlayedAt ? new Date(a.lastPlayedAt) : new Date(0);
      const dateB = b.lastPlayedAt ? new Date(b.lastPlayedAt) : new Date(0);
      return dateB.getTime() - dateA.getTime();
    });
  }, [fetchedScenes, whList]);

  // Waiting for the library only matters when there are scenes to show
  const initializing =
    sceneRefs.length > 0 && (!ready || isLibraryInitializing(scenesFetchError));
  const loading = loadingHistory || loadingScenes;

  const handleSceneClick = (scene: NormalizedScene) => {
    const currentIndex = scenes.findIndex(
      (s) => s.id === scene.id && s.instanceId === scene.instanceId
    );

    void navigate(
      getEntityPath(
        "scene",
        scene as unknown as Parameters<typeof getEntityPath>[1],
        hasMultipleInstances
      ),
      {
        state: {
          scene,
          fromPageTitle: "Home",
          shouldResume: true, // Auto-resume from continue watching
          playlist: {
            id: "virtual-carousel",
            name: "Continue Watching",
            shuffle: false,
            repeat: "none",
            scenes: scenes.map((s, idx) => ({
              sceneId: s.id,
              instanceId: s.instanceId,
              scene: s,
              position: idx,
            })),
            currentIndex: currentIndex >= 0 ? currentIndex : 0,
          },
        },
      }
    );
    return true; // Prevent fallback navigation in SceneCard
  };

  // Don't show carousel if error (non-initialization) or no scenes
  if (error || (scenesFetchError && !initializing)) {
    console.error(
      "Continue Watching error (non-initialization):",
      error || scenesFetchError
    );
    return null;
  }
  if (!loading && !initializing && scenes.length === 0) {
    return null;
  }

  return (
    <SceneCarousel
      loading={loading || initializing}
      title="Continue Watching"
      titleIcon={<PlayCircle className="w-6 h-6" color="#10b981" />}
      scenes={scenes}
      onSceneClick={handleSceneClick}
      showProgress={true}
      selectedScenes={selectedScenes}
      onToggleSelect={onToggleSelect}
      seeMoreUrl="/watch-history"
    />
  );
};

export default ContinueWatchingCarousel;
