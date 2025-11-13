import { forwardRef, useRef, useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTVMode } from "../../hooks/useTVMode.js";
import SceneCardPreview from "../ui/SceneCardPreview.jsx";
import {
  CardImage,
  CardTitle,
  CardDescription,
  CardIndicators,
  CardRatingRow,
} from "./CardComponents";
import { useEntityImageAspectRatio } from "../../hooks/useEntityImageAspectRatio.js";
import { getSceneTitle, getSceneDescription, formatDurationCompact, formatResolution } from "../../utils/format.js";
import { formatRelativeTime } from "../../utils/date.js";

/**
 * Enhanced scene card component with keyboard navigation support
 * Uses shared CardComponents for visual consistency with GridCard
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
    const navigate = useNavigate();
    const longPressTimerRef = useRef(null);
    const [isLongPressing, setIsLongPressing] = useState(false);
    const startPosRef = useRef({ x: 0, y: 0 });
    const hasMovedRef = useRef(false);
    const aspectRatio = useEntityImageAspectRatio("scene");

    const title = getSceneTitle(scene);
    const description = getSceneDescription(scene);
    const date = scene.date ? formatRelativeTime(scene.date) : null;
    const duration = scene.files?.[0]?.duration
      ? formatDurationCompact(scene.files[0].duration)
      : null;
    const resolution = scene.files?.[0]?.width && scene.files?.[0]?.height
      ? formatResolution(scene.files[0].width, scene.files[0].height)
      : null;

    // Build subtitle with studio and date (like Groups)
    const subtitle = (() => {
      if (scene.studio && date) {
        return `${scene.studio.name} • ${date}`;
      } else if (scene.studio) {
        return scene.studio.name;
      } else if (date) {
        return date;
      }
      return null;
    })();

    // Merge and deduplicate tags
    const getAllTags = () => {
      const tagMap = new Map();
      if (scene.tags) {
        scene.tags.forEach((tag) => tagMap.set(tag.id, tag));
      }
      if (scene.performers) {
        scene.performers.forEach((performer) => {
          if (performer.tags) {
            performer.tags.forEach((tag) => tagMap.set(tag.id, tag));
          }
        });
      }
      if (scene.studio?.tags) {
        scene.studio.tags.forEach((tag) => tagMap.set(tag.id, tag));
      }
      return Array.from(tagMap.values());
    };

    const allTags = getAllTags();

    // Build rich tooltip content for performers
    const performersTooltip = scene.performers && scene.performers.length > 0 && (
      <div>
        <div className="font-semibold mb-3 text-base">Performers</div>
        <div className="grid grid-cols-1 gap-3 max-h-[60vh] overflow-y-auto pr-2">
          {scene.performers.map((performer) => (
            <Link
              key={performer.id}
              to={`/performer/${performer.id}`}
              className="flex items-center gap-3 p-2 rounded hover:bg-white/10 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              {performer.image_path ? (
                <img
                  src={performer.image_path}
                  alt={performer.name}
                  className="w-16 h-16 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: "var(--bg-secondary)" }}
                >
                  <span className="text-2xl">👤</span>
                </div>
              )}
              <span className="text-sm truncate flex-1">{performer.name}</span>
            </Link>
          ))}
        </div>
      </div>
    );

    // Build rich tooltip content for groups
    const groupsTooltip = scene.groups && scene.groups.length > 0 && (
      <div>
        <div className="font-semibold mb-3 text-base">Collections</div>
        <div className="grid grid-cols-1 gap-3 max-h-[60vh] overflow-y-auto pr-2">
          {scene.groups.map((group) => (
            <Link
              key={group.id}
              to={`/collection/${group.id}`}
              className="flex items-center gap-3 p-2 rounded hover:bg-white/10 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              {group.front_image_path || group.back_image_path ? (
                <img
                  src={group.front_image_path || group.back_image_path}
                  alt={group.name}
                  className="w-16 h-16 rounded object-cover flex-shrink-0"
                />
              ) : (
                <div
                  className="w-16 h-16 rounded flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: "var(--bg-secondary)" }}
                >
                  <span className="text-2xl">🎬</span>
                </div>
              )}
              <span className="text-sm truncate flex-1">{group.name}</span>
            </Link>
          ))}
        </div>
      </div>
    );

    // Build rich tooltip content for tags
    const tagsTooltip = allTags && allTags.length > 0 && (
      <div>
        <div className="font-semibold mb-3 text-base">Tags</div>
        <div className="grid grid-cols-1 gap-3 max-h-[60vh] overflow-y-auto pr-2">
          {allTags.map((tag) => (
            <Link
              key={tag.id}
              to={`/tag/${tag.id}`}
              className="flex items-center gap-3 p-2 rounded hover:bg-white/10 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              {tag.image_path ? (
                <img
                  src={tag.image_path}
                  alt={tag.name}
                  className="w-16 h-16 rounded object-cover flex-shrink-0"
                />
              ) : (
                <div
                  className="w-16 h-16 rounded flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: "var(--bg-secondary)" }}
                >
                  <span className="text-2xl">🏷️</span>
                </div>
              )}
              <span className="text-sm truncate flex-1">{tag.name}</span>
            </Link>
          ))}
        </div>
      </div>
    );

    const handleClick = (e) => {
      const target = e.target;
      const closestButton = target.closest("button");
      const isButton = closestButton && closestButton !== e.currentTarget;
      const isLink = target.closest("a");
      const isInput = target.closest("input");
      const isInteractive = isButton || isLink || isInput;

      if (isInteractive) {
        return;
      }

      if (isLongPressing) {
        setIsLongPressing(false);
        return;
      }

      e.preventDefault();

      if (selectionMode) {
        onToggleSelect?.(scene);
      } else {
        onClick?.(scene) || navigate(`/scene/${scene.id}`);
      }
    };

    const handleMouseDown = (e) => {
      const target = e.target;
      const closestButton = target.closest("button");
      const isButton = closestButton && closestButton !== e.currentTarget;
      const isLink = target.closest("a");
      const isInput = target.closest("input");
      const isInteractive = isButton || isLink || isInput;

      if (isInteractive) {
        return;
      }

      longPressTimerRef.current = setTimeout(() => {
        setIsLongPressing(true);
        onToggleSelect?.(scene);
      }, 500);
    };

    const handleMouseUp = () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };

    const handleTouchStart = (e) => {
      const target = e.target;
      const closestButton = target.closest("button");
      const isButton = closestButton && closestButton !== e.currentTarget;
      const isLink = target.closest("a");
      const isInput = target.closest("input");
      const isInteractive = isButton || isLink || isInput;

      if (isInteractive) {
        return;
      }

      const touch = e.touches[0];
      startPosRef.current = { x: touch.clientX, y: touch.clientY };
      hasMovedRef.current = false;

      longPressTimerRef.current = setTimeout(() => {
        if (!hasMovedRef.current) {
          setIsLongPressing(true);
          onToggleSelect?.(scene);
        }
      }, 500);
    };

    const handleTouchMove = (e) => {
      if (longPressTimerRef.current && e.touches.length > 0) {
        const touch = e.touches[0];
        const deltaX = Math.abs(touch.clientX - startPosRef.current.x);
        const deltaY = Math.abs(touch.clientY - startPosRef.current.y);
        const moveThreshold = 10;

        if (deltaX > moveThreshold || deltaY > moveThreshold) {
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

    useEffect(() => {
      return () => {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
        }
      };
    }, []);

    const handleKeyDown = (e) => {
      const target = e.target;
      const isInputField =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;

      if (isInputField) {
        return;
      }

      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        onClick?.(scene) || navigate(`/scene/${scene.id}`);
      }
    };

    const handleCheckboxClick = (e) => {
      e.stopPropagation();
      onToggleSelect?.(scene);
    };

    return (
      <div
        ref={ref}
        className={`flex flex-col items-center justify-between rounded-lg border p-2 hover:shadow-lg hover:scale-[1.02] transition-all cursor-pointer focus:outline-none ${
          isSelected ? "scene-card-selected" : ""
        } ${className}`}
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: isSelected
            ? "var(--selection-color)"
            : "var(--border-color)",
          borderWidth: isSelected ? "2px" : "1px",
          minHeight: "20rem",
          maxHeight: "36rem",
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
        {/* Image with preview */}
        <CardImage aspectRatio={aspectRatio}>
          <div className="relative w-full h-full">
            {/* Selection Checkbox */}
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

            {/* Scene Preview */}
            {scene.paths?.screenshot ? (
              <SceneCardPreview
                scene={scene}
                autoplayOnScroll={autoplayOnScroll}
                cycleInterval={600}
                spriteCount={10}
                duration={duration}
                resolution={resolution}
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

            {/* Overlay gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none"></div>

            {/* Watch progress bar */}
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
                />
              </div>
            )}
          </div>
        </CardImage>

        {/* Title with studio and date as subtitle */}
        <CardTitle
          title={title}
          subtitle={subtitle}
          hideSubtitle={false}
          maxTitleLines={2}
        />

        {/* Description */}
        <CardDescription description={description} maxLines={3} />

        {/* Indicators */}
        <CardIndicators
          indicators={[
            { type: "PLAY_COUNT", count: scene.play_count, tooltipContent: "Times watched" },
            { type: "PERFORMERS", count: scene.performers?.length, tooltipContent: performersTooltip },
            { type: "GROUPS", count: scene.groups?.length, tooltipContent: groupsTooltip },
            { type: "TAGS", count: allTags?.length, tooltipContent: tagsTooltip },
          ]}
        />

        {/* Rating, O Counter, and Favorite Row */}
        {!hideRatingControls && (
          <CardRatingRow
            entityType="scene"
            entityId={scene.id}
            initialRating={scene.rating}
            initialFavorite={scene.favorite || false}
            initialOCounter={scene.o_counter}
            entityTitle={title}
          />
        )}
      </div>
    );
  }
);

SceneCard.displayName = "SceneCard";

export default SceneCard;
