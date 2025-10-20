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
    <section className="container-fluid mt-6">
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
                          className="flex flex-col items-center rounded-lg overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                          style={{
                            backgroundColor: "var(--bg-secondary)",
                            width: "100px"
                          }}
                        >
                          <div
                            className="w-full overflow-hidden flex items-center justify-center"
                            style={{
                              backgroundColor: "var(--border-color)",
                              height: "120px"
                            }}
                          >
                            {performer.image_path ? (
                              <img
                                src={performer.image_path}
                                alt={performer.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span
                                className="text-3xl"
                                style={{ color: "var(--text-secondary)" }}
                              >
                                {performer.gender === "MALE" ? "♂" : "♀"}
                              </span>
                            )}
                          </div>
                          <div className="w-full px-2 py-2 text-center">
                            <span
                              className="text-xs font-medium line-clamp-2"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {performer.name}
                            </span>
                          </div>
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
                      {scene.tags.map((tag) => {
                        // Generate a color based on tag ID for consistency
                        const hue = (parseInt(tag.id, 10) * 137.5) % 360;
                        return (
                          <Link
                            key={tag.id}
                            to={`/tag/${tag.id}`}
                            className="px-3 py-1 rounded-full text-sm font-medium transition-opacity hover:opacity-80"
                            style={{
                              backgroundColor: `hsl(${hue}, 70%, 45%)`,
                              color: "white",
                            }}
                          >
                            {tag.name}
                          </Link>
                        );
                      })}
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
                  <>
                    {/* Video Section */}
                    <div className="mb-6">
                      <h3 className="text-sm font-semibold uppercase tracking-wide mb-3 pb-2"
                          style={{
                            color: "var(--text-primary)",
                            borderBottom: "2px solid var(--accent-primary)"
                          }}>
                        Video
                      </h3>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span style={{ color: "var(--text-secondary)" }}>Resolution:</span>
                          <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                            {firstFile.width} × {firstFile.height}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span style={{ color: "var(--text-secondary)" }}>Codec:</span>
                          <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                            {firstFile.video_codec?.toUpperCase() || "Unknown"}
                          </span>
                        </div>
                        {firstFile.frame_rate && (
                          <div className="flex justify-between">
                            <span style={{ color: "var(--text-secondary)" }}>Frame Rate:</span>
                            <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                              {firstFile.frame_rate} fps
                            </span>
                          </div>
                        )}
                        {firstFile.bitrate && (
                          <div className="flex justify-between">
                            <span style={{ color: "var(--text-secondary)" }}>Bitrate:</span>
                            <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                              {Math.round(firstFile.bitrate / 1000)} kbps
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Audio Section */}
                    <div className="mb-6">
                      <h3 className="text-sm font-semibold uppercase tracking-wide mb-3 pb-2"
                          style={{
                            color: "var(--text-primary)",
                            borderBottom: "2px solid var(--accent-primary)"
                          }}>
                        Audio
                      </h3>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span style={{ color: "var(--text-secondary)" }}>Codec:</span>
                          <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                            {firstFile.audio_codec?.toUpperCase() || "Unknown"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* File Information Section */}
                    <div className="mb-6">
                      <h3 className="text-sm font-semibold uppercase tracking-wide mb-3 pb-2"
                          style={{
                            color: "var(--text-primary)",
                            borderBottom: "2px solid var(--accent-primary)"
                          }}>
                        File Information
                      </h3>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span style={{ color: "var(--text-secondary)" }}>Format:</span>
                          <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                            {firstFile.format?.toUpperCase() || "Unknown"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span style={{ color: "var(--text-secondary)" }}>File Size:</span>
                          <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                            {formatFileSize(firstFile.size)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {compatibility && (
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wide mb-3 pb-2"
                        style={{
                          color: "var(--text-primary)",
                          borderBottom: "2px solid var(--accent-primary)"
                        }}>
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
