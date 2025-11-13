import { forwardRef, useRef, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useTVMode } from "../../hooks/useTVMode.js";
import SceneCardPreview from "../ui/SceneCardPreview.jsx";
import RatingControls from "../ui/RatingControls.jsx";
import { SceneTitle, SceneDescription, SceneMetadata } from "../scene/index.js";

/**
 * Enhanced scene card component with keyboard navigation support
 */
const SceneCard = forwardRef(
  (
    {
      scene,
      onClick,
      onFocus,
      tabIndex = -1,
      className = "",
      isSelected = false,
      onToggleSelect,
      selectionMode = false,
      autoplayOnScroll = false,
      hideRatingControls = false,
    },
    ref
  ) => {
    const { isTVMode } = useTVMode();
    const longPressTimerRef = useRef(null);
    const [isLongPressing, setIsLongPressing] = useState(false);
    const startPosRef = useRef({ x: 0, y: 0 });
    const hasMovedRef = useRef(false);

    const handleClick = (e) => {
      // Don't interfere with clicks on interactive elements
      const target = e.target;

      // Find the closest button element (but not the card itself)
      const closestButton = target.closest("button");
      const isButton = closestButton && closestButton !== e.currentTarget;

      // Check for links
      const isLink = target.closest("a");

      const isInteractive = isButton || isLink;

      if (isInteractive) {
        return; // Let the interactive element handle the click
      }

      // If long press was triggered, don't navigate
      if (isLongPressing) {
        setIsLongPressing(false);
        return;
      }

      e.preventDefault();

      // When in selection mode (at least one card selected), toggle selection on click
      if (selectionMode) {
        onToggleSelect?.(scene);
      } else {
        onClick?.(scene);
      }
    };

    const handleMouseDown = (e) => {
      // Don't start long press on interactive elements
      const target = e.target;

      // Find the closest button element (but not the card itself)
      const closestButton = target.closest("button");
      const isButton = closestButton && closestButton !== e.currentTarget;

      // Check for links
      const isLink = target.closest("a");

      const isInteractive = isButton || isLink;

      if (isInteractive) {
        return;
      }

      longPressTimerRef.current = setTimeout(() => {
        setIsLongPressing(true);
        onToggleSelect?.(scene);
      }, 500); // 500ms for long press
    };

    const handleMouseUp = () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };

    const handleTouchStart = (e) => {
      // Don't start long press on interactive elements
      const target = e.target;

      // Find the closest button element (but not the card itself)
      const closestButton = target.closest("button");
      const isButton = closestButton && closestButton !== e.currentTarget;

      // Check for links
      const isLink = target.closest("a");

      const isInteractive = isButton || isLink;

      if (isInteractive) {
        return;
      }

      // Track starting position
      const touch = e.touches[0];
      startPosRef.current = { x: touch.clientX, y: touch.clientY };
      hasMovedRef.current = false;

      longPressTimerRef.current = setTimeout(() => {
        // Only trigger if hasn't moved (not dragging)
        if (!hasMovedRef.current) {
          setIsLongPressing(true);
          onToggleSelect?.(scene);
        }
      }, 500); // 500ms for long press
    };

    const handleTouchMove = (e) => {
      // Check if user has moved beyond threshold (indicates scrolling/dragging)
      if (longPressTimerRef.current && e.touches.length > 0) {
        const touch = e.touches[0];
        const deltaX = Math.abs(touch.clientX - startPosRef.current.x);
        const deltaY = Math.abs(touch.clientY - startPosRef.current.y);
        const moveThreshold = 10; // pixels

        if (deltaX > moveThreshold || deltaY > moveThreshold) {
          // User is dragging/scrolling, cancel long press
          hasMovedRef.current = true;
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      }
    };

    const handleTouchEnd = () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      hasMovedRef.current = false;
    };

    // Cleanup on unmount
    useEffect(() => {
      return () => {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
        }
      };
    }, []);

    const handleKeyDown = (e) => {
      // Prevent card navigation when typing in input fields
      const target = e.target;
      const isInputField =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;

      if (isInputField) {
        return; // Don't handle keyboard events from input fields
      }

      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        onClick?.(scene);
      }
    };

    const handleCheckboxClick = (e) => {
      e.stopPropagation();
      onToggleSelect?.(scene);
    };

    return (
      <>
        <div
          ref={ref}
          className={`
        scene-card
        relative bg-card rounded-lg border overflow-hidden
        transition-all duration-300 cursor-pointer
        hover:shadow-2xl hover:scale-[1.03] hover:z-10
        hover:border-opacity-80
        ${isSelected ? "scene-card-selected" : ""}
        ${className}
      `}
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: isSelected
              ? "var(--selection-color)"
              : "var(--border-color)",
            borderWidth: isSelected ? "2px" : "1px",
          }}
          onClick={handleClick}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          onKeyDown={handleKeyDown}
          onFocus={onFocus}
          tabIndex={isTVMode ? tabIndex : -1}
          role="button"
          aria-label={`Scene ${scene.id}`}
        >
          {/* Thumbnail */}
          <div
            className="relative aspect-video overflow-hidden"
            style={{ backgroundColor: "var(--bg-secondary)" }}
          >
            {/* Selection Checkbox - Always shown, larger touchpoint on mobile */}
            <div className="absolute top-2 left-2 z-20">
              <button
                onClick={handleCheckboxClick}
                className="w-8 h-8 sm:w-6 sm:h-6 rounded border-2 flex items-center justify-center transition-all"
                style={{
                  backgroundColor: isSelected
                    ? "var(--selection-color)"
                    : "rgba(0, 0, 0, 0.5)",
                  borderColor: isSelected
                    ? "var(--selection-color)"
                    : "rgba(255, 255, 255, 0.7)",
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor =
                      "rgba(255, 255, 255, 1)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor =
                      "rgba(255, 255, 255, 0.7)";
                  }
                }}
                aria-label={isSelected ? "Deselect scene" : "Select scene"}
              >
                {isSelected && (
                  <svg
                    className="w-5 h-5 sm:w-4 sm:h-4 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </button>
            </div>

            {scene.paths?.screenshot ? (
              <SceneCardPreview
                scene={scene}
                autoplayOnScroll={autoplayOnScroll}
                cycleInterval={600}
                spriteCount={10}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <svg
                  className="w-12 h-12 text-gray-400"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            )}

            {/* Overlay gradient - non-interactive */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none"></div>

            {/* Studio in top-right */}
            {scene.studio && (
              <div className="absolute top-2 right-2 z-10">
                <Link
                  to={`/studio/${scene.studio.id}`}
                  className="px-2 py-1 bg-black/70 text-white text-xs rounded inline-block hover:bg-black/90 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  {scene.studio.name}
                </Link>
              </div>
            )}

            {/* Duration in bottom-right - non-interactive */}
            <div className="absolute bottom-2 right-2 pointer-events-none z-10">
              {scene.files?.[0]?.duration && (
                <span className="px-2 py-1 bg-black/70 text-white text-xs rounded">
                  {Math.floor(scene.files[0].duration / 60)}m
                </span>
              )}
            </div>

            {/* Watch Progress Bar */}
            {scene.resumeTime && scene.files?.[0]?.duration && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50 pointer-events-none">
                <div
                  className="h-full transition-all pointer-events-none"
                  style={{
                    width: `${Math.min(
                      100,
                      (scene.resumeTime / scene.files[0].duration) * 100
                    )}%`,
                    backgroundColor: "var(--status-success)",
                  }}
                  title={`Resume from ${Math.floor(
                    scene.resumeTime / 60
                  )}:${String(Math.floor(scene.resumeTime % 60)).padStart(
                    2,
                    "0"
                  )}`}
                />
              </div>
            )}
          </div>

          {/* Content */}
          <div className="pt-4 px-4 pb-2">
            {/* Title and Date - Fixed height for carousel consistency */}
            <div
              className="flex flex-col"
              style={{ minHeight: "4rem", maxHeight: "4rem" }}
            >
              <SceneTitle
                scene={scene}
                titleClassName="font-semibold mb-1 leading-tight"
                dateClassName="text-xs mt-1"
                maxLines={2}
              />
            </div>

            {/* Description - Fixed height for carousel consistency */}
            <div
              style={{
                minHeight: "3.75rem",
                maxHeight: "3.75rem",
                overflow: "hidden",
              }}
            >
              <SceneDescription scene={scene} lineClamp={3} />
            </div>

            <SceneMetadata scene={scene} />

            {!hideRatingControls && (
              <div className="py-2 flex justify-center">
                <RatingControls
                  entityType="scene"
                  entityId={scene.id}
                  initialRating={scene.rating}
                  initialFavorite={scene.favorite || false}
                />
              </div>
            )}
          </div>
        </div>
      </>
    );
  }
);

SceneCard.displayName = "SceneCard";

export default SceneCard;
