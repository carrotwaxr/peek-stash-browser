import {
  formatDurationCompact,
  formatResolution,
} from "../../utils/format.js";
import { SceneCardPreview } from "../ui/index.js";

/**
 * Scene thumbnail with animated preview and progress bar overlay
 * Uses SceneCardPreview for animation (hover on desktop, scroll on mobile)
 * Adds watch progress bar on top of the preview
 *
 * @param {Object} scene - Scene object with paths, files, etc.
 * @param {Object} watchHistory - Optional watch history with resumeTime
 * @param {string} className - Additional CSS classes
 * @param {boolean} autoplayOnScroll - Enable scroll-based autoplay (for mobile layouts)
 * @param {string} objectFit - CSS object-fit: "contain" (default) or "cover" for cropping
 */
const SceneThumbnail = ({
  scene,
  watchHistory,
  className = "",
  autoplayOnScroll = false,
  objectFit = "cover",
}) => {
  const formatResumeTime = (seconds) => {
    if (!seconds) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, "0")}`;
  };

  const duration = scene?.files?.[0]?.duration
    ? formatDurationCompact(scene.files[0].duration)
    : null;

  const resolution =
    scene?.files?.[0]?.width && scene?.files?.[0]?.height
      ? formatResolution(scene.files[0].width, scene.files[0].height)
      : null;

  if (!scene?.paths?.screenshot) {
    return (
      <div
        className={`rounded flex items-center justify-center ${className}`}
        style={{
          backgroundColor: "var(--bg-secondary)",
        }}
      >
        <span className="text-3xl" style={{ color: "var(--text-muted)" }}>
          📹
        </span>
      </div>
    );
  }

  return (
    <div className={`relative rounded overflow-hidden ${className}`}>
      {/* Animated preview (handles screenshot, sprite, webp, mp4) */}
      <SceneCardPreview
        scene={scene}
        autoplayOnScroll={autoplayOnScroll}
        cycleInterval={600}
        spriteCount={10}
        duration={duration}
        resolution={resolution}
        objectFit={objectFit}
      />

      {/* Watch progress bar - overlaid on top of preview */}
      {watchHistory?.resumeTime && scene.files?.[0]?.duration && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50 z-20">
          <div
            className="h-full bg-green-500 transition-all"
            style={{
              width: `${Math.min(100, (watchHistory.resumeTime / scene.files[0].duration) * 100)}%`,
            }}
            title={`Resume from ${formatResumeTime(watchHistory.resumeTime)}`}
          />
        </div>
      )}
    </div>
  );
};

export default SceneThumbnail;
