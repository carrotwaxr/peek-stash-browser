import { useScenePlayer } from "../../contexts/ScenePlayerContext.jsx";
import AddToPlaylistButton from "../ui/AddToPlaylistButton.jsx";
import OCounterButton from "../ui/OCounterButton.jsx";
import RatingControls from "../ui/RatingControls.jsx";

const PlaybackControls = () => {
  const {
    scene,
    sceneLoading,
    videoLoading,
    playlist,
    currentIndex,
    quality,
    setQuality,
    oCounter,
    setOCounter,
  } = useScenePlayer();

  // Don't render if no scene data yet
  if (!scene) {
    return null;
  }

  const isLoading = sceneLoading || videoLoading;
  return (
    <section className="container-fluid py-4 mt-6">
      <div
        className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-lg"
        style={{
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--border-color)",
        }}
      >
        {/* Playlist Indicator */}
        {playlist && playlist.scenes && (
          <div className="flex items-center gap-2">
            <span
              className="text-sm font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              Playlist:
            </span>
            <span className="text-sm" style={{ color: "var(--text-primary)" }}>
              {playlist.name} ({currentIndex + 1}/{playlist.scenes.length})
            </span>
          </div>
        )}

        {/* Quality Selector */}
        <div className="flex items-center gap-2">
          <label
            className="text-sm font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            Quality:
          </label>
          <select
            value={quality}
            onChange={(e) => setQuality(e.target.value)}
            disabled={isLoading}
            className="btn text-sm"
            style={{
              backgroundColor: "var(--bg-card)",
              border: "1px solid var(--border-color)",
              color: "var(--text-primary)",
              padding: "8px 12px",
              opacity: isLoading ? 0.6 : 1,
              cursor: isLoading ? "not-allowed" : "pointer",
            }}
          >
            <option value="direct">Direct Play</option>
            <option value="1080p">1080p</option>
            <option value="720p">720p</option>
            <option value="480p">480p</option>
            <option value="360p">360p</option>
          </select>
        </div>

        {/* Actions */}
        <div
          className="flex items-center gap-4"
          style={{ opacity: isLoading ? 0.6 : 1 }}
        >
          {/* Rating and Favorite */}
          <RatingControls
            entityType="scene"
            entityId={scene?.id}
            initialRating={scene?.rating}
            initialFavorite={scene?.favorite || false}
            size={20}
          />

          {/* O Counter Button */}
          <OCounterButton
            sceneId={scene?.id}
            initialCount={oCounter}
            onIncrement={setOCounter}
            disabled={isLoading}
          />

          {/* Add to Playlist Button */}
          <AddToPlaylistButton sceneId={scene?.id} disabled={isLoading} />
        </div>
      </div>
    </section>
  );
};

export default PlaybackControls;
