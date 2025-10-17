import { Link } from "react-router-dom";

const SceneDetails = ({
  scene,
  firstFile,
  compatibility,
  showDetails,
  setShowDetails,
  showTechnicalDetails,
  setShowTechnicalDetails,
}) => {
  const formatDuration = (seconds) => {
    if (!seconds) return "Unknown";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
        .toString()
        .padStart(2, "0")}`;
    }
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return "Unknown";
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <section className="container-fluid px-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pb-8">
        {/* Primary details */}
        <div className="lg:col-span-2">
          <div className="card">
            <div
              className="card-header cursor-pointer"
              onClick={() => setShowDetails(!showDetails)}
            >
              <div className="flex items-center justify-between">
                <h2
                  className="text-lg font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  Details
                </h2>
                <span style={{ color: "var(--text-secondary)" }}>
                  {showDetails ? "▼" : "▶"}
                </span>
              </div>
            </div>
            {showDetails && (
              <div className="card-body">
                {/* Studio and Release Date Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  {scene.studio && (
                    <div>
                      <h3
                        className="text-sm font-medium mb-1"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Studio
                      </h3>
                      <Link
                        to={`/studio/${scene.studio.id}`}
                        className="text-base hover:underline hover:text-blue-400"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {scene.studio.name}
                      </Link>
                    </div>
                  )}

                  {scene.date && (
                    <div>
                      <h3
                        className="text-sm font-medium mb-1"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Release Date
                      </h3>
                      <p
                        className="text-base"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {new Date(scene.date).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                </div>

                {/* Description - Full Width */}
                {scene.details && (
                  <div className="mb-6">
                    <h3
                      className="text-sm font-medium mb-2"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Description
                    </h3>
                    <p
                      className="text-base leading-relaxed"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {scene.details}
                    </p>
                  </div>
                )}

                {/* Duration */}
                <div className="mb-6">
                  <h3
                    className="text-sm font-medium mb-2"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Duration
                  </h3>
                  <p
                    className="text-base"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {formatDuration(scene.files?.[0]?.duration)}
                  </p>
                </div>

                {/* Performers */}
                {scene.performers && scene.performers.length > 0 && (
                  <div className="mb-6">
                    <h3
                      className="text-sm font-medium mb-3"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Performers
                    </h3>
                    <div className="flex flex-wrap gap-3">
                      {scene.performers.map((performer) => (
                        <Link
                          key={performer.id}
                          to={`/performer/${performer.id}`}
                          className="flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                          style={{ backgroundColor: "var(--bg-secondary)" }}
                        >
                          <div
                            className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center"
                            style={{
                              backgroundColor: "var(--border-color)",
                            }}
                          >
                            <span style={{ color: "var(--text-secondary)" }}>
                              {performer.gender === "MALE" ? "♂" : "♀"}
                            </span>
                          </div>
                          <span
                            className="text-sm font-medium"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {performer.name}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tags */}
                {scene.tags && scene.tags.length > 0 && (
                  <div>
                    <h3
                      className="text-sm font-medium mb-3"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Tags
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {scene.tags.map((tag) => (
                        <Link
                          key={tag.id}
                          to={`/tag/${tag.id}`}
                          className="flex items-center gap-2 px-3 py-1 rounded-full cursor-pointer hover:opacity-80 transition-opacity"
                          style={{ backgroundColor: "var(--bg-secondary)" }}
                        >
                          <div
                            className="w-4 h-4 rounded bg-gray-300"
                            style={{
                              backgroundColor: "var(--border-color)",
                            }}
                          ></div>
                          <span
                            className="text-sm"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {tag.name}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Technical details sidebar */}
        <div>
          <div className="card">
            <div
              className="card-header cursor-pointer"
              onClick={() =>
                setShowTechnicalDetails(!showTechnicalDetails)
              }
            >
              <div className="flex items-center justify-between">
                <h2
                  className="text-lg font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  Technical Details
                </h2>
                <span style={{ color: "var(--text-secondary)" }}>
                  {showTechnicalDetails ? "▼" : "▶"}
                </span>
              </div>
            </div>
            {showTechnicalDetails && (
              <div className="card-body">
                {firstFile && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <h3
                        className="text-sm font-medium mb-1"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Resolution
                      </h3>
                      <p
                        className="text-base"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {firstFile.width} × {firstFile.height}
                      </p>
                    </div>

                    <div>
                      <h3
                        className="text-sm font-medium mb-1"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Video Codec
                      </h3>
                      <p
                        className="text-base"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {firstFile.video_codec?.toUpperCase() || "Unknown"}
                      </p>
                    </div>

                    <div>
                      <h3
                        className="text-sm font-medium mb-1"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Audio Codec
                      </h3>
                      <p
                        className="text-base"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {firstFile.audio_codec?.toUpperCase() || "Unknown"}
                      </p>
                    </div>

                    <div>
                      <h3
                        className="text-sm font-medium mb-1"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        File Size
                      </h3>
                      <p
                        className="text-base"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {formatFileSize(firstFile.size)}
                      </p>
                    </div>

                    <div>
                      <h3
                        className="text-sm font-medium mb-1"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Format
                      </h3>
                      <p
                        className="text-base"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {firstFile.format?.toUpperCase() || "Unknown"}
                      </p>
                    </div>

                    {firstFile.bitrate && (
                      <div>
                        <h3
                          className="text-sm font-medium mb-1"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          Bitrate
                        </h3>
                        <p
                          className="text-base"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {Math.round(firstFile.bitrate / 1000)} kbps
                        </p>
                      </div>
                    )}

                    {firstFile.frame_rate && (
                      <div>
                        <h3
                          className="text-sm font-medium mb-1"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          Frame Rate
                        </h3>
                        <p
                          className="text-base"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {firstFile.frame_rate} fps
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {compatibility && (
                  <div
                    className="mt-6 pt-4"
                    style={{ borderTop: "1px solid var(--border-color)" }}
                  >
                    <h3
                      className="text-sm font-medium mb-2"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Playback Method
                    </h3>
                    <p
                      className="text-sm"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {compatibility.reason}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default SceneDetails;
