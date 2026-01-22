import { forwardRef, useMemo } from "react";
import { Link } from "react-router-dom";
import { formatDuration } from "../../utils/format.js";
import { getClipPreviewUrl } from "../../services/api.js";

/**
 * ClipCard - Card for displaying clip entities
 */
const ClipCard = forwardRef(({ clip, onClick, showSceneTitle = true }, ref) => {
  const formattedTime = useMemo(() => {
    return formatDuration(clip.seconds);
  }, [clip.seconds]);

  const previewUrl = clip.isGenerated ? getClipPreviewUrl(clip.id) : null;
  const fallbackUrl = clip.scene?.pathScreenshot
    ? `/api/proxy/stash?path=${encodeURIComponent(clip.scene.pathScreenshot)}`
    : null;

  const handleClick = (e) => {
    if (onClick) {
      e.preventDefault();
      onClick(clip);
    }
  };

  return (
    <div
      ref={ref}
      className="group relative rounded-lg overflow-hidden bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
      onClick={handleClick}
    >
      {/* Thumbnail */}
      <div className="aspect-video relative">
        {previewUrl || fallbackUrl ? (
          <img
            src={previewUrl || fallbackUrl}
            alt={clip.title || "Clip"}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-slate-700 flex items-center justify-center">
            <span className="text-slate-500">No preview</span>
          </div>
        )}

        {/* Timestamp badge */}
        <div className="absolute bottom-2 right-2 bg-black/75 px-2 py-0.5 rounded text-xs font-medium">
          {formattedTime}
        </div>

        {/* Primary tag dot */}
        {clip.primaryTag && (
          <div
            className="absolute top-2 left-2 w-3 h-3 rounded-full border border-white/50"
            style={{ backgroundColor: clip.primaryTag.color || "#ffffff" }}
            title={clip.primaryTag.name}
          />
        )}

        {/* Ungenerated indicator */}
        {!clip.isGenerated && (
          <div className="absolute top-2 right-2 bg-yellow-500/80 px-1.5 py-0.5 rounded text-xs">
            No preview
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-2">
        <h3 className="text-sm font-medium truncate" title={clip.title || "Untitled"}>
          {clip.title || "Untitled"}
        </h3>

        {showSceneTitle && clip.scene?.title && (
          <Link
            to={`/scene/${clip.sceneId}?t=${Math.floor(clip.seconds)}`}
            className="text-xs text-slate-400 hover:text-white truncate block"
            onClick={(e) => e.stopPropagation()}
          >
            {clip.scene.title}
          </Link>
        )}

        {clip.primaryTag && (
          <span
            className="inline-block mt-1 px-1.5 py-0.5 rounded text-xs"
            style={{
              backgroundColor: `${clip.primaryTag.color || "#ffffff"}20`,
              color: clip.primaryTag.color || "#ffffff",
            }}
          >
            {clip.primaryTag.name}
          </span>
        )}
      </div>
    </div>
  );
});

ClipCard.displayName = "ClipCard";

export default ClipCard;
