import { Link } from "react-router-dom";
import { formatRelativeTime } from "../../utils/date.js";
import { getSceneTitle } from "../../utils/format.js";
import { useConfig } from "../../contexts/ConfigContext.jsx";
import { getEntityPath } from "../../utils/entityLinks.js";

/**
 * Scene title with link and subtitle (studio • code • date)
 * Matches SceneCard subtitle format for consistency
 */
const SceneTitle = ({
  scene,
  linkState,
  showDate = true,
  showSubtitle = false, // New: show subtitle with studio • code • date (like SceneCard)
  titleClassName = "",
  dateClassName = "",
  maxLines = null, // Optional: limit title to specific number of lines
}) => {
  const { hasMultipleInstances } = useConfig();
  const title = getSceneTitle(scene);
  const date = scene.date ? formatRelativeTime(scene.date) : null;

  // Build subtitle with studio, code, and date (like SceneCard)
  const subtitle = (() => {
    if (!showSubtitle) return null;
    const parts = [];

    if (scene.studio) {
      parts.push(scene.studio.name);
    }

    if (scene.code) {
      parts.push(scene.code);
    }

    if (date) {
      parts.push(date);
    }

    return parts.length > 0 ? parts.join(" • ") : null;
  })();

  // Handle click to set autoplay flag if video is playing
  const handleClick = () => {
    // Check if there's a video player currently playing and we're in a playlist
    if (linkState?.playlist) {
      const videoElements = document.querySelectorAll("video");
      let isPlaying = false;

      videoElements.forEach((video) => {
        if (!video.paused && !video.ended && video.readyState > 2) {
          isPlaying = true;
        }
      });

      if (isPlaying) {
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
    }
  };

  const titleStyle = maxLines
    ? {
        color: "var(--text-primary)",
        display: "-webkit-box",
        WebkitLineClamp: maxLines,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
        minHeight: maxLines === 2 ? "2.5rem" : undefined, // Fixed height for 2-line titles
        maxHeight: maxLines === 2 ? "2.5rem" : undefined,
      }
    : {
        color: "var(--text-primary)",
      };

  return (
    <div>
      <Link
        to={getEntityPath('scene', scene, hasMultipleInstances)}
        state={linkState}
        onClick={handleClick}
        className={`font-semibold hover:underline block ${titleClassName}`}
        style={titleStyle}
      >
        {title}
      </Link>

      {/* Show subtitle (studio • code • date) if enabled, otherwise just date */}
      {showSubtitle && subtitle ? (
        <div
          className={`text-xs ${dateClassName}`}
          style={{ color: "var(--text-muted)" }}
        >
          {subtitle}
        </div>
      ) : (
        showDate && (
          <div
            className={`text-xs ${dateClassName}`}
            style={{ color: "var(--text-muted)" }}
          >
            {date || "No date"}
          </div>
        )
      )}
    </div>
  );
};

export default SceneTitle;
