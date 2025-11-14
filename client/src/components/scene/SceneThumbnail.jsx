import { Link } from "react-router-dom";

/**
 * Scene thumbnail with progress bar, duration, and studio overlays
 */
const SceneThumbnail = ({ scene, watchHistory, className = "" }) => {
  const formatResumeTime = (seconds) => {
    if (!seconds) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, "0")}`;
  };

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
      <img
        src={scene.paths.screenshot}
        alt={scene.title || "Scene"}
        className="w-full h-full object-cover"
      />

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none">
        {/* Studio badge - clickable */}
        {scene.studio && (
          <div className="absolute top-2 right-2 pointer-events-auto">
            <Link
              to={`/studio/${scene.studio.id}`}
              className="px-2 py-1 bg-black/70 text-white text-xs rounded inline-block hover:bg-black/90 transition-colors"
            >
              {scene.studio.name}
            </Link>
          </div>
        )}

        {/* Duration */}
        {scene.files?.[0]?.duration && (
          <div className="absolute bottom-2 right-2">
            <span className="px-2 py-1 bg-black/70 text-white text-xs rounded">
              {Math.floor(scene.files[0].duration / 60)}m
            </span>
          </div>
        )}
      </div>

      {/* Watch progress bar */}
      {watchHistory?.resumeTime && scene.files?.[0]?.duration && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
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
