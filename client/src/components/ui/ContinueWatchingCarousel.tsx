import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { NormalizedScene } from "@peek/shared-types";
import { PlayCircle } from "lucide-react";
import {
  isLibraryInitializing,
  useLibraryReady,
} from "../../api/hooks/useLibraryReady";
import { useConfig } from "../../contexts/ConfigContext";
import { useWatchedScenes } from "../../hooks/useWatchHistory";
import { getEntityPath } from "../../utils/entityLinks";
import { buildPlaybackQueue } from "../../utils/playbackQueue";
import SceneCarousel from "./SceneCarousel";

/** How many scenes Continue Watching shows. */
const CAROUSEL_SIZE = 12;

/**
 * Continue Watching carousel component
 * Shows the scenes the viewer left part-way (the server's "in progress" view:
 * a resume point before the last 10% and at least 2% watched), most recently
 * played first. While the library is initializing it shows its loading state.
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
    data,
    isLoading: loading,
    error,
  } = useWatchedScenes({
    view: "in_progress",
    sort: "recent",
    page: 1,
    perPage: CAROUSEL_SIZE,
    count: false,
  });
  const scenes = useMemo(() => data?.scenes ?? [], [data]);

  const initializing = !ready || isLibraryInitializing(error);

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
          playlist: buildPlaybackQueue({
            id: "virtual-carousel",
            name: "Continue Watching",
            scenes,
            currentIndex: currentIndex >= 0 ? currentIndex : 0,
          }),
        },
      }
    );
    return true; // Prevent fallback navigation in SceneCard
  };

  // Don't show carousel if error (non-initialization) or no scenes
  if (error && !initializing) {
    console.error("Continue Watching error (non-initialization):", error);
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
