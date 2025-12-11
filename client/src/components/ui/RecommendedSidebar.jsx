import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useLazyLoad } from "./CardComponents.jsx";

/**
 * RecommendedSidebar - Compact vertical list of recommended scenes for sidebar
 * Shows 12 scenes in a scrollable vertical layout
 * @param {string} sceneId - Current scene ID for fetching similar scenes
 * @param {number} maxHeight - Maximum height in pixels to match left column
 */
const RecommendedSidebar = ({ sceneId, maxHeight }) => {
  const navigate = useNavigate();
  const [scenes, setScenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchRecommendedScenes = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await axios.get(
          `/api/library/scenes/${sceneId}/similar?page=1`,
          { withCredentials: true }
        );

        // Only take first 12 scenes for sidebar
        setScenes(response.data.scenes.slice(0, 12));
      } catch (err) {
        console.error("Error fetching recommended scenes:", err);
        setError(err.response?.data?.error || "Failed to load recommendations");
      } finally {
        setLoading(false);
      }
    };

    if (sceneId) {
      fetchRecommendedScenes();
    }
  }, [sceneId]);

  const handleSceneClick = (scene) => {
    // Navigate to scene - this will trigger auto-playlist generation from similar scenes
    navigate(`/scene/${scene.id}`, {
      state: {
        scene,
        referrerUrl: `/scene/${sceneId}`,
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
                  alt={scene.title || "Scene"}
                  duration={duration}
                />

                {/* Info */}
                <div className="flex-1 py-2 pr-2 min-w-0">
                  {/* Title */}
                  <h4
                    className="text-sm font-medium line-clamp-2 mb-1 group-hover:underline"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {scene.title || scene.files?.[0]?.basename || "Untitled"}
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
const formatDuration = (seconds) => {
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
const SidebarThumbnail = ({ thumbnail, alt, duration }) => {
  const [ref, shouldLoad] = useLazyLoad();

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
