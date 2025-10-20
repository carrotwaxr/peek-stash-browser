import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, List, Shuffle, Repeat, Repeat1 } from "lucide-react";
import { usePlaylistNavigation } from "../video-player/usePlaylistNavigation.js";

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
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
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

      activeContainer.style.cursor = 'grabbing';
      activeContainer.style.userSelect = 'none';
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
        scrollContainer.current.style.cursor = 'grab';
        scrollContainer.current.style.userSelect = 'auto';
        scrollContainer.current = null;
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const navigateToScene = (index) => {
    // Prevent navigation if we just dragged
    if (hasDragged.current) {
      hasDragged.current = false;
      return;
    }

    if (index < 0 || index >= totalScenes) return;

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
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {playlist.name}
              </p>
            ) : (
              <button
                onClick={goToPlaylist}
                className="text-sm hover:underline"
                style={{ color: "var(--text-secondary)" }}
              >
                {playlist.name}
              </button>
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
          <button
            onClick={toggleShuffle}
            className="p-1.5 sm:p-2 rounded-lg transition-all"
            style={{
              backgroundColor: shuffle ? "var(--accent-warning)" : "transparent",
              border: shuffle ? "2px solid var(--accent-warning)" : "1px solid var(--border-color)",
              color: shuffle ? "white" : "var(--text-muted)",
            }}
            title={shuffle ? "Shuffle: On" : "Shuffle: Off"}
            aria-label={shuffle ? "Disable shuffle" : "Enable shuffle"}
          >
            <Shuffle size={16} />
          </button>

          {/* Repeat Toggle */}
          <button
            onClick={toggleRepeat}
            className="p-1.5 sm:p-2 rounded-lg transition-all"
            style={{
              backgroundColor: repeat !== "none" ? "var(--accent-info)" : "transparent",
              border: repeat !== "none" ? "2px solid var(--accent-info)" : "1px solid var(--border-color)",
              color: repeat !== "none" ? "white" : "var(--text-muted)",
            }}
            title={
              repeat === "one" ? "Repeat: One" :
              repeat === "all" ? "Repeat: All" :
              "Repeat: Off"
            }
            aria-label={
              repeat === "one" ? "Disable repeat one" :
              repeat === "all" ? "Switch to repeat one" :
              "Enable repeat all"
            }
          >
            {repeat === "one" ? <Repeat1 size={16} /> : <Repeat size={16} />}
          </button>

          {!isVirtualPlaylist && (
            <button
              onClick={goToPlaylist}
              className="px-2 py-1.5 sm:px-3 sm:py-1.5 rounded-lg flex items-center gap-2 transition-colors text-sm whitespace-nowrap"
              style={{
                backgroundColor: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
              }}
            >
              <List size={14} />
              <span className="hidden sm:inline">View All</span>
            </button>
          )}
        </div>
      </div>

      {/* Navigation buttons on mobile (stacked above thumbnails) */}
      <div className="flex md:hidden items-center gap-2 mb-3">
        <button
          onClick={handlePrevious}
          disabled={!hasPrevious}
          className="flex-1 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"
          style={{
            backgroundColor: hasPrevious
              ? "var(--bg-secondary)"
              : "var(--bg-primary)",
            border: "1px solid var(--border-color)",
            color: hasPrevious ? "var(--text-primary)" : "var(--text-muted)",
            cursor: hasPrevious ? "pointer" : "not-allowed",
            opacity: hasPrevious ? 1 : 0.5,
          }}
          aria-label="Previous scene"
        >
          <ChevronLeft size={20} />
          Previous
        </button>

        <button
          onClick={handleNext}
          disabled={!hasNext}
          className="flex-1 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"
          style={{
            backgroundColor: hasNext ? "var(--bg-secondary)" : "var(--bg-primary)",
            border: "1px solid var(--border-color)",
            color: hasNext ? "var(--text-primary)" : "var(--text-muted)",
            cursor: hasNext ? "pointer" : "not-allowed",
            opacity: hasNext ? 1 : 0.5,
          }}
          aria-label="Next scene"
        >
          Next
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Desktop: Navigation buttons inline with thumbnails */}
      <div className="hidden md:flex items-center gap-2">
        {/* Previous Button */}
        <button
          onClick={handlePrevious}
          disabled={!hasPrevious}
          className="p-2 rounded-lg transition-colors flex-shrink-0"
          style={{
            backgroundColor: hasPrevious
              ? "var(--bg-secondary)"
              : "var(--bg-primary)",
            border: "1px solid var(--border-color)",
            color: hasPrevious ? "var(--text-primary)" : "var(--text-muted)",
            cursor: hasPrevious ? "pointer" : "not-allowed",
            opacity: hasPrevious ? 1 : 0.5,
          }}
          aria-label="Previous scene"
        >
          <ChevronLeft size={24} />
        </button>

        {/* Thumbnail Strip */}
        <div
          ref={desktopScrollRef}
          className="flex gap-2 overflow-x-auto flex-1 scroll-smooth playlist-thumbnail-scroll"
          style={{ cursor: 'grab' }}
        >
          {playlist.scenes.map((item, index) => {
            const scene = item.scene;
            const isCurrent = index === currentIndex;

            return (
              <button
                key={item.sceneId}
                ref={isCurrent ? currentThumbnailRef : null}
                onClick={() => navigateToScene(index)}
                className="flex-shrink-0 rounded overflow-hidden transition-all"
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
              </button>
            );
          })}
        </div>

        {/* Next Button */}
        <button
          onClick={handleNext}
          disabled={!hasNext}
          className="p-2 rounded-lg transition-colors flex-shrink-0"
          style={{
            backgroundColor: hasNext ? "var(--bg-secondary)" : "var(--bg-primary)",
            border: "1px solid var(--border-color)",
            color: hasNext ? "var(--text-primary)" : "var(--text-muted)",
            cursor: hasNext ? "pointer" : "not-allowed",
            opacity: hasNext ? 1 : 0.5,
          }}
          aria-label="Next scene"
        >
          <ChevronRight size={24} />
        </button>
      </div>

      {/* Mobile: Thumbnail strip only (buttons above) */}
      <div
        ref={mobileScrollRef}
        className="md:hidden overflow-x-auto scroll-smooth playlist-thumbnail-scroll"
        style={{ cursor: 'grab' }}
      >
        <div className="flex gap-2">
          {playlist.scenes.map((item, index) => {
            const scene = item.scene;
            const isCurrent = index === currentIndex;

            return (
              <button
                key={item.sceneId}
                ref={isCurrent ? currentThumbnailRef : null}
                onClick={() => navigateToScene(index)}
                className="flex-shrink-0 rounded overflow-hidden transition-all"
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
              </button>
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
