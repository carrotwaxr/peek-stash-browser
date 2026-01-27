import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useScenePlayer } from "../../contexts/ScenePlayerContext.jsx";
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext.jsx";
import { useConfig } from "../../contexts/ConfigContext.jsx";
import { getClipsForScene } from "../../services/api.js";
import ClipList from "../clips/ClipList.jsx";
import { LazyThumbnail, Paper, SectionLink, TagChips } from "../ui/index.js";
import { formatBitRate, formatFileSize } from "../../utils/format.js";
import { getEntityPath } from "../../utils/entityLinks.js";

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
 * Merge and deduplicate tags from scene direct tags and inherited tags
 * (inherited tags are pre-computed on server from performers, studio, groups)
 */
const mergeAllTags = (scene) => {
  const tagMap = new Map();

  // Add direct scene tags
  if (scene.tags) {
    scene.tags.forEach((tag) => tagMap.set(tag.id, tag));
  }

  // Add inherited tags (pre-computed from performers, studio, groups)
  if (scene.inheritedTags) {
    scene.inheritedTags.forEach((tag) => tagMap.set(tag.id, tag));
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
  const { getSettings } = useCardDisplaySettings();
  const sceneSettings = getSettings("scene");
  const { hasMultipleInstances } = useConfig();

  // Clips state
  const [clips, setClips] = useState([]);
  const [clipsLoading, setClipsLoading] = useState(true);
  const [showClips, setShowClips] = useState(false); // Collapsed by default

  // Fetch clips when scene changes
  useEffect(() => {
    async function fetchClips() {
      if (!scene?.id) return;
      setClipsLoading(true);
      try {
        const response = await getClipsForScene(scene.id, true);
        setClips(response.clips || []);
      } catch (err) {
        console.error("Failed to fetch clips", err);
        setClips([]);
      } finally {
        setClipsLoading(false);
      }
    }
    fetchClips();
  }, [scene?.id]);

  // Handle clip click - dispatch event to seek video player
  const handleClipClick = (clip) => {
    // Dispatch custom event that VideoPlayer listens for
    window.dispatchEvent(
      new CustomEvent("seekToTime", {
        detail: { seconds: clip.seconds },
      })
    );
  };

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
                        to={getEntityPath('studio', scene.studio, hasMultipleInstances)}
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
                {sceneSettings.showDescriptionOnDetail && scene.details && (
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

                {/* Performers - Horizontal scrollable with 2/3 aspect ratio (kept for at-a-glance importance) */}
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
                          to={getEntityPath('performer', performer, hasMultipleInstances)}
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
              </Paper.Body>
            )}
          </Paper>
        </div>

        {/* Tags Section */}
        <div>
          <Paper>
            <Paper.Header>
              <Paper.Title>Tags</Paper.Title>
            </Paper.Header>
            <Paper.Body>
              {(() => {
                const allTags = mergeAllTags(scene);
                return allTags.length > 0 ? (
                  <TagChips tags={allTags} />
                ) : (
                  <p style={{ color: "var(--text-muted)" }}>No tags for this scene</p>
                );
              })()}
            </Paper.Body>
          </Paper>
        </div>

        {/* Clips Section - Collapsible, collapsed by default */}
        {(clips.length > 0 || clipsLoading) && (
          <div>
            <Paper>
              <Paper.Header
                className="cursor-pointer"
                onClick={() => setShowClips(!showClips)}
              >
                <div className="flex items-center justify-between">
                  <Paper.Title>
                    Clips
                    {!clipsLoading && clips.length > 0 && (
                      <span
                        className="ml-2 text-sm font-normal"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        ({clips.length})
                      </span>
                    )}
                  </Paper.Title>
                  <span style={{ color: "var(--text-secondary)" }}>
                    {showClips ? "▼" : "▶"}
                  </span>
                </div>
              </Paper.Header>
              {showClips && (
                <Paper.Body>
                  <ClipList
                    clips={clips}
                    onClipClick={handleClipClick}
                    loading={clipsLoading}
                  />
                </Paper.Body>
              )}
            </Paper>
          </div>
        )}

        {/* URLs/Links Section */}
        {scene.urls && scene.urls.length > 0 && (
          <div>
            <Paper>
              <Paper.Header>
                <Paper.Title>Links</Paper.Title>
              </Paper.Header>
              <Paper.Body>
                <div className="flex flex-wrap gap-2">
                  {scene.urls.map((url, index) => (
                    <SectionLink key={index} url={url} />
                  ))}
                </div>
              </Paper.Body>
            </Paper>
          </div>
        )}

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
