import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  List,
  PlayCircle,
  Repeat,
  Repeat1,
  Shuffle,
} from "lucide-react";
import { useScenePlayer } from "../../contexts/ScenePlayerContext";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useQueueNavigation } from "../../hooks/useQueueNavigation";
import { useScrollToCurrentItem } from "../../hooks/useScrollToCurrentItem";
import { makeCompositeKey } from "../../utils/compositeKey";
import { getSceneTitle } from "../../utils/format";
import { Button } from "../ui/index";

interface PlaylistScene {
  sceneId: string;
  instanceId?: string;
  scene?: {
    title?: string;
    paths?: { screenshot?: string };
  };
}

interface Playlist {
  id?: string;
  name?: string;
  scenes?: PlaylistScene[];
}

/**
 * PlaylistStatusCard - Shows playlist context when viewing a scene from a playlist
 * Displays current position, navigation controls, and quick scene access
 */
const PlaylistStatusCard = () => {
  const {
    playlist: rawPlaylist,
    currentIndex,
    autoplayNext,
    shuffle,
    repeat,
    toggleAutoplayNext,
    toggleShuffle,
    toggleRepeat,
    unavailable,
  } = useScenePlayer();
  const { goTo, next, prev, canNext, canPrev } = useQueueNavigation();
  const navigate = useNavigate();
  const playlist = rawPlaylist as Playlist | null;
  // One thumbnail strip is mounted, not both: a long queue's screenshots
  // would otherwise load twice
  const showTabletStrip = useMediaQuery("(min-width: 768px)");

  // Auto-scroll to current thumbnail for both md (tablet) and mobile layouts
  // This component is visible from sm to lg breakpoints (lg:hidden wrapper in Scene.jsx)
  // containerRef = callback ref for JSX, containerElRef = regular ref for reading .current
  const {
    containerRef: mdScrollRef,
    containerElRef: mdScrollElRef,
    setCurrentItemRef: setMdCurrentRef,
  } = useScrollToCurrentItem(currentIndex, {
    direction: "horizontal",
    delay: 150,
  });

  const {
    containerRef: smScrollRef,
    containerElRef: smScrollElRef,
    setCurrentItemRef: setSmCurrentRef,
  } = useScrollToCurrentItem(currentIndex, {
    direction: "horizontal",
    delay: 150,
  });

  // Drag-to-scroll state
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeftPos = useRef(0);
  const scrollContainer = useRef<HTMLElement | null>(null);
  const hasDragged = useRef(false);

  // Add/remove document-level listeners for mouse events (drag-to-scroll)
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      // Check if mouse is in either scroll container (use ElRef for reading .current)
      let activeContainer: HTMLElement | null = null;
      if (mdScrollElRef.current?.contains(e.target as Node)) {
        activeContainer = mdScrollElRef.current;
      } else if (smScrollElRef.current?.contains(e.target as Node)) {
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

    const handleMouseMove = (e: MouseEvent) => {
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
  const isVirtualPlaylist = playlist.id?.startsWith?.("virtual-");

  const navigateToScene = (index: number) => {
    // Prevent navigation if we just dragged
    if (hasDragged.current) {
      hasDragged.current = false;
      return;
    }

    goTo(index);
  };

  const goToPlaylist = () => {
    void navigate(`/playlist/${playlist.id}`);
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
                  backgroundColor: autoplayNext
                    ? "var(--accent-primary)"
                    : "transparent",
                  color: autoplayNext ? "white" : "var(--text-secondary)",
                  border: "1px solid var(--border-color)",
                }}
                title={autoplayNext ? "Autoplay: On" : "Autoplay: Off"}
                aria-label={
                  autoplayNext ? "Disable autoplay" : "Enable autoplay"
                }
              >
                <PlayCircle size={16} />
              </button>

              {/* Shuffle Toggle */}
              <button
                onClick={toggleShuffle}
                className="p-1.5 sm:p-2 rounded transition-colors focus:outline-none"
                style={{
                  backgroundColor: shuffle
                    ? "var(--accent-primary)"
                    : "transparent",
                  color: shuffle ? "white" : "var(--text-secondary)",
                  border: "1px solid var(--border-color)",
                }}
                title={shuffle ? "Shuffle: On" : "Shuffle: Off"}
                aria-label={shuffle ? "Disable shuffle" : "Enable shuffle"}
              >
                <Shuffle size={16} />
              </button>

              {/* Repeat Toggle */}
              <button
                onClick={toggleRepeat}
                className="p-1.5 sm:p-2 rounded transition-colors focus:outline-none"
                style={{
                  backgroundColor:
                    repeat !== "none" ? "var(--accent-primary)" : "transparent",
                  color: repeat !== "none" ? "white" : "var(--text-secondary)",
                  border: "1px solid var(--border-color)",
                }}
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
              >
                {repeat === "one" ? (
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
                    backgroundColor: autoplayNext
                      ? "var(--accent-primary)"
                      : "transparent",
                    color: autoplayNext ? "white" : "var(--text-secondary)",
                    border: "1px solid var(--border-color)",
                  }}
                  title={autoplayNext ? "Autoplay: On" : "Autoplay: Off"}
                  aria-label={
                    autoplayNext ? "Disable autoplay" : "Enable autoplay"
                  }
                >
                  <PlayCircle size={16} />
                </button>

                {/* Shuffle Toggle */}
                <button
                  onClick={toggleShuffle}
                  className="p-1.5 rounded transition-colors focus:outline-none"
                  style={{
                    backgroundColor: shuffle
                      ? "var(--accent-primary)"
                      : "transparent",
                    color: shuffle ? "white" : "var(--text-secondary)",
                    border: "1px solid var(--border-color)",
                  }}
                  title={shuffle ? "Shuffle: On" : "Shuffle: Off"}
                  aria-label={shuffle ? "Disable shuffle" : "Enable shuffle"}
                >
                  <Shuffle size={16} />
                </button>

                {/* Repeat Toggle */}
                <button
                  onClick={toggleRepeat}
                  className="p-1.5 rounded transition-colors focus:outline-none"
                  style={{
                    backgroundColor:
                      repeat !== "none"
                        ? "var(--accent-primary)"
                        : "transparent",
                    color:
                      repeat !== "none" ? "white" : "var(--text-secondary)",
                    border: "1px solid var(--border-color)",
                  }}
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
                >
                  {repeat === "one" ? (
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
                  ></Button>
                )}
              </div>
            </div>
          </div>

          {/* Navigation buttons on mobile (stacked above thumbnails) */}
          <div className="flex md:hidden items-center gap-2 mb-3">
            <Button
              onClick={prev}
              disabled={!canPrev}
              variant="secondary"
              fullWidth
              icon={<ChevronLeft size={20} />}
              aria-label="Previous scene"
            >
              Previous
            </Button>

            <Button
              onClick={next}
              disabled={!canNext}
              variant="secondary"
              fullWidth
              icon={<ChevronRight size={20} />}
              iconPosition="right"
              aria-label="Next scene"
            >
              Next
            </Button>
          </div>

          {/* Tablet: Navigation buttons inline with thumbnails */}
          {showTabletStrip && (
            <div className="hidden md:flex items-center gap-2">
              {/* Previous Button */}
              <Button
                onClick={prev}
                disabled={!canPrev}
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
                  // No longer visible to the user: dimmed and not clickable
                  const isUnavailable = unavailable.includes(index);
                  const title = getSceneTitle(
                    (scene as Record<string, unknown>) ?? null
                  );

                  return (
                    <div
                      key={makeCompositeKey(item.sceneId, item.instanceId)}
                      ref={isCurrent ? setMdCurrentRef : null}
                      className="flex-shrink-0"
                    >
                      <Button
                        onClick={() => navigateToScene(index)}
                        disabled={isUnavailable}
                        variant="tertiary"
                        className="flex-shrink-0 overflow-hidden !p-0"
                        style={{
                          width: isCurrent ? "120px" : "80px",
                          height: isCurrent ? "68px" : "45px",
                          border: isCurrent
                            ? "2px solid var(--accent-color)"
                            : "1px solid var(--border-color)",
                          opacity: isUnavailable ? 0.3 : isCurrent ? 1 : 0.6,
                        }}
                        title={isUnavailable ? `Unavailable: ${title}` : title}
                        aria-label={
                          isUnavailable ? `Unavailable: ${title}` : undefined
                        }
                      >
                        {scene?.paths?.screenshot ? (
                          <img
                            src={scene.paths.screenshot}
                            alt={scene.title || `Scene ${index + 1}`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            decoding="async"
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
                    </div>
                  );
                })}
              </div>

              {/* Next Button */}
              <Button
                onClick={next}
                disabled={!canNext}
                variant="secondary"
                icon={<ChevronRight size={24} />}
                aria-label="Next scene"
              />
            </div>
          )}

          {/* Mobile: Thumbnail strip only (buttons above) */}
          {!showTabletStrip && (
            <div
              ref={smScrollRef}
              className="md:hidden overflow-x-auto scroll-smooth playlist-thumbnail-scroll"
              style={{ cursor: "grab" }}
            >
              <div className="flex gap-2">
                {playlist.scenes.map((item, index) => {
                  const scene = item.scene;
                  const isCurrent = index === currentIndex;
                  // No longer visible to the user: dimmed and not clickable
                  const isUnavailable = unavailable.includes(index);
                  const title = getSceneTitle(
                    (scene as Record<string, unknown>) ?? null
                  );

                  return (
                    <div
                      key={makeCompositeKey(item.sceneId, item.instanceId)}
                      ref={isCurrent ? setSmCurrentRef : null}
                      className="flex-shrink-0"
                    >
                      <Button
                        onClick={() => navigateToScene(index)}
                        disabled={isUnavailable}
                        variant="tertiary"
                        className="flex-shrink-0 overflow-hidden !p-0"
                        style={{
                          width: isCurrent ? "120px" : "80px",
                          height: isCurrent ? "68px" : "45px",
                          border: isCurrent
                            ? "2px solid var(--accent-color)"
                            : "1px solid var(--border-color)",
                          opacity: isUnavailable ? 0.3 : isCurrent ? 1 : 0.6,
                        }}
                        title={isUnavailable ? `Unavailable: ${title}` : title}
                        aria-label={
                          isUnavailable ? `Unavailable: ${title}` : undefined
                        }
                      >
                        {scene?.paths?.screenshot ? (
                          <img
                            src={scene.paths.screenshot}
                            alt={scene.title || `Scene ${index + 1}`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            decoding="async"
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
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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
