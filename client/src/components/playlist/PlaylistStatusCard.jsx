import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, List } from "lucide-react";

/**
 * PlaylistStatusCard - Shows playlist context when viewing a scene from a playlist
 * Displays current position, navigation controls, and quick scene access
 */
const PlaylistStatusCard = ({ playlist, currentIndex }) => {
  const navigate = useNavigate();

  if (!playlist || !playlist.scenes || playlist.scenes.length === 0) {
    return null;
  }

  const totalScenes = playlist.scenes.length;
  const position = currentIndex + 1;
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < totalScenes - 1;
  const isVirtualPlaylist = playlist.id?.startsWith?.("virtual-");

  const navigateToScene = (index) => {
    if (index < 0 || index >= totalScenes) return;

    const targetScene = playlist.scenes[index];
    navigate(`/video/${targetScene.sceneId}`, {
      state: {
        scene: targetScene.scene,
        playlist: {
          ...playlist,
          currentIndex: index,
        },
      },
    });
  };

  const handlePrevious = () => {
    if (hasPrevious) {
      navigateToScene(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (hasNext) {
      navigateToScene(currentIndex + 1);
    }
  };

  const goToPlaylist = () => {
    navigate(`/playlist/${playlist.id}`);
  };

  return (
    <div className="px-4 mt-6 mb-6">
      <div
        className="rounded-lg border p-4"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <List size={20} style={{ color: "var(--text-secondary)" }} />
          <div>
            <h3
              className="font-semibold text-sm"
              style={{ color: "var(--text-primary)" }}
            >
              {isVirtualPlaylist ? "Browsing" : "Playing from Playlist"}
            </h3>
            {isVirtualPlaylist ? (
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {playlist.name}
              </p>
            ) : (
              <button
                onClick={goToPlaylist}
                className="text-sm hover:underline"
                style={{ color: "var(--text-secondary)" }}
              >
                {playlist.name}
              </button>
            )}
          </div>
        </div>
        <div
          className="text-sm font-medium"
          style={{ color: "var(--text-muted)" }}
        >
          {position} of {totalScenes}
        </div>
      </div>

      {/* Navigation Controls */}
      <div className="flex items-center gap-3">
        <button
          onClick={handlePrevious}
          disabled={!hasPrevious}
          className="px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
          style={{
            backgroundColor: hasPrevious
              ? "var(--bg-secondary)"
              : "var(--bg-primary)",
            border: "1px solid var(--border-color)",
            color: hasPrevious ? "var(--text-primary)" : "var(--text-muted)",
            cursor: hasPrevious ? "pointer" : "not-allowed",
            opacity: hasPrevious ? 1 : 0.5,
          }}
        >
          <ChevronLeft size={16} />
          Previous
        </button>

        {!isVirtualPlaylist && (
          <button
            onClick={goToPlaylist}
            className="px-4 py-2 rounded-lg flex items-center gap-2 transition-colors flex-1"
            style={{
              backgroundColor: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
              color: "var(--text-primary)",
            }}
          >
            <List size={16} />
            View Full Playlist
          </button>
        )}

        <button
          onClick={handleNext}
          disabled={!hasNext}
          className="px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
          style={{
            backgroundColor: hasNext ? "var(--bg-secondary)" : "var(--bg-primary)",
            border: "1px solid var(--border-color)",
            color: hasNext ? "var(--text-primary)" : "var(--text-muted)",
            cursor: hasNext ? "pointer" : "not-allowed",
            opacity: hasNext ? 1 : 0.5,
          }}
        >
          Next
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Thumbnail Strip - Show up to 5 scenes (2 before, current, 2 after) */}
      <div className="mt-4 overflow-x-auto">
        <div className="flex gap-2">
          {playlist.scenes.map((item, index) => {
            const scene = item.scene;
            const isCurrent = index === currentIndex;
            const shouldShow =
              Math.abs(index - currentIndex) <= 2 || // Show 2 before/after current
              index === 0 || // Always show first
              index === totalScenes - 1; // Always show last

            if (!shouldShow) return null;

            // Show ellipsis for gaps
            const prevIndex = playlist.scenes.findIndex(
              (_, i) =>
                i < index &&
                (Math.abs(i - currentIndex) <= 2 || i === 0 || i === totalScenes - 1)
            );
            const showEllipsisBefore =
              prevIndex !== -1 && index - prevIndex > 1;

            return (
              <div key={item.sceneId} className="flex items-center gap-2">
                {showEllipsisBefore && (
                  <span
                    className="text-sm px-2"
                    style={{ color: "var(--text-muted)" }}
                  >
                    ...
                  </span>
                )}
                <button
                  onClick={() => navigateToScene(index)}
                  className="flex-shrink-0 rounded overflow-hidden transition-all"
                  style={{
                    width: isCurrent ? "120px" : "80px",
                    height: isCurrent ? "68px" : "45px",
                    border: isCurrent
                      ? "2px solid var(--accent-color)"
                      : "1px solid var(--border-color)",
                    opacity: isCurrent ? 1 : 0.6,
                  }}
                  title={scene?.title || `Scene ${index + 1}`}
                >
                  {scene?.paths?.screenshot ? (
                    <img
                      src={scene.paths.screenshot}
                      alt={scene.title || `Scene ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center"
                      style={{ backgroundColor: "var(--bg-secondary)" }}
                    >
                      <span style={{ color: "var(--text-muted)" }}>
                        {index + 1}
                      </span>
                    </div>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
      </div>
    </div>
  );
};

export default PlaylistStatusCard;
