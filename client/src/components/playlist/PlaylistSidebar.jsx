import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  List,
  Play,
  PlayCircle,
  Repeat,
  Repeat1,
  Shuffle,
} from "lucide-react";
import { useScenePlayer } from "../../contexts/ScenePlayerContext.jsx";
import { useScrollToCurrentItem } from "../../hooks/useScrollToCurrentItem.js";
import { Button, useLazyLoad } from "../ui/index.js";

/**
 * PlaylistSidebar - Vertical playlist controls optimized for sidebar display
 * Similar to YouTube's playlist sidebar on desktop
 * @param {number} maxHeight - Maximum height in pixels to match left column
 */
const PlaylistSidebar = ({ maxHeight }) => {
  const {
    playlist,
    currentIndex,
    gotoSceneIndex,
    toggleAutoplayNext,
    toggleShuffle,
    toggleRepeat,
  } = useScenePlayer();
  const [isExpanded, setIsExpanded] = useState(true);

  // Auto-scroll to current item when it changes
  const { containerRef: listContainerRef, setCurrentItemRef } =
    useScrollToCurrentItem(currentIndex, { direction: "vertical", delay: 150 });

  if (!playlist || !playlist.scenes || playlist.scenes.length === 0) {
    return null;
  }

  const totalScenes = playlist.scenes.length;
  const position = currentIndex + 1;
  const isVirtualPlaylist = playlist.id?.startsWith?.("virtual-");
  const _currentScene = playlist.scenes[currentIndex];

  // Find next scene for "Up Next" preview
  const nextSceneIndex = currentIndex + 1;
  const nextScene =
    nextSceneIndex < totalScenes ? playlist.scenes[nextSceneIndex] : null;

  const formatDuration = (seconds) => {
    if (!seconds) return "?:??";
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

  const navigateToScene = (index) => {
    if (index < 0 || index >= totalScenes) return;

    // Check if video is currently playing
    const videoElements = document.querySelectorAll("video");
    let isPlaying = false;

    videoElements.forEach((video) => {
      if (!video.paused && !video.ended && video.readyState > 2) {
        isPlaying = true;
      }
    });

    // Preserve fullscreen state
    if (isPlaying) {
      const isFullscreen =
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement;
      if (isFullscreen) {
        sessionStorage.setItem("videoPlayerFullscreen", "true");
      }
    }

    // Navigate with autoplay flag
    gotoSceneIndex(index, isPlaying);
  };

  const goToPlaylist = () => {
    window.location.href = `/playlist/${playlist.id}`;
  };

  return (
    <div
      className="rounded-lg border overflow-hidden flex flex-col"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-color)",
        ...(maxHeight && { height: `${maxHeight}px` }),
      }}
    >
      {/* Header */}
      <div
        className="p-4 border-b flex-shrink-0"
        style={{ borderColor: "var(--border-color)" }}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <List size={18} style={{ color: "var(--text-secondary)" }} />
            <div className="flex-1 min-w-0">
              <h3
                className="font-semibold text-sm"
                style={{ color: "var(--text-primary)" }}
              >
                {isVirtualPlaylist ? "Browsing" : "Playlist"}
              </h3>
              {isVirtualPlaylist ? (
                <p
                  className="text-xs truncate"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {playlist.name}
                </p>
              ) : (
                <Button
                  onClick={goToPlaylist}
                  variant="tertiary"
                  size="sm"
                  className="text-xs hover:underline !p-0 truncate max-w-full"
                  style={{ color: "var(--status-info)" }}
                >
                  {playlist.name}
                </Button>
              )}
            </div>
          </div>

          {/* Collapse toggle */}
          <Button
            onClick={() => setIsExpanded(!isExpanded)}
            variant="tertiary"
            size="sm"
            className="p-1 flex-shrink-0 ml-2"
            icon={
              isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />
            }
            aria-label={isExpanded ? "Collapse playlist" : "Expand playlist"}
          />
        </div>

        {/* Control buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Autoplay Next */}
            <button
              onClick={toggleAutoplayNext}
              className="p-1.5 rounded transition-colors focus:outline-none"
              style={{
                backgroundColor: playlist.autoplayNext
                  ? "var(--accent-primary)"
                  : "transparent",
                color: playlist.autoplayNext
                  ? "white"
                  : "var(--text-secondary)",
                border: "1px solid var(--border-color)",
              }}
              title={
                playlist.autoplayNext ? "Autoplay: On" : "Autoplay: Off"
              }
            >
              <PlayCircle size={14} />
            </button>

            {/* Shuffle */}
            <button
              onClick={toggleShuffle}
              className="p-1.5 rounded transition-colors focus:outline-none"
              style={{
                backgroundColor: playlist.shuffle
                  ? "var(--accent-primary)"
                  : "transparent",
                color: playlist.shuffle ? "white" : "var(--text-secondary)",
                border: "1px solid var(--border-color)",
              }}
              title={playlist.shuffle ? "Shuffle: On" : "Shuffle: Off"}
            >
              <Shuffle size={14} />
            </button>

            {/* Repeat */}
            <button
              onClick={toggleRepeat}
              className="p-1.5 rounded transition-colors focus:outline-none"
              style={{
                backgroundColor:
                  playlist.repeat !== "none"
                    ? "var(--accent-primary)"
                    : "transparent",
                color:
                  playlist.repeat !== "none" ? "white" : "var(--text-secondary)",
                border: "1px solid var(--border-color)",
              }}
              title={
                playlist.repeat === "one"
                  ? "Repeat: One"
                  : playlist.repeat === "all"
                    ? "Repeat: All"
                    : "Repeat: Off"
              }
            >
              {playlist.repeat === "one" ? (
                <Repeat1 size={14} />
              ) : (
                <Repeat size={14} />
              )}
            </button>
          </div>

          <div
            className="text-xs font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            {position} / {totalScenes}
          </div>
        </div>
      </div>

      {/* Expandable content */}
      {isExpanded && (
        <>
          {/* Up Next Preview (if not last scene) */}
          {nextScene && (
            <div
              className="p-3 border-b flex-shrink-0"
              style={{
                backgroundColor: "var(--bg-secondary)",
                borderColor: "var(--border-color)",
              }}
            >
              <p
                className="text-xs font-semibold uppercase tracking-wide mb-2"
                style={{ color: "var(--text-secondary)" }}
              >
                Up Next
              </p>
              <div
                onClick={() => navigateToScene(nextSceneIndex)}
                className="group cursor-pointer rounded overflow-hidden transition-all hover:scale-[1.02]"
                style={{
                  backgroundColor: "var(--bg-card)",
                }}
              >
                <div className="flex gap-2">
                  {/* Thumbnail with lazy loading and play overlay */}
                  <PlaylistThumbnail
                    src={nextScene.scene?.paths?.screenshot}
                    alt={nextScene.scene?.title || "Next scene"}
                    duration={nextScene.scene?.files?.[0]?.duration}
                    formatDuration={formatDuration}
                    fallbackText={nextSceneIndex + 1}
                    width="120px"
                    height="68px"
                    showPlayOverlay
                  />

                  {/* Info */}
                  <div className="flex-1 py-1 pr-2 min-w-0">
                    <h4
                      className="text-sm font-medium line-clamp-2 group-hover:underline"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {nextScene.scene?.title ||
                        nextScene.scene?.files?.[0]?.basename ||
                        "Untitled"}
                    </h4>
                    {nextScene.scene?.studio && (
                      <p
                        className="text-xs mt-1 line-clamp-1"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {nextScene.scene.studio.name}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Scene List */}
          <div ref={listContainerRef} className="flex-1 overflow-y-auto">
            {playlist.scenes.map((item, index) => {
              const scene = item.scene;
              const isCurrent = index === currentIndex;

              return (
                <div
                  key={item.sceneId}
                  ref={isCurrent ? setCurrentItemRef : null}
                  onClick={() => navigateToScene(index)}
                  className="group cursor-pointer p-3 border-b transition-colors hover:bg-opacity-80"
                  style={{
                    backgroundColor: isCurrent
                      ? "var(--bg-secondary)"
                      : "transparent",
                    borderColor: "var(--border-color)",
                  }}
                >
                  <div className="flex gap-3">
                    {/* Index/Current indicator */}
                    <div
                      className="flex-shrink-0 flex items-center justify-center"
                      style={{ width: "24px" }}
                    >
                      {isCurrent ? (
                        <Play
                          size={16}
                          style={{ color: "var(--accent-primary)" }}
                          fill="var(--accent-primary)"
                        />
                      ) : (
                        <span
                          className="text-sm font-medium"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {index + 1}
                        </span>
                      )}
                    </div>

                    {/* Thumbnail with lazy loading */}
                    <PlaylistThumbnail
                      src={scene?.paths?.screenshot}
                      alt={scene?.title || `Scene ${index + 1}`}
                      duration={scene?.files?.[0]?.duration}
                      formatDuration={formatDuration}
                      fallbackText={index + 1}
                      width="80px"
                      height="45px"
                      small
                    />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h4
                        className={`text-sm font-medium line-clamp-2 ${
                          !isCurrent && "group-hover:underline"
                        }`}
                        style={{
                          color: isCurrent
                            ? "var(--accent-primary)"
                            : "var(--text-primary)",
                        }}
                      >
                        {scene?.title ||
                          scene?.files?.[0]?.basename ||
                          "Untitled"}
                      </h4>
                      {scene?.studio && (
                        <p
                          className="text-xs mt-0.5 line-clamp-1"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {scene.studio.name}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

/**
 * PlaylistThumbnail - Lazy-loaded thumbnail for playlist items
 */
const PlaylistThumbnail = ({
  src,
  alt,
  duration,
  formatDuration,
  fallbackText,
  width,
  height,
  showPlayOverlay = false,
  small = false,
}) => {
  const [ref, shouldLoad] = useLazyLoad();

  return (
    <div
      ref={ref}
      className={`relative flex-shrink-0 ${small ? "rounded" : ""} overflow-hidden`}
      style={{
        width,
        height,
        backgroundColor: "var(--border-color)",
      }}
    >
      {shouldLoad && src ? (
        <img src={src} alt={alt} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <span
            className={small ? "text-xs" : ""}
            style={{ color: "var(--text-muted)" }}
          >
            {fallbackText}
          </span>
        </div>
      )}

      {/* Play icon overlay (for Up Next) */}
      {showPlayOverlay && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <Play size={24} style={{ color: "white" }} fill="white" />
          </div>
        </div>
      )}

      {/* Duration badge */}
      {duration && (
        <div
          className={`absolute ${small ? "bottom-0.5 right-0.5 px-1 py-0.5" : "bottom-1 right-1 px-1 py-0.5"} text-xs ${small ? "" : "font-medium"} rounded`}
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            color: "white",
            ...(small && { fontSize: "10px" }),
          }}
        >
          {formatDuration(duration)}
        </div>
      )}
    </div>
  );
};

export default PlaylistSidebar;
