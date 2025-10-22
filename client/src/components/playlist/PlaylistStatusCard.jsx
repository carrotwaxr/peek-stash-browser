import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  List,
  Shuffle,
  Repeat,
  Repeat1,
} from "lucide-react";
import { usePlaylistNavigation } from "../video-player/usePlaylistNavigation.js";
import Button from "../ui/Button.jsx";

/**
 * PlaylistStatusCard - Shows playlist context when viewing a scene from a playlist
 * Displays current position, navigation controls, and quick scene access
 */
const PlaylistStatusCard = ({ playlist, currentIndex }) => {
  const navigate = useNavigate();
  const currentThumbnailRef = useRef(null);
  const desktopScrollRef = useRef(null);
  const mobileScrollRef = useRef(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);
  const scrollContainer = useRef(null); // Which container is being dragged
  const hasDragged = useRef(false);

  // Shuffle and repeat state (initialize from playlist)
  const [shuffle, setShuffle] = useState(playlist?.shuffle || false);
  const [repeat, setRepeat] = useState(playlist?.repeat || "none");

  // Use playlist navigation hook for smart next/previous
  const { playNextInPlaylist, playPreviousInPlaylist } = usePlaylistNavigation(
    { ...playlist, shuffle, repeat },
    currentIndex,
    navigate
  );

  if (!playlist || !playlist.scenes || playlist.scenes.length === 0) {
    return null;
  }

  const totalScenes = playlist.scenes.length;
  const position = currentIndex + 1;
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < totalScenes - 1;
  const isVirtualPlaylist = playlist.id?.startsWith?.("virtual-");

  // Scroll current thumbnail into view when currentIndex changes
  useEffect(() => {
    if (currentThumbnailRef.current) {
      currentThumbnailRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [currentIndex]);

  // Add/remove document-level listeners for mouse events
  useEffect(() => {
    const handleMouseDown = (e) => {
      // Check which container (if any) contains the mouse target
      let activeContainer = null;
      if (desktopScrollRef.current?.contains(e.target)) {
        activeContainer = desktopScrollRef.current;
      } else if (mobileScrollRef.current?.contains(e.target)) {
        activeContainer = mobileScrollRef.current;
      }

      if (!activeContainer) return;

      // Only handle left mouse button
      if (e.button !== 0) return;

      e.preventDefault(); // Prevent text selection and default behaviors

      isDragging.current = true;
      hasDragged.current = false;
      scrollContainer.current = activeContainer;
      startX.current = e.clientX;
      scrollLeft.current = activeContainer.scrollLeft;

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

      scrollContainer.current.scrollLeft = scrollLeft.current + walk;
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
  }, []);

  const navigateToScene = (index) => {
    // Prevent navigation if we just dragged
    if (hasDragged.current) {
      hasDragged.current = false;
      return;
    }

    if (index < 0 || index >= totalScenes) return;

    // Check if there's a video player currently playing
    // If so, set autoplay flag for next video
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

    const targetScene = playlist.scenes[index];
    navigate(`/video/${targetScene.sceneId}`, {
      state: {
        scene: targetScene.scene,
        playlist: {
          ...playlist,
          currentIndex: index,
        },
      },
    });
  };

  const handlePrevious = () => {
    if (shuffle || repeat !== "none") {
      // Use smart navigation with shuffle/repeat support
      playPreviousInPlaylist?.();
    } else if (hasPrevious) {
      // Simple navigation for non-shuffle, non-repeat
      navigateToScene(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (shuffle || repeat !== "none") {
      // Use smart navigation with shuffle/repeat support
      playNextInPlaylist?.();
    } else if (hasNext) {
      // Simple navigation for non-shuffle, non-repeat
      navigateToScene(currentIndex + 1);
    }
  };

  const goToPlaylist = () => {
    navigate(`/playlist/${playlist.id}`);
  };

  const toggleShuffle = () => {
    const newShuffle = !shuffle;
    setShuffle(newShuffle);

    // Update playlist state with new shuffle setting
    navigate(window.location.pathname, {
      state: {
        scene: playlist.scenes[currentIndex]?.scene,
        playlist: {
          ...playlist,
          shuffle: newShuffle,
          repeat: repeat,
          currentIndex: currentIndex,
        },
      },
      replace: true,
    });
  };

  const toggleRepeat = () => {
    const repeatModes = ["none", "all", "one"];
    const currentIdx = repeatModes.indexOf(repeat);
    const newRepeat = repeatModes[(currentIdx + 1) % repeatModes.length];
    setRepeat(newRepeat);

    // Update playlist state with new repeat setting
    navigate(window.location.pathname, {
      state: {
        scene: playlist.scenes[currentIndex]?.scene,
        playlist: {
          ...playlist,
          shuffle: shuffle,
          repeat: newRepeat,
          currentIndex: currentIndex,
        },
      },
      replace: true,
    });
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
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
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
                    style={{ color: "var(--accent-info)" }}
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

              {/* Shuffle Toggle */}
              <Button
                onClick={toggleShuffle}
                variant="secondary"
                size="sm"
                className="p-1.5 sm:p-2"
                {...(shuffle && {
                  style: {
                    border: "2px solid var(--accent-info)",
                    color: "var(--accent-info)",
                  },
                })}
                icon={<Shuffle size={16} />}
                title={shuffle ? "Shuffle: On" : "Shuffle: Off"}
                aria-label={shuffle ? "Disable shuffle" : "Enable shuffle"}
              />

              {/* Repeat Toggle */}
              <Button
                onClick={toggleRepeat}
                variant="secondary"
                size="sm"
                className="p-1.5 sm:p-2"
                {...(repeat !== "none" && {
                  style: {
                    border: "2px solid var(--accent-info)",
                    color: "var(--accent-info)",
                  },
                })}
                icon={
                  repeat === "one" ? (
                    <Repeat1 size={16} />
                  ) : (
                    <Repeat size={16} />
                  )
                }
                title={
                  repeat === "one"
                    ? "Repeat: One"
                    : repeat === "all"
                    ? "Repeat: All"
                    : "Repeat: Off"
                }
                aria-label={
                  repeat === "one"
                    ? "Disable repeat one"
                    : repeat === "all"
                    ? "Switch to repeat one"
                    : "Enable repeat all"
                }
              />

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
              ref={desktopScrollRef}
              className="flex gap-2 overflow-x-auto flex-1 scroll-smooth playlist-thumbnail-scroll"
              style={{ cursor: "grab" }}
            >
              {playlist.scenes.map((item, index) => {
                const scene = item.scene;
                const isCurrent = index === currentIndex;

                return (
                  <Button
                    key={item.sceneId}
                    ref={isCurrent ? currentThumbnailRef : null}
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
                    title={scene?.title || `Scene ${index + 1}`}
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
            ref={mobileScrollRef}
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
                    ref={isCurrent ? currentThumbnailRef : null}
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
                    title={scene?.title || `Scene ${index + 1}`}
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
