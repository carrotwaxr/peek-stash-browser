import { useNavigate } from "react-router-dom";

export const SceneGridItem = ({ scene }) => {
  const navigate = useNavigate();

  const formatDuration = (seconds) => {
    if (!seconds) return "";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${Math.floor(
        seconds % 60
      )
        .toString()
        .padStart(2, "0")}`;
    }
    return `${minutes}:${Math.floor(seconds % 60)
      .toString()
      .padStart(2, "0")}`;
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return "";
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(0)} MB`;
  };

  return (
    <div
      className="card cursor-pointer group"
      onClick={() => navigate(`/player/${scene.id}`, { state: { scene } })}
    >
      {/* Thumbnail */}
      <div className="relative overflow-hidden">
        <div className="aspect-[16/9] bg-black flex items-center justify-center">
          {scene.paths?.screenshot ? (
            <img
              src={scene.paths.screenshot}
              alt={scene.title}
              className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-200"
            />
          ) : (
            <div
              className="flex items-center justify-center w-full h-full"
              style={{ color: "var(--text-muted)" }}
            >
              <svg
                className="w-12 h-12"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm3 2h6v4l-1-1-2 2-1-1-2 2V5z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          )}
        </div>

        {/* Duration overlay */}
        {scene.duration && (
          <div
            className="absolute bottom-2 right-2 px-2 py-1 rounded text-xs font-medium text-white"
            style={{ backgroundColor: "rgba(0, 0, 0, 0.7)" }}
          >
            {formatDuration(scene.duration)}
          </div>
        )}

        {/* Rating overlay */}
        {scene.rating && (
          <div
            className="absolute top-2 left-2 px-2 py-1 rounded text-xs font-medium text-white"
            style={{ backgroundColor: "var(--accent-primary)" }}
          >
            ★ {scene.rating}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="card-body">
        <h3
          className="font-semibold text-base mb-2 line-clamp-2"
          style={{ color: "var(--text-primary)" }}
          title={scene.title}
        >
          {scene.title}
        </h3>

        {/* Studio */}
        {scene.studio && (
          <p
            className="text-sm mb-2"
            style={{ color: "var(--text-secondary)" }}
          >
            {scene.studio.name}
          </p>
        )}

        {/* Date */}
        {scene.date && (
          <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
            {new Date(scene.date).toLocaleDateString()}
          </p>
        )}

        {/* Technical details */}
        <div
          className="flex items-center justify-between text-xs mt-3 pt-3"
          style={{
            borderTop: "1px solid var(--border-color)",
            color: "var(--text-muted)",
          }}
        >
          {scene.files?.[0] && (
            <>
              <span>
                {scene.files[0].width}x{scene.files[0].height}
              </span>
              <span>{formatFileSize(scene.files[0].size)}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
