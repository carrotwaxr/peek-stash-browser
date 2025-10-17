import AddToPlaylistButton from "../ui/AddToPlaylistButton.jsx";

const PlaybackControls = ({
  scene,
  playlist,
  currentPlaylistIndex,
  quality,
  setQuality,
  onReset,
}) => {
  return (
    <section className="container-fluid px-4 py-4">
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
              {playlist.name} ({currentPlaylistIndex + 1}/{playlist.scenes.length})
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
            className="btn text-sm"
            style={{
              backgroundColor: "var(--bg-card)",
              border: "1px solid var(--border-color)",
              color: "var(--text-primary)",
              padding: "8px 12px",
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
        <div className="flex items-center gap-4">
          {/* Reset Button */}
          <button
            onClick={onReset}
            className="btn text-sm"
            style={{
              backgroundColor: "var(--bg-card)",
              border: "1px solid var(--border-color)",
              color: "var(--text-primary)",
              padding: "8px 12px",
            }}
          >
            🔄 Reset
          </button>

          {/* Add to Playlist Button */}
          <AddToPlaylistButton sceneId={scene.id} />
        </div>
      </div>
    </section>
  );
};

export default PlaybackControls;
