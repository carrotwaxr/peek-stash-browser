import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatRelativeTime } from "../../utils/date.js";
import { useConfig } from "../../contexts/ConfigContext.jsx";
import { useCardSelection } from "../../hooks/useCardSelection.js";
import { getEntityPath } from "../../utils/entityLinks.js";
import {
  SceneMetadata,
  SceneStats,
  SceneThumbnail,
  SceneTitle,
} from "../scene/index.js";
import { ExpandableDescription } from "./ExpandableDescription.jsx";
import { getSceneDescription } from "../../utils/format.js";

/**
 * Shared row-based scene list item component
 * Used by both Playlists and Watch History
 *
 * @param {Object} scene - Scene object
 * @param {Object} watchHistory - Optional watch history data {resumeTime, playCount, playDuration, lastPlayedAt, oCount}
 * @param {React.ReactNode} actionButtons - Optional action buttons (e.g., Remove button)
 * @param {React.ReactNode} dragHandle - Optional content to show before the thumbnail (e.g., position controls)
 * @param {Object} linkState - Optional state to pass to Link component
 * @param {boolean} exists - Whether the scene exists (for deleted scenes)
 * @param {string} sceneId - Scene ID (for when scene is deleted)
 */
const SceneListItem = ({
  scene,
  watchHistory,
  actionButtons,
  dragHandle,
  linkState,
  exists = true,
  sceneId,
  showSessionOIndicator = false, // Show if O was clicked in the last session
  isSelected = false,
  onToggleSelect,
  selectionMode = false,
}) => {
  const navigate = useNavigate();
  const { hasMultipleInstances } = useConfig();

  const { selectionHandlers, isLongPressing, handleNavigationClick } = useCardSelection({
    entity: scene,
    selectionMode,
    onToggleSelect,
  });

  // Track if viewport is mobile-width for scroll-based preview autoplay
  // Uses md breakpoint (768px) since list items stack vertically below this
  const [isMobileWidth, setIsMobileWidth] = useState(false);

  useEffect(() => {
    const checkWidth = () => {
      setIsMobileWidth(window.innerWidth < 768);
    };

    checkWidth();
    window.addEventListener("resize", checkWidth);
    return () => window.removeEventListener("resize", checkWidth);
  }, []);

  // Check if an O was clicked during the last viewing session
  const hadOInLastSession = () => {
    if (!watchHistory?.oHistory || !watchHistory?.lastPlayedAt) return false;

    try {
      const oHistory = Array.isArray(watchHistory.oHistory)
        ? watchHistory.oHistory
        : JSON.parse(watchHistory.oHistory);

      if (oHistory.length === 0) return false;

      // Get the most recent O timestamp
      const lastOTimestamp = new Date(oHistory[oHistory.length - 1]);
      const lastPlayedAt = new Date(watchHistory.lastPlayedAt);

      // Check if the last O was within 5 minutes of the last play session
      const timeDiff = Math.abs(lastOTimestamp - lastPlayedAt);
      const fiveMinutes = 5 * 60 * 1000;

      return timeDiff < fiveMinutes;
    } catch (error) {
      console.error("Error checking O history:", error);
      return false;
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds || seconds < 1) return "0m";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const formatResumeTime = (seconds) => {
    if (!seconds) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, "0")}`;
  };

  const handleClick = (e) => {
    // Delegate to hook's click handler first — it handles long-press guard
    // (resets isLongPressing flag and blocks the click) and selection mode toggling
    if (isLongPressing || selectionMode) {
      handleNavigationClick(e);
      return;
    }

    // Don't navigate if clicking on interactive elements
    const target = e.target;
    const isInteractive =
      target.closest("button") ||
      target.closest("a") ||
      target.closest('[role="button"]');

    if (isInteractive) return;

    if (!exists || !scene) return;

    // Check if there's a video player currently playing
    // If navigating within a playlist while video is playing, autoplay the next one
    const videoElements = document.querySelectorAll("video");
    let isPlaying = false;

    videoElements.forEach((video) => {
      if (!video.paused && !video.ended && video.readyState > 2) {
        isPlaying = true;
      }
    });

    if (isPlaying && linkState?.playlist) {
      sessionStorage.setItem("videoPlayerAutoplay", "true");

      // Also check if video is fullscreen
      const isFullscreen =
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement;
      if (isFullscreen) {
        sessionStorage.setItem("videoPlayerFullscreen", "true");
      }
    }

    navigate(getEntityPath('scene', scene, hasMultipleInstances), { state: linkState });
  };

  return (
    <div
      onClick={handleClick}
      {...selectionHandlers}
      className="rounded-lg border transition-all hover:shadow-lg"
      style={{
        backgroundColor: "var(--bg-card)",
        border: isSelected ? "2px solid var(--selection-color)" : "1px solid var(--border-color)",
        opacity: exists ? 1 : 0.6,
        cursor: selectionMode ? "pointer" : (exists ? "pointer" : "default"),
      }}
    >
      <div className="pt-2 px-2 pb-1 md:pt-4 md:px-4 md:pb-2">
        <div className="flex flex-col md:flex-row gap-3 md:gap-4">
          {/* Optional Drag Handle */}
          {dragHandle}

          {/* Thumbnail - fixed width on desktop, 16:9 aspect ratio */}
          <div className="flex-shrink-0 w-full md:w-96 relative">
            {/* Selection Checkbox - absolute overlay on thumbnail */}
            {(selectionMode || isSelected) && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleSelect?.(scene);
                }}
                className="absolute top-2 left-2 z-20 w-8 h-8 sm:w-6 sm:h-6 rounded border-2 flex items-center justify-center transition-all"
                style={{
                  backgroundColor: isSelected
                    ? "var(--selection-color)"
                    : "rgba(0, 0, 0, 0.5)",
                  borderColor: isSelected
                    ? "var(--selection-color)"
                    : "rgba(255, 255, 255, 0.7)",
                }}
              >
                {isSelected && (
                  <svg className="w-5 h-5 sm:w-4 sm:h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            )}
            {exists ? (
              <SceneThumbnail
                scene={scene}
                watchHistory={watchHistory}
                className="w-full aspect-video"
                autoplayOnScroll={isMobileWidth}
              />
            ) : (
              <div
                className="w-full aspect-video rounded flex items-center justify-center"
                style={{
                  backgroundColor: "var(--status-error-bg)",
                  border: "2px dashed var(--status-error-border)",
                }}
              >
                <span
                  className="text-3xl"
                  style={{ color: "var(--status-error-text)" }}
                >
                  ⚠️
                </span>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0">
            <div className="mb-2">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0 md:pr-4">
                  {exists && scene ? (
                    <>
                      {/* Title and Subtitle (Studio • Code • Date) */}
                      <div className="mb-2">
                        <SceneTitle
                          scene={scene}
                          linkState={linkState}
                          titleClassName="text-lg"
                          dateClassName="mt-1"
                          showSubtitle={true}
                        />
                      </div>

                      {/* Watch History Stats (if provided) */}
                      {watchHistory && (
                        <div
                          className="flex flex-wrap items-center gap-2 md:gap-4 text-xs mb-2 p-2 rounded"
                          style={{
                            backgroundColor: "var(--status-info-bg)",
                            color: "var(--text-muted)",
                            border: "1px solid var(--status-info-bg)",
                          }}
                        >
                          {watchHistory.lastPlayedAt && (
                            <span>
                              🕐 Last watched:{" "}
                              {formatRelativeTime(watchHistory.lastPlayedAt)}
                            </span>
                          )}
                          {watchHistory.resumeTime > 0 &&
                            scene.files?.[0]?.duration && (
                              <span>
                                ⏸️ Resume at:{" "}
                                {formatResumeTime(watchHistory.resumeTime)} (
                                {Math.round(
                                  (watchHistory.resumeTime /
                                    scene.files[0].duration) *
                                    100
                                )}
                                %)
                              </span>
                            )}
                          {watchHistory.playDuration > 0 && (
                            <span>
                              ⏱️ Watched:{" "}
                              {formatDuration(watchHistory.playDuration)}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Stats Row */}
                      <div className="flex items-center gap-2 mb-2">
                        <SceneStats scene={scene} watchHistory={watchHistory} />
                        {showSessionOIndicator && hadOInLastSession() && (
                          <span
                            className="text-xs px-2 py-0.5 rounded-full"
                            style={{
                              backgroundColor: "rgba(34, 197, 94, 0.1)",
                              color: "rgb(34, 197, 94)",
                              border: "1px solid rgba(34, 197, 94, 0.3)",
                            }}
                            title="O clicked during this session"
                          >
                            💦
                          </span>
                        )}
                      </div>

                      {/* Description */}
                      {getSceneDescription(scene) && (
                        <div className="mb-2">
                          <ExpandableDescription
                            description={getSceneDescription(scene)}
                            maxLines={2}
                          />
                        </div>
                      )}

                      {/* Performers & Tags */}
                      <SceneMetadata scene={scene} />
                    </>
                  ) : (
                    <>
                      <h3
                        className="text-lg font-semibold mb-2"
                        style={{ color: "var(--status-error-text)" }}
                      >
                        ⚠️ Scene Deleted or Not Found
                      </h3>
                      <p
                        className="text-sm mb-2"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Scene ID: {sceneId} • This scene was removed from Stash
                      </p>
                      <p
                        className="text-xs px-2 py-1 rounded inline-block"
                        style={{
                          backgroundColor: "var(--status-error-bg)",
                          color: "var(--status-error-text)",
                        }}
                      >
                        Click "Remove" to clean up this playlist
                      </p>
                    </>
                  )}
                </div>

                {/* Action Buttons - Desktop only */}
                {actionButtons && (
                  <div className="hidden md:block">{actionButtons}</div>
                )}
              </div>
            </div>

            {/* Action Buttons - Mobile only at bottom */}
            {actionButtons && (
              <div className="flex justify-center mt-4 mb-2 md:hidden">
                {actionButtons}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SceneListItem;
