import { useMemo } from "react";
import { formatDuration } from "../../utils/format.js";

/**
 * ClipTimelineMarkers - Renders colored dots on video timeline for clip positions
 */
export default function ClipTimelineMarkers({
  clips,
  duration,
  onMarkerClick,
  className = "",
}) {
  const markers = useMemo(() => {
    if (!duration || duration === 0) return [];

    return clips
      .filter((clip) => clip.seconds >= 0 && clip.seconds <= duration)
      .map((clip) => ({
        id: clip.id,
        position: (clip.seconds / duration) * 100,
        seconds: clip.seconds,
        title: clip.title || "Untitled",
        color: clip.primaryTag?.color || "#ffffff",
        tagName: clip.primaryTag?.name,
      }));
  }, [clips, duration]);

  if (markers.length === 0) return null;

  return (
    <div
      className={`absolute inset-x-0 bottom-0 h-full pointer-events-none ${className}`}
      style={{ zIndex: 10 }}
    >
      {markers.map((marker) => (
        <button
          key={marker.id}
          data-clip-id={marker.id}
          type="button"
          className="absolute bottom-0 transform -translate-x-1/2 pointer-events-auto group"
          style={{ left: `${marker.position}%` }}
          onClick={(e) => {
            e.stopPropagation();
            onMarkerClick(marker.seconds);
          }}
          title={`${marker.title} - ${formatDuration(marker.seconds)}`}
        >
          {/* Dot */}
          <div
            className="w-2.5 h-2.5 rounded-full border border-white/50 transition-transform group-hover:scale-150"
            style={{ backgroundColor: marker.color }}
          />

          {/* Tooltip on hover */}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <div className="bg-black/90 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
              <div className="font-medium">{marker.title}</div>
              <div style={{ color: "var(--text-secondary)" }}>{formatDuration(marker.seconds)}</div>
              {marker.tagName && (
                <div
                  className="mt-0.5 text-xs"
                  style={{ color: marker.color }}
                >
                  {marker.tagName}
                </div>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
