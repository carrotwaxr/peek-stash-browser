import { forwardRef, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { NormalizedScene } from "@peek/shared-types";
import { getIndicatorBehavior } from "../../config/indicatorBehaviors";
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext";
import { useConfig } from "../../contexts/ConfigContext";
import { useTVMode } from "../../hooks/useTVMode";
import { formatRelativeTime } from "../../utils/date";
import { getEntityPath, getFilteredListPath } from "../../utils/entityLinks";
import {
  formatDurationCompact,
  formatResolution,
  getSceneDescription,
  getSceneTitle,
} from "../../utils/format";
import BaseCard from "./BaseCard";
import { SceneCardPreview, TooltipEntityGrid } from "./index";

interface Props {
  scene: NormalizedScene;
  onClick?: (scene: NormalizedScene) => void;
  onFocus?: (event: React.FocusEvent<HTMLElement>) => void;
  tabIndex?: number;
  className?: string;
  isSelected?: boolean;
  onToggleSelect?: (scene: NormalizedScene) => void;
  selectionMode?: boolean;
  autoplayOnScroll?: boolean;
  hideRatingControls?: boolean;
  /** Called once the card's entity is hidden, with its instance */
  onHideSuccess?: (
    entityId: string,
    entityType: string,
    instanceId?: string
  ) => void;
  fromPageTitle?: string;
  enableKeyboard?: boolean;
  showProgress?: boolean;
}

/**
 * Build scene subtitle with studio, code, and date
 * @param {Object} scene - The scene object
 * @param {Object} options - Display options
 * @param {boolean} options.showCodeOnCard - Whether to show scene code in subtitle
 * @param {boolean} options.showStudio - Whether to show studio name in subtitle
 * @param {boolean} options.showDate - Whether to show date in subtitle
 */
const buildSceneSubtitle = (
  scene: NormalizedScene,
  { showCodeOnCard = true, showStudio = true, showDate = true } = {}
) => {
  const parts = [];

  if (showStudio && scene.studio) {
    parts.push(scene.studio.name);
  }

  if (showCodeOnCard && scene.code) {
    parts.push(scene.code);
  }

  if (showDate) {
    const date = scene.date ? formatRelativeTime(scene.date) : null;
    if (date) {
      parts.push(date);
    }
  }

  return parts.length > 0 ? parts.join(" • ") : null;
};

/**
 * Compute all tags for a scene (direct + inherited)
 */
const computeAllTags = (scene: NormalizedScene) => {
  const tagMap = new Map<string, { id: string; name: string }>();

  if (scene.tags) {
    scene.tags.forEach((tag: { id: string; name: string }) =>
      tagMap.set(tag.id, tag)
    );
  }

  if (scene.inheritedTags) {
    scene.inheritedTags.forEach((tag: { id: string; name: string }) =>
      tagMap.set(tag.id, tag)
    );
  }

  return Array.from(tagMap.values());
};

/**
 * Enhanced scene card component with keyboard navigation support
 * Now uses BaseCard for consistency with other entity cards
 */
const SceneCard = forwardRef<HTMLDivElement, Props>(
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
    // TV mode: the card that has focus previews (hover is off), wherever it is
    const [hasFocus, setHasFocus] = useState(false);
    const navigate = useNavigate();
    const { getSettings } = useCardDisplaySettings();
    const sceneSettings = getSettings("scene");
    const { hasMultipleInstances } = useConfig();

    const title = getSceneTitle(scene);
    const description = getSceneDescription(scene);
    const subtitle = buildSceneSubtitle(scene, {
      showCodeOnCard: sceneSettings.showCodeOnCard as boolean,
      showStudio: sceneSettings.showStudio as boolean,
      showDate: sceneSettings.showDate as boolean,
    });
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
      const performersTooltip = getIndicatorBehavior("scene", "performers") ===
        "rich" &&
        scene.performers?.length > 0 && (
          <TooltipEntityGrid
            entityType="performer"
            entities={scene.performers}
            title="Performers"
            parentInstanceId={scene.instanceId}
          />
        );

      const groupsTooltip = getIndicatorBehavior("scene", "groups") ===
        "rich" &&
        scene.groups?.length > 0 && (
          <TooltipEntityGrid
            entityType="group"
            entities={scene.groups}
            title="Collections"
            parentInstanceId={scene.instanceId}
          />
        );

      const tagsTooltip = getIndicatorBehavior("scene", "tags") === "rich" &&
        allTags?.length > 0 && (
          <TooltipEntityGrid
            entityType="tag"
            entities={allTags}
            title="Tags"
            parentInstanceId={scene.instanceId}
          />
        );

      const galleriesTooltip = getIndicatorBehavior("scene", "galleries") ===
        "rich" &&
        scene.galleries?.length > 0 && (
          <TooltipEntityGrid
            entityType="gallery"
            entities={
              scene.galleries as unknown as Array<{
                id: string;
                name?: string;
                title?: string;
              }>
            }
            title="Galleries"
            parentInstanceId={scene.instanceId}
          />
        );

      // Each count opens its list through that page's scene filter, where
      // the page has one
      const performersLink = getFilteredListPath(
        "/performers",
        "scenes",
        scene,
        hasMultipleInstances
      );
      const groupsLink = getFilteredListPath(
        "/collections",
        "scenes",
        scene,
        hasMultipleInstances
      );
      const galleriesLink = getFilteredListPath(
        "/galleries",
        "scenes",
        scene,
        hasMultipleInstances
      );
      const tagsLink = getFilteredListPath(
        "/tags",
        "scenes",
        scene,
        hasMultipleInstances
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
          onClick:
            getIndicatorBehavior("scene", "performers") === "nav" &&
            scene.performers?.length > 0 &&
            performersLink
              ? () => navigate(performersLink)
              : undefined,
        },
        {
          type: "GROUPS",
          count: scene.groups?.length,
          tooltipContent: groupsTooltip,
          onClick:
            getIndicatorBehavior("scene", "groups") === "nav" &&
            scene.groups?.length > 0 &&
            groupsLink
              ? () => navigate(groupsLink)
              : undefined,
        },
        {
          type: "GALLERIES",
          count: scene.galleries?.length,
          tooltipContent: galleriesTooltip,
          onClick:
            getIndicatorBehavior("scene", "galleries") === "nav" &&
            scene.galleries?.length > 0 &&
            galleriesLink
              ? () => navigate(galleriesLink)
              : undefined,
        },
        {
          type: "TAGS",
          count: allTags?.length,
          tooltipContent: tagsTooltip,
          onClick:
            getIndicatorBehavior("scene", "tags") === "nav" &&
            allTags?.length > 0 &&
            tagsLink
              ? () => navigate(tagsLink)
              : undefined,
        },
      ];
    }, [scene, allTags, navigate, hasMultipleInstances]);

    // Only show indicators if setting is enabled
    const indicatorsToShow = sceneSettings.showRelationshipIndicators
      ? indicators
      : [];

    const handleCheckboxClick = (e: React.MouseEvent) => {
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
            // In TV mode a preview plays while the card has focus, not on hover
            active={isTVMode ? hasFocus : undefined}
            disableHover={isTVMode}
            cycleInterval={600}
            spriteCount={10}
            duration={duration}
            resolution={resolution}
          />
        )}

        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none"></div>

        {/* Watch progress bar */}
        {scene.resume_time && scene.files?.[0]?.duration && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50 pointer-events-none">
            <div
              className="h-full transition-all pointer-events-none"
              style={{
                width: `${Math.min(
                  100,
                  (scene.resume_time / scene.files[0].duration) * 100
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
        entity={scene as unknown as Record<string, unknown>}
        linkTo={getEntityPath("scene", scene, hasMultipleInstances)}
        fromPageTitle={fromPageTitle}
        // Selection mode - BaseCard handles all gesture/keyboard logic
        selectionMode={selectionMode}
        isSelected={isSelected}
        onToggleSelect={
          onToggleSelect as
            | ((entity: Record<string, unknown> | undefined) => void)
            | undefined
        }
        // Content
        imagePath={scene.paths?.screenshot}
        title={title}
        subtitle={subtitle}
        description={description}
        indicators={indicatorsToShow}
        displayPreferences={{
          showDescription: sceneSettings.showDescriptionOnCard as boolean,
        }}
        ratingControlsProps={
          !hideRatingControls
            ? {
                entityType: "scene",
                entityId: scene.id,
                instanceId: scene.instanceId,
                initialRating: scene.rating,
                initialFavorite: scene.favorite || false,
                initialOCounter: scene.o_counter,
                entityTitle: title,
                onHideSuccess,
                showRating: sceneSettings.showRating as boolean,
                showFavorite: sceneSettings.showFavorite as boolean,
                showOCounter: sceneSettings.showOCounter as boolean,
                showMenu: sceneSettings.showMenu as boolean,
              }
            : undefined
        }
        // Render slots
        renderOverlay={renderOverlay}
        renderImageContent={renderImageContent}
        // Standard props
        className={className}
        onNavigate={
          onClick
            ? () => {
                onClick(scene);
              }
            : undefined
        }
        onFocus={(e) => {
          if (isTVMode) setHasFocus(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          // Focus moving to one of the card's own controls keeps it previewing
          if (!e.currentTarget.contains(e.relatedTarget)) setHasFocus(false);
        }}
        tabIndex={isTVMode ? tabIndex : -1}
      />
    );
  }
);

SceneCard.displayName = "SceneCard";

export default SceneCard;
