import { forwardRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTVMode } from "../../hooks/useTVMode.js";
import {
  formatDurationCompact,
  formatResolution,
  getSceneDescription,
  getSceneTitle,
} from "../../utils/format.js";
import { formatRelativeTime } from "../../utils/date.js";
import { getIndicatorBehavior } from "../../config/indicatorBehaviors.js";
import BaseCard from "./BaseCard.jsx";
import { SceneCardPreview, TooltipEntityGrid } from "./index.js";

/**
 * Build scene subtitle with studio, code, and date
 */
const buildSceneSubtitle = (scene) => {
  const parts = [];

  if (scene.studio) {
    parts.push(scene.studio.name);
  }

  if (scene.code) {
    parts.push(scene.code);
  }

  const date = scene.date ? formatRelativeTime(scene.date) : null;
  if (date) {
    parts.push(date);
  }

  return parts.length > 0 ? parts.join(' • ') : null;
};

/**
 * Compute all tags for a scene (direct + inherited)
 */
const computeAllTags = (scene) => {
  const tagMap = new Map();

  if (scene.tags) {
    scene.tags.forEach((tag) => tagMap.set(tag.id, tag));
  }

  if (scene.inheritedTags) {
    scene.inheritedTags.forEach((tag) => tagMap.set(tag.id, tag));
  }

  return Array.from(tagMap.values());
};

/**
 * Enhanced scene card component with keyboard navigation support
 * Now uses BaseCard for consistency with other entity cards
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
      onHideSuccess,
      fromPageTitle,
    },
    ref
  ) => {
    const { isTVMode } = useTVMode();
    const navigate = useNavigate();

    const title = getSceneTitle(scene);
    const description = getSceneDescription(scene);
    const subtitle = buildSceneSubtitle(scene);
    const duration = scene.files?.[0]?.duration
      ? formatDurationCompact(scene.files[0].duration)
      : null;
    const resolution =
      scene.files?.[0]?.width && scene.files?.[0]?.height
        ? formatResolution(scene.files[0].width, scene.files[0].height)
        : null;

    // Combine direct tags with server-computed inherited tags
    const allTags = useMemo(() => computeAllTags(scene), [scene]);

    // Build indicators using centralized config
    const indicators = useMemo(() => {
      const performersTooltip = getIndicatorBehavior('scene', 'performers') === 'rich' &&
        scene.performers?.length > 0 && (
          <TooltipEntityGrid
            entityType="performer"
            entities={scene.performers}
            title="Performers"
          />
        );

      const groupsTooltip = getIndicatorBehavior('scene', 'groups') === 'rich' &&
        scene.groups?.length > 0 && (
          <TooltipEntityGrid
            entityType="group"
            entities={scene.groups}
            title="Collections"
          />
        );

      const tagsTooltip = getIndicatorBehavior('scene', 'tags') === 'rich' &&
        allTags?.length > 0 && (
          <TooltipEntityGrid entityType="tag" entities={allTags} title="Tags" />
        );

      const galleriesTooltip = getIndicatorBehavior('scene', 'galleries') === 'rich' &&
        scene.galleries?.length > 0 && (
          <TooltipEntityGrid
            entityType="gallery"
            entities={scene.galleries}
            title="Galleries"
          />
        );

      return [
        {
          type: "PLAY_COUNT",
          count: scene.play_count,
          tooltipContent: "Times watched",
        },
        {
          type: "PERFORMERS",
          count: scene.performers?.length,
          tooltipContent: performersTooltip,
          // 'rich' behavior: tooltip only, no onClick (users navigate via entities in tooltip)
          onClick: getIndicatorBehavior('scene', 'performers') === 'nav' && scene.performers?.length > 0
            ? () => navigate(`/performers?sceneId=${scene.id}`)
            : undefined,
        },
        {
          type: "GROUPS",
          count: scene.groups?.length,
          tooltipContent: groupsTooltip,
          onClick: getIndicatorBehavior('scene', 'groups') === 'nav' && scene.groups?.length > 0
            ? () => navigate(`/collections?sceneId=${scene.id}`)
            : undefined,
        },
        {
          type: "GALLERIES",
          count: scene.galleries?.length,
          tooltipContent: galleriesTooltip,
          onClick: getIndicatorBehavior('scene', 'galleries') === 'nav' && scene.galleries?.length > 0
            ? () => navigate(`/galleries?sceneId=${scene.id}`)
            : undefined,
        },
        {
          type: "TAGS",
          count: allTags?.length,
          tooltipContent: tagsTooltip,
          onClick: getIndicatorBehavior('scene', 'tags') === 'nav' && allTags?.length > 0
            ? () => navigate(`/tags?sceneId=${scene.id}`)
            : undefined,
        },
      ];
    }, [scene, allTags, navigate]);

    const handleCheckboxClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      onToggleSelect?.(scene);
    };

    // Render slot: Selection checkbox overlay
    const renderOverlay = () => (
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
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 1)";
            }
          }}
          onMouseLeave={(e) => {
            if (!isSelected) {
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.7)";
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
    );

    // Render slot: Video preview + gradient + progress bar
    const renderImageContent = () => (
      <>
        {/* Scene Preview */}
        {scene.paths?.screenshot && (
          <SceneCardPreview
            scene={scene}
            autoplayOnScroll={autoplayOnScroll}
            cycleInterval={600}
            spriteCount={10}
            duration={duration}
            resolution={resolution}
          />
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
      </>
    );

    return (
      <BaseCard
        ref={ref}
        entityType="scene"
        entity={scene}
        linkTo={`/scene/${scene.id}`}
        fromPageTitle={fromPageTitle}
        // Selection mode - BaseCard handles all gesture/keyboard logic
        selectionMode={selectionMode}
        isSelected={isSelected}
        onToggleSelect={onToggleSelect}
        // Content
        imagePath={scene.paths?.screenshot}
        title={title}
        subtitle={subtitle}
        description={description}
        indicators={indicators}
        ratingControlsProps={!hideRatingControls && {
          entityType: "scene",
          entityId: scene.id,
          initialRating: scene.rating,
          initialFavorite: scene.favorite || false,
          initialOCounter: scene.o_counter,
          entityTitle: title,
          onHideSuccess,
        }}
        // Render slots
        renderOverlay={renderOverlay}
        renderImageContent={renderImageContent}
        // Standard props
        className={className}
        onClick={onClick}
        onFocus={onFocus}
        tabIndex={isTVMode ? tabIndex : -1}
      />
    );
  }
);

SceneCard.displayName = "SceneCard";

export default SceneCard;
