import { useEffect, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  List,
  PlayCircle,
  Repeat,
  Repeat1,
  Shuffle,
} from "lucide-react";
import { useScenePlayer } from "../../contexts/ScenePlayerContext.jsx";
import { useScrollToCurrentItem } from "../../hooks/useScrollToCurrentItem.js";
import { getSceneTitle } from "../../utils/format.js";
import { Button } from "../ui/index.js";

/**
 * PlaylistStatusCard - Shows playlist context when viewing a scene from a playlist
 * Displays current position, navigation controls, and quick scene access
 */
const PlaylistStatusCard = () => {
  const {
    playlist,
    currentIndex,
    gotoSceneIndex,
    nextScene,
    prevScene,
    dispatch,
    toggleAutoplayNext,
    toggleShuffle,
    toggleRepeat,
  } = useScenePlayer();

  // Auto-scroll to current thumbnail for both md (tablet) and mobile layouts
  // This component is visible from sm to lg breakpoints (lg:hidden wrapper in Scene.jsx)
  // containerRef = callback ref for JSX, containerElRef = regular ref for reading .current
  const {
    containerRef: mdScrollRef,
    containerElRef: mdScrollElRef,
    setCurrentItemRef: setMdCurrentRef,
  } = useScrollToCurrentItem(currentIndex, { direction: "horizontal", delay: 150 });

  const {
    containerRef: smScrollRef,
    containerElRef: smScrollElRef,
    setCurrentItemRef: setSmCurrentRef,
  } = useScrollToCurrentItem(currentIndex, { direction: "horizontal", delay: 150 });

  // Drag-to-scroll state
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeftPos = useRef(0);
  const scrollContainer = useRef(null);
  const hasDragged = useRef(false);

  // Add/remove document-level listeners for mouse events (drag-to-scroll)
  useEffect(() => {
    const handleMouseDown = (e) => {
      // Check if mouse is in either scroll container (use ElRef for reading .current)
      let activeContainer = null;
      if (mdScrollElRef.current?.contains(e.target)) {
        activeContainer = mdScrollElRef.current;
      } else if (smScrollElRef.current?.contains(e.target)) {
        activeContainer = smScrollElRef.current;
      }

      if (!activeContainer) return;

      // Only handle left mouse button
      if (e.button !== 0) return;

      e.preventDefault(); // Prevent text selection and default behaviors

      isDragging.current = true;
      hasDragged.current = false;
      scrollContainer.current = activeContainer;
      startX.current = e.clientX;
      scrollLeftPos.current = activeContainer.scrollLeft;

      activeContainer.style.cursor = "grabbing";
      activeContainer.style.userSelect = "none";
    };

    const handleMouseMove = (e) => {
      if (!isDragging.current || !scrollContainer.current) return;

      e.preventDefault();

      const x = e.clientX;
      const walk = (startX.current - x) * 2;

      // If we've moved more than 5px, consider it a drag
      if (Math.abs(walk) > 5) {
        hasDragged.current = true;
      }

      scrollContainer.current.scrollLeft = scrollLeftPos.current + walk;
    };

    const handleMouseUp = () => {
      if (!isDragging.current) return;

      isDragging.current = false;

      if (scrollContainer.current) {
        scrollContainer.current.style.cursor = "grab";
        scrollContainer.current.style.userSelect = "auto";
        scrollContainer.current = null;
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [mdScrollElRef, smScrollElRef]);

  if (!playlist || !playlist.scenes || playlist.scenes.length === 0) {
    return null;
  }

  const totalScenes = playlist.scenes.length;
  const position = currentIndex + 1;
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < totalScenes - 1;
  const isVirtualPlaylist = playlist.id?.startsWith?.("virtual-");

  const navigateToScene = (index) => {
    // Prevent navigation if we just dragged
    if (hasDragged.current) {
      hasDragged.current = false;
      return;
    }

    if (index < 0 || index >= totalScenes) return;

    // Check if there's a video player currently playing
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

    // Navigate with autoplay flag if video is currently playing
    gotoSceneIndex(index, isPlaying);
  };

  // Check if video is currently playing (for autoplay on navigation)
  const isVideoPlaying = () => {
    const videoElements = document.querySelectorAll("video");
    for (const video of videoElements) {
      if (!video.paused && !video.ended && video.readyState > 2) {
        return true;
      }
    }
    return false;
  };

  const handlePrevious = () => {
    const shouldAutoplay = isVideoPlaying();
    dispatch({ type: "SET_SHOULD_AUTOPLAY", payload: shouldAutoplay });
    prevScene();
  };

  const handleNext = () => {
    const shouldAutoplay = isVideoPlaying();
    dispatch({ type: "SET_SHOULD_AUTOPLAY", payload: shouldAutoplay });
    nextScene();
  };

  const goToPlaylist = () => {
    // Navigate to playlist page (different route, so we use window.location)
    window.location.href = `/playlist/${playlist.id}`;
  };

  return (
    <>
      <div className="px-1 md:px-4 mt-6 mb-6">
        <div
          className="rounded-lg border p-4"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
          }}
        >
          {/* Header - SM+ Layout: Stacked label/name, position + controls on same row */}
          <div className="hidden sm:flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <List size={20} style={{ color: "var(--text-secondary)" }} />
              <div>
                <h3
                  className="font-semibold text-sm"
                  style={{ color: "var(--text-primary)" }}
                >
                  {isVirtualPlaylist ? "Browsing" : "Playing from Playlist"}
                </h3>
                {isVirtualPlaylist ? (
                  <p
                    className="text-sm"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {playlist.name}
                  </p>
                ) : (
                  <Button
                    onClick={goToPlaylist}
                    variant="tertiary"
                    size="sm"
                    className="text-sm hover:underline !p-0"
                    style={{ color: "var(--status-info)" }}
                  >
                    {playlist.name}
                  </Button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <div
                className="text-sm font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                {position} of {totalScenes}
              </div>

              {/* Autoplay Next */}
              <button
                onClick={toggleAutoplayNext}
                className="p-1.5 sm:p-2 rounded transition-colors focus:outline-none"
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
                aria-label={
                  playlist.autoplayNext
                    ? "Disable autoplay"
                    : "Enable autoplay"
                }
              >
                <PlayCircle size={16} />
              </button>

              {/* Shuffle Toggle */}
              <button
                onClick={toggleShuffle}
                className="p-1.5 sm:p-2 rounded transition-colors focus:outline-none"
                style={{
                  backgroundColor: playlist.shuffle
                    ? "var(--accent-primary)"
                    : "transparent",
                  color: playlist.shuffle ? "white" : "var(--text-secondary)",
                  border: "1px solid var(--border-color)",
                }}
                title={playlist.shuffle ? "Shuffle: On" : "Shuffle: Off"}
                aria-label={
                  playlist.shuffle ? "Disable shuffle" : "Enable shuffle"
                }
              >
                <Shuffle size={16} />
              </button>

              {/* Repeat Toggle */}
              <button
                onClick={toggleRepeat}
                className="p-1.5 sm:p-2 rounded transition-colors focus:outline-none"
                style={{
                  backgroundColor:
                    playlist.repeat !== "none"
                      ? "var(--accent-primary)"
                      : "transparent",
                  color:
                    playlist.repeat !== "none"
                      ? "white"
                      : "var(--text-secondary)",
                  border: "1px solid var(--border-color)",
                }}
                title={
                  playlist.repeat === "one"
                    ? "Repeat: One"
                    : playlist.repeat === "all"
                      ? "Repeat: All"
                      : "Repeat: Off"
                }
                aria-label={
                  playlist.repeat === "one"
                    ? "Disable repeat one"
                    : playlist.repeat === "all"
                      ? "Switch to repeat one"
                      : "Enable repeat all"
                }
              >
                {playlist.repeat === "one" ? (
                  <Repeat1 size={16} />
                ) : (
                  <Repeat size={16} />
                )}
              </button>

              {!isVirtualPlaylist && (
                <Button
                  onClick={goToPlaylist}
                  variant="secondary"
                  size="sm"
                  className="px-2 py-1.5 sm:px-3 sm:py-1.5 text-sm"
                  icon={<List size={14} />}
                >
                  <span className="hidden sm:inline">View All</span>
                </Button>
              )}
            </div>
          </div>

          {/* Header - < SM Layout: Two rows */}
          <div className="flex sm:hidden flex-col gap-2 mb-3">
            {/* Row 1: Browsing: Name (inline) */}
            <div className="flex items-center gap-2">
              <List size={18} style={{ color: "var(--text-secondary)" }} />
              <div className="flex items-baseline gap-1.5">
                <h3
                  className="font-semibold text-sm"
                  style={{ color: "var(--text-primary)" }}
                >
                  {isVirtualPlaylist ? "Browsing:" : "Playing from Playlist:"}
                </h3>
                {isVirtualPlaylist ? (
                  <p
                    className="text-sm"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {playlist.name}
                  </p>
                ) : (
                  <Button
                    onClick={goToPlaylist}
                    variant="tertiary"
                    size="sm"
                    className="text-sm hover:underline !p-0"
                    style={{ color: "var(--status-info)" }}
                  >
                    {playlist.name}
                  </Button>
                )}
              </div>
            </div>

            {/* Row 2: Position + Controls with space-between */}
            <div className="flex items-center justify-between">
              <div
                className="text-sm font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                {position} / {totalScenes}
              </div>

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
                  aria-label={
                    playlist.autoplayNext
                      ? "Disable autoplay"
                      : "Enable autoplay"
                  }
                >
                  <PlayCircle size={16} />
                </button>

                {/* Shuffle Toggle */}
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
                  aria-label={
                    playlist.shuffle ? "Disable shuffle" : "Enable shuffle"
                  }
                >
                  <Shuffle size={16} />
                </button>

                {/* Repeat Toggle */}
                <button
                  onClick={toggleRepeat}
                  className="p-1.5 rounded transition-colors focus:outline-none"
                  style={{
                    backgroundColor:
                      playlist.repeat !== "none"
                        ? "var(--accent-primary)"
                        : "transparent",
                    color:
                      playlist.repeat !== "none"
                        ? "white"
                        : "var(--text-secondary)",
                    border: "1px solid var(--border-color)",
                  }}
                  title={
                    playlist.repeat === "one"
                      ? "Repeat: One"
                      : playlist.repeat === "all"
                        ? "Repeat: All"
                        : "Repeat: Off"
                  }
                  aria-label={
                    playlist.repeat === "one"
                      ? "Disable repeat one"
                      : playlist.repeat === "all"
                        ? "Switch to repeat one"
                        : "Enable repeat all"
                  }
                >
                  {playlist.repeat === "one" ? (
                    <Repeat1 size={16} />
                  ) : (
                    <Repeat size={16} />
                  )}
                </button>

                {!isVirtualPlaylist && (
                  <Button
                    onClick={goToPlaylist}
                    variant="secondary"
                    size="sm"
                    className="px-2 py-1.5 text-sm"
                    icon={<List size={14} />}
                  >
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Navigation buttons on mobile (stacked above thumbnails) */}
          <div className="flex md:hidden items-center gap-2 mb-3">
            <Button
              onClick={handlePrevious}
              disabled={!hasPrevious}
              variant="secondary"
              fullWidth
              icon={<ChevronLeft size={20} />}
              aria-label="Previous scene"
            >
              Previous
            </Button>

            <Button
              onClick={handleNext}
              disabled={!hasNext}
              variant="secondary"
              fullWidth
              icon={<ChevronRight size={20} />}
              iconPosition="right"
              aria-label="Next scene"
            >
              Next
            </Button>
          </div>

          {/* Desktop: Navigation buttons inline with thumbnails */}
          <div className="hidden md:flex items-center gap-2">
            {/* Previous Button */}
            <Button
              onClick={handlePrevious}
              disabled={!hasPrevious}
              variant="secondary"
              icon={<ChevronLeft size={24} />}
              aria-label="Previous scene"
            />

            {/* Thumbnail Strip */}
            <div
              ref={mdScrollRef}
              className="flex gap-2 overflow-x-auto flex-1 scroll-smooth playlist-thumbnail-scroll"
              style={{ cursor: "grab" }}
            >
              {playlist.scenes.map((item, index) => {
                const scene = item.scene;
                const isCurrent = index === currentIndex;

                return (
                  <Button
                    key={item.sceneId}
                    ref={isCurrent ? setMdCurrentRef : null}
                    onClick={() => navigateToScene(index)}
                    variant="tertiary"
                    className="flex-shrink-0 overflow-hidden !p-0"
                    style={{
                      width: isCurrent ? "120px" : "80px",
                      height: isCurrent ? "68px" : "45px",
                      border: isCurrent
                        ? "2px solid var(--accent-color)"
                        : "1px solid var(--border-color)",
                      opacity: isCurrent ? 1 : 0.6,
                    }}
                    title={getSceneTitle(scene)}
                  >
                    {scene?.paths?.screenshot ? (
                      <img
                        src={scene.paths.screenshot}
                        alt={scene.title || `Scene ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center"
                        style={{ backgroundColor: "var(--bg-secondary)" }}
                      >
                        <span style={{ color: "var(--text-muted)" }}>
                          {index + 1}
                        </span>
                      </div>
                    )}
                  </Button>
                );
              })}
            </div>

            {/* Next Button */}
            <Button
              onClick={handleNext}
              disabled={!hasNext}
              variant="secondary"
              icon={<ChevronRight size={24} />}
              aria-label="Next scene"
            />
          </div>

          {/* Mobile: Thumbnail strip only (buttons above) */}
          <div
            ref={smScrollRef}
            className="md:hidden overflow-x-auto scroll-smooth playlist-thumbnail-scroll"
            style={{ cursor: "grab" }}
          >
            <div className="flex gap-2">
              {playlist.scenes.map((item, index) => {
                const scene = item.scene;
                const isCurrent = index === currentIndex;

                return (
                  <Button
                    key={item.sceneId}
                    ref={isCurrent ? setSmCurrentRef : null}
                    onClick={() => navigateToScene(index)}
                    variant="tertiary"
                    className="flex-shrink-0 overflow-hidden !p-0"
                    style={{
                      width: isCurrent ? "120px" : "80px",
                      height: isCurrent ? "68px" : "45px",
                      border: isCurrent
                        ? "2px solid var(--accent-color)"
                        : "1px solid var(--border-color)",
                      opacity: isCurrent ? 1 : 0.6,
                    }}
                    title={getSceneTitle(scene)}
                  >
                    {scene?.paths?.screenshot ? (
                      <img
                        src={scene.paths.screenshot}
                        alt={scene.title || `Scene ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center"
                        style={{ backgroundColor: "var(--bg-secondary)" }}
                      >
                        <span style={{ color: "var(--text-muted)" }}>
                          {index + 1}
                        </span>
                      </div>
                    )}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <style>{`
      .playlist-thumbnail-scroll {
        scrollbar-width: none; /* Firefox */
        -ms-overflow-style: none; /* IE and Edge */
      }
      .playlist-thumbnail-scroll::-webkit-scrollbar {
        display: none; /* Chrome, Safari, Opera */
      }
    `}</style>
    </>
  );
};

export default PlaylistStatusCard;
