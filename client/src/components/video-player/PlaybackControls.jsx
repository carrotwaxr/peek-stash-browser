import AddToPlaylistButton from "../ui/AddToPlaylistButton.jsx";

const PlaybackControls = ({
  scene,
  playlist,
  currentPlaylistIndex,
  playbackMode,
  setPlaybackMode,
  compatibility,
  transcodingStatus,
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

        {/* Playback Mode Selector */}
        <div className="flex items-center gap-2">
          <label
            className="text-sm font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            Playback Mode:
          </label>
          <select
            value={playbackMode}
            onChange={(e) => setPlaybackMode(e.target.value)}
            className="btn text-sm"
            style={{
              backgroundColor: "var(--bg-card)",
              border: "1px solid var(--border-color)",
              color: "var(--text-primary)",
              padding: "8px 12px",
            }}
          >
            <option value="auto">Auto</option>
            <option value="direct">Direct Play</option>
            <option value="transcode">Force Transcode</option>
          </select>
        </div>

        {/* Playback Status and Reset */}
        <div className="flex items-center gap-4">
          {/* Status Indicator */}
          {compatibility && (
            <div className="flex items-center gap-2">
              <span
                className={`status-indicator ${
                  compatibility.canDirectPlay
                    ? "status-success"
                    : transcodingStatus === "completed"
                    ? "status-success"
                    : transcodingStatus === "active"
                    ? "status-warning"
                    : "status-error"
                }`}
              ></span>
              <span
                className="text-sm font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                {playbackMode === "direct"
                  ? "Direct Play (Forced)"
                  : playbackMode === "transcode"
                  ? "Transcoding (Forced)"
                  : compatibility.canDirectPlay
                  ? "Direct Play"
                  : `Transcoding ${
                      transcodingStatus === "loading"
                        ? "Starting..."
                        : transcodingStatus.charAt(0).toUpperCase() +
                          transcodingStatus.slice(1)
                    }`}
              </span>
            </div>
          )}

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
