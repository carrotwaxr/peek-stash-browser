import { Link } from "react-router-dom";
import { useScenePlayer } from "../../contexts/ScenePlayerContext.jsx";
import { Paper, SectionLink, TagChips, useLazyLoad } from "../ui/index.js";
import { formatBitRate, formatFileSize } from "../../utils/format.js";

/**
 * LazyThumbnail - Lazy-loaded thumbnail for performer images
 */
const LazyThumbnail = ({ src, alt, fallback, className }) => {
  const [ref, shouldLoad] = useLazyLoad();

  return (
    <div
      ref={ref}
      className={className}
      style={{ backgroundColor: "var(--bg-secondary)" }}
    >
      {shouldLoad && src ? (
        <img src={src} alt={alt} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <span className="text-2xl" style={{ color: "var(--text-muted)" }}>
            {fallback}
          </span>
        </div>
      )}
    </div>
  );
};

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

/**
 * Merge and deduplicate tags from scene, performers, and studio
 */
const mergeAllTags = (scene) => {
  const tagMap = new Map();

  // Add scene tags
  if (scene.tags) {
    scene.tags.forEach((tag) => tagMap.set(tag.id, tag));
  }

  // Add performer tags
  if (scene.performers) {
    scene.performers.forEach((performer) => {
      if (performer.tags) {
        performer.tags.forEach((tag) => tagMap.set(tag.id, tag));
      }
    });
  }

  // Add studio tags
  if (scene.studio?.tags) {
    scene.studio.tags.forEach((tag) => tagMap.set(tag.id, tag));
  }

  return Array.from(tagMap.values());
};

const SceneDetails = ({
  showDetails,
  setShowDetails,
  showTechnicalDetails,
  setShowTechnicalDetails,
}) => {
  const { scene, sceneLoading, compatibility } = useScenePlayer();

  // Don't render if no scene data yet
  if (!scene) {
    return null;
  }

  const firstFile = scene?.files?.[0];

  return (
    <section
      className="w-full mt-4 pb-8"
      style={{
        opacity: sceneLoading ? 0.6 : 1,
        transition: "opacity 0.2s ease-in-out",
      }}
    >
      {/* Clean layout inspired by YouTube - less card-based, more content-focused */}
      <div className="space-y-6">
        {/* Primary details section */}
        <div>
          <Paper>
            <Paper.Header
              className="cursor-pointer"
              onClick={() => setShowDetails(!showDetails)}
            >
              <div className="flex items-center justify-between">
                <Paper.Title>Details</Paper.Title>
                <span style={{ color: "var(--text-secondary)" }}>
                  {showDetails ? "▼" : "▶"}
                </span>
              </div>
            </Paper.Header>
            {showDetails && (
              <Paper.Body>
                {/* Studio, Studio Code, and Release Date Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
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

                  {scene.code && (
                    <div>
                      <h3
                        className="text-sm font-medium mb-1"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Studio Code
                      </h3>
                      <p
                        className="text-base"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {scene.code}
                      </p>
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

                {/* Director */}
                {scene.director && (
                  <div className="mb-4">
                    <h3
                      className="text-sm font-medium mb-1"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Director
                    </h3>
                    <p
                      className="text-base"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {scene.director}
                    </p>
                  </div>
                )}

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

                {/* Performers - Horizontal scrollable with 2/3 aspect ratio */}
                {scene.performers && scene.performers.length > 0 && (
                  <div className="mb-6">
                    <h3
                      className="text-sm font-medium mb-3"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Performers
                    </h3>
                    <div
                      className="flex gap-4 overflow-x-auto pb-2 scroll-smooth"
                      style={{ scrollbarWidth: "thin" }}
                    >
                      {scene.performers.map((performer) => (
                        <Link
                          key={performer.id}
                          to={`/performer/${performer.id}`}
                          className="flex flex-col items-center flex-shrink-0 group w-[120px]"
                        >
                          <LazyThumbnail
                            src={performer.image_path}
                            alt={performer.name}
                            fallback={performer.gender === "MALE" ? "♂" : "♀"}
                            className="aspect-[2/3] rounded-lg overflow-hidden mb-2 w-full border-2 border-transparent group-hover:border-[var(--accent-primary)] transition-all"
                          />
                          <span
                            className="text-xs font-medium text-center w-full line-clamp-2 group-hover:underline"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {performer.name}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* Groups/Collections - Display as colored chips like tags */}
                {scene.groups && scene.groups.length > 0 && (
                  <div className="mb-6">
                    <h3
                      className="text-sm font-medium mb-3"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Collections
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {scene.groups.map((group) => {
                        // Generate a color based on group ID for consistency
                        const hue = (parseInt(group.id, 10) * 137.5) % 360;
                        return (
                          <div key={group.id} className="relative group/tooltip">
                            <Link
                              to={`/collection/${group.id}`}
                              className="px-3 py-1 rounded-full text-sm transition-all duration-200 hover:opacity-80 font-medium inline-block"
                              style={{
                                backgroundColor: `hsl(${hue}, 70%, 45%)`,
                                color: "white",
                              }}
                            >
                              {group.name}
                            </Link>
                            {/* Tooltip with image and name on hover */}
                            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 opacity-0 group-hover/tooltip:opacity-100 pointer-events-none transition-opacity duration-200 z-10">
                              <div
                                className="rounded-lg overflow-hidden shadow-lg"
                                style={{
                                  backgroundColor: "var(--bg-secondary)",
                                  border: "1px solid var(--border-color)",
                                  width: "120px",
                                }}
                              >
                                <div
                                  className="w-full overflow-hidden flex items-center justify-center"
                                  style={{
                                    backgroundColor: "var(--border-color)",
                                    height: "180px",
                                  }}
                                >
                                  {group.front_image_path || group.back_image_path ? (
                                    <img
                                      src={
                                        group.front_image_path ||
                                        group.back_image_path
                                      }
                                      alt={group.name}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <span
                                      className="text-3xl"
                                      style={{ color: "var(--text-secondary)" }}
                                    >
                                      🎬
                                    </span>
                                  )}
                                </div>
                                <div className="px-2 py-2 text-center">
                                  <span
                                    className="text-xs font-medium line-clamp-2"
                                    style={{ color: "var(--text-primary)" }}
                                  >
                                    {group.name}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Tags */}
                {(() => {
                  const allTags = mergeAllTags(scene);
                  return (
                    allTags.length > 0 && (
                      <div>
                        <h3
                          className="text-sm font-medium mb-3"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          Tags
                        </h3>
                        <TagChips tags={allTags} />
                      </div>
                    )
                  );
                })()}

                {/* URLs/Links */}
                {scene.urls && scene.urls.length > 0 && (
                  <div className="mt-6">
                    <h3
                      className="text-sm font-medium mb-3"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Links
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {scene.urls.map((url, index) => (
                        <SectionLink key={index} url={url} />
                      ))}
                    </div>
                  </div>
                )}
              </Paper.Body>
            )}
          </Paper>
        </div>

        {/* Technical details - inline with primary details */}
        <div>
          <Paper>
            <Paper.Header
              className="cursor-pointer"
              onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
            >
              <div className="flex items-center justify-between">
                <Paper.Title>Technical Details</Paper.Title>
                <span style={{ color: "var(--text-secondary)" }}>
                  {showTechnicalDetails ? "▼" : "▶"}
                </span>
              </div>
            </Paper.Header>
            {showTechnicalDetails && (
              <Paper.Body>
                {firstFile && (
                  <>
                    {/* Video Section */}
                    <div className="mb-6">
                      <h3
                        className="text-sm font-semibold uppercase tracking-wide mb-3 pb-2"
                        style={{
                          color: "var(--text-primary)",
                          borderBottom: "2px solid var(--accent-primary)",
                        }}
                      >
                        Video
                      </h3>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span style={{ color: "var(--text-secondary)" }}>
                            Resolution:
                          </span>
                          <span
                            className="font-medium"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {firstFile.width} × {firstFile.height}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span style={{ color: "var(--text-secondary)" }}>
                            Codec:
                          </span>
                          <span
                            className="font-medium"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {firstFile.video_codec?.toUpperCase() || "Unknown"}
                          </span>
                        </div>
                        {firstFile.frame_rate && (
                          <div className="flex justify-between">
                            <span style={{ color: "var(--text-secondary)" }}>
                              Frame Rate:
                            </span>
                            <span
                              className="font-medium"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {firstFile.frame_rate} fps
                            </span>
                          </div>
                        )}
                        {firstFile.bit_rate && (
                          <div className="flex justify-between">
                            <span style={{ color: "var(--text-secondary)" }}>
                              Bit Rate:
                            </span>
                            <span
                              className="font-medium"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {formatBitRate(firstFile.bit_rate)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Audio Section */}
                    <div className="mb-6">
                      <h3
                        className="text-sm font-semibold uppercase tracking-wide mb-3 pb-2"
                        style={{
                          color: "var(--text-primary)",
                          borderBottom: "2px solid var(--accent-primary)",
                        }}
                      >
                        Audio
                      </h3>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span style={{ color: "var(--text-secondary)" }}>
                            Codec:
                          </span>
                          <span
                            className="font-medium"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {firstFile.audio_codec?.toUpperCase() || "Unknown"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* File Information Section */}
                    <div className="mb-6">
                      <h3
                        className="text-sm font-semibold uppercase tracking-wide mb-3 pb-2"
                        style={{
                          color: "var(--text-primary)",
                          borderBottom: "2px solid var(--accent-primary)",
                        }}
                      >
                        File Information
                      </h3>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span style={{ color: "var(--text-secondary)" }}>
                            Format:
                          </span>
                          <span
                            className="font-medium"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {firstFile.format?.toUpperCase() || "Unknown"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span style={{ color: "var(--text-secondary)" }}>
                            File Size:
                          </span>
                          <span
                            className="font-medium"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {formatFileSize(firstFile.size)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {compatibility && (
                  <div>
                    <h3
                      className="text-sm font-semibold uppercase tracking-wide mb-3 pb-2"
                      style={{
                        color: "var(--text-primary)",
                        borderBottom: "2px solid var(--accent-primary)",
                      }}
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
              </Paper.Body>
            )}
          </Paper>
        </div>
      </div>
    </section>
  );
};

export default SceneDetails;
