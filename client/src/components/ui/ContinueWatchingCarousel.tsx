import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PlayCircle } from "lucide-react";
import { useAllWatchHistory } from "../../hooks/useWatchHistory";
import { useConfig } from "../../contexts/ConfigContext";
import { getEntityPath } from "../../utils/entityLinks";
import { libraryApi } from "../../api";
import { ApiError } from "../../api/client";
import SceneCarousel from "./SceneCarousel";
import type { NormalizedScene } from "@peek/shared-types";

interface WatchHistoryEntry {
  sceneId: string;
  resumeTime?: number;
  playCount?: number;
  lastPlayedAt?: string | null;
  playDuration?: number;
  [key: string]: unknown;
}

/**
 * Continue Watching carousel component
 * Shows scenes that have been partially watched with resume times
 */
interface Props {
  selectedScenes?: NormalizedScene[];
  onToggleSelect?: (scene: NormalizedScene) => void;
  onInitializing?: (isInitializing: boolean) => void;
}

const ContinueWatchingCarousel = ({
  selectedScenes = [],
  onToggleSelect,
  onInitializing,
}: Props) => {
  const navigate = useNavigate();
  const { hasMultipleInstances } = useConfig();
  const {
    data: watchHistoryList,
    loading: loadingHistory,
    error,
    refresh,
  } = useAllWatchHistory({
    inProgress: true,
    limit: 12,
  });

  interface SceneWithProgress extends NormalizedScene {
    watchHistory: WatchHistoryEntry | null;
    resumeTime: number;
    playCount: number;
    lastPlayedAt: string | null;
  }

  const [scenes, setScenes] = useState<SceneWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [retryTrigger, setRetryTrigger] = useState(0);
  const [scenesFetchError, setScenesFetchError] = useState<ApiError | null>(null);

  // Fetch full scene data for each watch history entry
  useEffect(() => {
    const fetchScenes = async () => {
      if (loadingHistory) {
        return;
      }

      if (!watchHistoryList || watchHistoryList.length === 0) {
        setScenes([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Extract scene IDs from watch history
        const whList = watchHistoryList as WatchHistoryEntry[];
        const sceneIds = whList.map((wh) => wh.sceneId);

        // Fetch scenes in bulk
        const response = await libraryApi.findScenes({ ids: sceneIds });
        const fetchedScenes = (response as { findScenes?: { scenes?: NormalizedScene[] } })?.findScenes?.scenes || [];

        // Match scenes with watch history data and add progress info
        const scenesWithProgress = fetchedScenes.map((scene: NormalizedScene) => {
          const watchHistory = whList.find(
            (wh) => wh.sceneId === scene.id
          );
          return {
            ...scene,
            watchHistory: watchHistory || null,
            resumeTime: watchHistory?.resumeTime || 0,
            playCount: watchHistory?.playCount || 0,
            lastPlayedAt: (watchHistory?.lastPlayedAt as string | null) || null,
          };
        });

        // Filter: Only show scenes where user has watched at least 2% of the video
        // This prevents accidental clicks from cluttering Continue Watching
        const MIN_WATCH_PERCENT = 2;
        const filteredScenes = scenesWithProgress.filter((scene) => {
          const duration = scene.files?.[0]?.duration;
          const playDuration = scene.watchHistory?.playDuration as number | undefined;

          if (!duration || !playDuration) {
            return false; // No duration data, exclude
          }

          const percentWatched = (playDuration / duration) * 100;
          return percentWatched >= MIN_WATCH_PERCENT;
        });

        // Sort by lastPlayedAt (most recent first)
        filteredScenes.sort((a, b) => {
          const dateA = a.lastPlayedAt ? new Date(a.lastPlayedAt) : new Date(0);
          const dateB = b.lastPlayedAt ? new Date(b.lastPlayedAt) : new Date(0);
          return dateB.getTime() - dateA.getTime();
        });

        setScenes(filteredScenes);
        setScenesFetchError(null);
      } catch (err) {
        console.error("Error fetching continue watching scenes:", err);
        setScenesFetchError(err instanceof ApiError ? err : null);
        setScenes([]);
      } finally {
        setLoading(false);
      }
    };

    fetchScenes();
  }, [watchHistoryList, loadingHistory, retryTrigger]);

  // Handle server initialization state
  useEffect(() => {
    const isWatchHistoryInitializing = false; // error from useAllWatchHistory is string | null, never has isInitializing
    const isScenesInitializing = scenesFetchError?.isInitializing;
    const isInitializing = isWatchHistoryInitializing || isScenesInitializing;

    if (isInitializing && retryCount < 60 && onInitializing) {
      onInitializing(true);
      const timer = setTimeout(() => {
        setRetryCount((prev) => prev + 1);
        refresh(); // Retry watch history fetch
        setRetryTrigger((prev) => prev + 1); // Trigger scenes refetch
      }, 5000);
      return () => clearTimeout(timer);
    } else if (isInitializing && retryCount >= 60 && onInitializing) {
      onInitializing(false);
      console.error(
        `[Continue Watching] Failed to load after ${retryCount} retries`
      );
    } else if (!isInitializing && onInitializing) {
      onInitializing(false);
      setRetryCount(0);
    }
  }, [error, scenesFetchError, refresh, retryCount, onInitializing]);

  const handleSceneClick = (scene: NormalizedScene) => {
    const currentIndex = scenes.findIndex((s) => s.id === scene.id);

    navigate(getEntityPath('scene', scene as unknown as Parameters<typeof getEntityPath>[1], hasMultipleInstances), {
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
    });
    return true; // Prevent fallback navigation in SceneCard
  };

  // Don't show carousel if error (non-initialization) or no scenes
  const isInitializing = scenesFetchError?.isInitializing;
  if (
    (error) ||
    (scenesFetchError && !scenesFetchError.isInitializing)
  ) {
    console.error(
      "Continue Watching error (non-initialization):",
      error || scenesFetchError
    );
    return null;
  }
  if (!loading && !isInitializing && scenes.length === 0) {
    return null;
  }

  return (
    <SceneCarousel
      loading={loading || isInitializing}
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
