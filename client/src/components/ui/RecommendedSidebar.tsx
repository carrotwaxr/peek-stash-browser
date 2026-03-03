import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../../api";
import { getSceneTitle } from "../../utils/format";
import { useConfig } from "../../contexts/ConfigContext";
import { getEntityPath } from "../../utils/entityLinks";
import { useLazyLoad } from "./CardComponents";
import type { NormalizedScene } from "@peek/shared-types";

/**
 * RecommendedSidebar - Compact vertical list of recommended scenes for sidebar
 * Shows 12 scenes in a scrollable vertical layout
 * @param {string} sceneId - Current scene ID for fetching similar scenes
 * @param {number} maxHeight - Maximum height in pixels to match left column
 */
interface Props {
  sceneId: string;
  maxHeight?: number;
}

const RecommendedSidebar = ({ sceneId, maxHeight }: Props) => {
  const navigate = useNavigate();
  const { hasMultipleInstances } = useConfig();
  const [scenes, setScenes] = useState<NormalizedScene[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRecommendedScenes = async () => {
      try {
        setLoading(true);
        setError(null);

        const data = await apiGet(
          `/library/scenes/${sceneId}/similar?page=1`,
        ) as { scenes: NormalizedScene[] };

        // Only take first 12 scenes for sidebar
        setScenes(data.scenes.slice(0, 12));
      } catch (err) {
        console.error("Error fetching recommended scenes:", err);
        setError((err as Error).message || "Failed to load recommendations");
      } finally {
        setLoading(false);
      }
    };

    if (sceneId) {
      fetchRecommendedScenes();
    }
  }, [sceneId]);

  const handleSceneClick = (scene: NormalizedScene) => {
    // Navigate to scene - this will trigger auto-playlist generation from similar scenes
    navigate(getEntityPath('scene', scene as unknown as Parameters<typeof getEntityPath>[1], hasMultipleInstances), {
      state: {
        scene,
        fromPageTitle: "Recommended",
      },
    });
    return true; // Prevent fallback navigation in SceneCard
  };

  // Loading state
  if (loading) {
    return (
      <div className="space-y-3">
        <h3
          className="text-sm font-semibold uppercase tracking-wide mb-3"
          style={{ color: "var(--text-primary)" }}
        >
          Recommended
        </h3>
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="animate-pulse"
              style={{
                backgroundColor: "var(--bg-secondary)",
                height: "80px",
                borderRadius: "8px",
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  // Error or no results - don't show anything
  if (error || scenes.length === 0) {
    return null;
  }

  return (
    <div
      className="flex flex-col"
      style={{
        ...(maxHeight && { height: `${maxHeight}px` }),
      }}
    >
      {/* Header */}
      <h3
        className="text-sm font-semibold uppercase tracking-wide mb-3 flex-shrink-0"
        style={{ color: "var(--text-primary)" }}
      >
        Recommended
      </h3>

      {/* Scrollable scene list */}
      <div className="flex-1 space-y-3 overflow-y-auto">
        {scenes.map((scene) => {
          const thumbnail = scene.paths?.screenshot || scene.paths?.preview;
          const duration = scene.files?.[0]?.duration;

          return (
            <div
              key={scene.id}
              onClick={() => handleSceneClick(scene)}
              className="group cursor-pointer rounded-lg overflow-hidden transition-all hover:scale-[1.02]"
              style={{
                backgroundColor: "var(--bg-secondary)",
              }}
            >
              <div className="flex gap-3">
                {/* Thumbnail with lazy loading */}
                <SidebarThumbnail
                  thumbnail={thumbnail}
                  alt={getSceneTitle(scene as unknown as Record<string, unknown>)}
                  duration={duration}
                />

                {/* Info */}
                <div className="flex-1 py-2 pr-2 min-w-0">
                  {/* Title */}
                  <h4
                    className="text-sm font-medium line-clamp-2 mb-1 group-hover:underline"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {getSceneTitle(scene as unknown as Record<string, unknown>)}
                  </h4>

                  {/* Studio */}
                  {scene.studio && (
                    <p
                      className="text-xs line-clamp-1"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {scene.studio.name}
                    </p>
                  )}

                  {/* Date */}
                  {scene.date && (
                    <p
                      className="text-xs mt-0.5"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {new Date(scene.date).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Format duration in seconds to HH:MM:SS or MM:SS
 */
const formatDuration = (seconds: number) => {
  if (!seconds) return "?:??";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
};

/**
 * SidebarThumbnail - Lazy-loaded thumbnail for sidebar items
 */
interface SidebarThumbnailProps {
  thumbnail: string | null | undefined;
  alt: string;
  duration: number | null | undefined;
}

const SidebarThumbnail = ({ thumbnail, alt, duration }: SidebarThumbnailProps) => {
  const [ref, shouldLoad] = useLazyLoad() as [React.RefObject<HTMLDivElement>, boolean];

  return (
    <div
      ref={ref}
      className="relative flex-shrink-0 overflow-hidden"
      style={{
        width: "140px",
        height: "80px",
        backgroundColor: "var(--border-color)",
      }}
    >
      {shouldLoad && thumbnail ? (
        <img
          src={thumbnail}
          alt={alt}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <span
            className="text-2xl"
            style={{ color: "var(--text-secondary)" }}
          >
            🎬
          </span>
        </div>
      )}

      {/* Duration badge */}
      {duration && (
        <div
          className="absolute bottom-1 right-1 px-1.5 py-0.5 text-xs font-medium rounded"
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            color: "white",
          }}
        >
          {formatDuration(duration)}
        </div>
      )}
    </div>
  );
};

export default RecommendedSidebar;
