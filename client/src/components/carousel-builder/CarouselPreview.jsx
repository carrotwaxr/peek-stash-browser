import { AlertCircle, Eye, Loader2, ImageOff } from "lucide-react";
import { getSceneTitle } from "../../utils/format.js";
import { useLazyLoad } from "../ui/CardComponents.jsx";

/**
 * CarouselPreview Component
 * Shows a preview of the carousel results after running the query.
 *
 * @param {Array} scenes - Preview scenes to display
 * @param {string} error - Error message if preview failed
 * @param {boolean} loading - Whether preview is loading
 */
const CarouselPreview = ({ scenes, error, loading }) => {
  return (
    <div
      className="rounded-lg border p-4 space-y-4"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-color)",
      }}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
          Preview
        </h2>
        {scenes && (
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>
            Showing {scenes.length} scene{scenes.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Loading State */}
      {loading && (
        <div
          className="flex items-center justify-center py-12"
          style={{ color: "var(--text-secondary)" }}
        >
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          <span>Loading preview...</span>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div
          className="flex items-center gap-2 p-3 rounded-lg"
          style={{
            backgroundColor: "var(--status-error-bg)",
            color: "var(--status-error)",
          }}
        >
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && scenes === null && (
        <div className="text-center py-12">
          <Eye
            className="w-12 h-12 mx-auto mb-3"
            style={{ color: "var(--text-muted)" }}
          />
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Click &quot;Preview&quot; to see matching scenes
          </p>
        </div>
      )}

      {/* No Results */}
      {!loading && !error && scenes && scenes.length === 0 && (
        <div className="text-center py-12">
          <AlertCircle
            className="w-12 h-12 mx-auto mb-3"
            style={{ color: "var(--text-muted)" }}
          />
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            No scenes match your filter rules
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            Try adjusting your rules to be less restrictive
          </p>
        </div>
      )}

      {/* Results Grid */}
      {!loading && !error && scenes && scenes.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {scenes.map((scene) => (
            <PreviewCard key={scene.id} scene={scene} />
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * PreviewCard Component
 * Simple scene card for the preview grid.
 */
const PreviewCard = ({ scene }) => {
  const thumbnailUrl = scene.paths?.screenshot;
  const [ref, shouldLoad] = useLazyLoad();

  return (
    <div
      ref={ref}
      className="rounded-lg overflow-hidden border"
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderColor: "var(--border-color)",
      }}
    >
      {/* Thumbnail */}
      <div className="aspect-video relative bg-black/50">
        {shouldLoad && thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={scene.title || "Scene thumbnail"}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageOff className="w-8 h-8" style={{ color: "var(--text-muted)" }} />
          </div>
        )}

        {/* Duration badge */}
        {scene.files?.[0]?.duration && (
          <div
            className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-xs font-medium"
            style={{
              backgroundColor: "rgba(0,0,0,0.7)",
              color: "white",
            }}
          >
            {formatDuration(scene.files[0].duration)}
          </div>
        )}
      </div>

      {/* Title */}
      <div className="p-2">
        <p
          className="text-xs line-clamp-2"
          style={{ color: "var(--text-primary)" }}
          title={getSceneTitle(scene)}
        >
          {getSceneTitle(scene)}
        </p>
      </div>
    </div>
  );
};

/**
 * Format duration from seconds to HH:MM:SS or MM:SS
 */
const formatDuration = (seconds) => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

export default CarouselPreview;
