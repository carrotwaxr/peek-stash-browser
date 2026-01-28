import { forwardRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { BaseCard } from "../ui/BaseCard.jsx";
import { TooltipEntityGrid } from "../ui/TooltipEntityGrid.jsx";
import { getIndicatorBehavior } from "../../config/indicatorBehaviors.js";
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext.jsx";
import { useConfig } from "../../contexts/ConfigContext.jsx";
import { getScenePathWithTime } from "../../utils/entityLinks.js";
import { formatDuration } from "../../utils/format.js";
import ClipCardPreview from "./ClipCardPreview.jsx";

/**
 * ClipCard - Card for displaying clip entities
 * Uses BaseCard for consistency with other entity cards
 */
const ClipCard = forwardRef(
  (
    {
      clip,
      onClick,
      onFocus,
      tabIndex = -1,
      className = "",
      fromPageTitle,
      onHideSuccess,
    },
    ref
  ) => {
    const navigate = useNavigate();
    const { getSettings } = useCardDisplaySettings();
    const clipSettings = getSettings("clip");
    const { hasMultipleInstances } = useConfig();

    // Title is the clip title
    const title = clip.title || "Untitled";

    // Build subtitle from scene title, studio, date (respecting settings)
    const subtitle = useMemo(() => {
      const parts = [];

      if (clipSettings.showSceneTitle && clip.scene?.title) {
        parts.push(clip.scene.title);
      }

      // Studio would need to be fetched from scene - currently not in API response
      // if (clipSettings.showStudio && clip.scene?.studio?.name) {
      //   parts.push(clip.scene.studio.name);
      // }

      // Date would need to be from scene - currently not in API response
      // if (clipSettings.showDate && clip.scene?.date) {
      //   parts.push(formatRelativeTime(clip.scene.date));
      // }

      return parts.length > 0 ? parts.join(" • ") : null;
    }, [clip.scene, clipSettings]);

    // Combine primary tag with additional tags for indicators
    const allTags = useMemo(() => {
      const tagMap = new Map();

      if (clip.primaryTag) {
        tagMap.set(clip.primaryTag.id, clip.primaryTag);
      }

      if (clip.tags) {
        clip.tags.forEach((tag) => tagMap.set(tag.id, tag));
      }

      return Array.from(tagMap.values());
    }, [clip.primaryTag, clip.tags]);

    // Build indicators
    const indicators = useMemo(() => {
      const tagsTooltip =
        getIndicatorBehavior("clip", "tags") === "rich" &&
        allTags?.length > 0 && (
          <TooltipEntityGrid entityType="tag" entities={allTags} title="Tags" parentInstanceId={clip.scene?.instanceId} />
        );

      // Performers would come from scene - need API enhancement
      // const performersTooltip = getIndicatorBehavior("clip", "performers") === "rich" &&
      //   clip.scene?.performers?.length > 0 && (
      //     <TooltipEntityGrid
      //       entityType="performer"
      //       entities={clip.scene.performers}
      //       title="Performers"
      //     />
      //   );

      return [
        // Performers indicator - needs API enhancement to include scene.performers
        // {
        //   type: "PERFORMERS",
        //   count: clip.scene?.performers?.length || 0,
        //   tooltipContent: performersTooltip,
        //   onClick:
        //     getIndicatorBehavior("clip", "performers") === "nav" &&
        //     clip.scene?.performers?.length > 0
        //       ? () => navigate(`/performers?sceneId=${clip.sceneId}`)
        //       : undefined,
        // },
        {
          type: "TAGS",
          count: allTags?.length || 0,
          tooltipContent: tagsTooltip,
          onClick:
            getIndicatorBehavior("clip", "tags") === "nav" &&
            allTags?.length > 0
              ? () => navigate(`/tags?sceneId=${clip.sceneId}`)
              : undefined,
        },
      ];
    }, [allTags, clip.sceneId, clip.scene?.instanceId, navigate]);

    // Only show indicators if setting is enabled
    const indicatorsToShow = clipSettings.showRelationshipIndicators
      ? indicators
      : [];

    // Format clip duration for overlay
    const formattedDuration = useMemo(() => {
      if (clip.endSeconds != null && clip.seconds != null) {
        return formatDuration(clip.endSeconds - clip.seconds);
      }
      return null;
    }, [clip.seconds, clip.endSeconds]);

    // Render slot: Animated preview + overlays (duration, tag dot, etc.)
    const renderImageContent = () => (
      <>
        {/* Animated clip preview (handles its own image/video) */}
        <ClipCardPreview clip={clip} />

        {/* Duration badge */}
        {formattedDuration && (
          <div className="absolute bottom-2 right-2 bg-black/75 px-2 py-0.5 rounded text-xs font-medium z-10">
            {formattedDuration}
          </div>
        )}

        {/* Ungenerated indicator */}
        {!clip.isGenerated && (
          <div className="absolute top-2 right-2 bg-yellow-500/80 px-1.5 py-0.5 rounded text-xs z-10">
            No preview
          </div>
        )}
      </>
    );

    // Handle navigation - navigate with autoplay state
    const clipUrl = getScenePathWithTime({ id: clip.sceneId, instanceId: clip.instanceId }, clip.seconds, hasMultipleInstances);
    const handleNavigate = () => {
      if (onClick) {
        onClick(clip);
      } else {
        navigate(clipUrl, {
          state: { fromPageTitle, shouldAutoplay: true },
        });
      }
    };

    return (
      <BaseCard
        ref={ref}
        entityType="clip"
        entity={clip}
        linkTo={clipUrl}
        fromPageTitle={fromPageTitle}
        // Content (imagePath not needed - ClipCardPreview handles image/video)
        title={title}
        subtitle={subtitle}
        indicators={indicatorsToShow}
        // Clips don't have descriptions
        displayPreferences={{ showDescription: false }}
        // Rating controls - clips could have their own ratings in future
        ratingControlsProps={{
          entityType: "clip",
          entityId: clip.id,
          entityTitle: title,
          onHideSuccess,
          showRating: clipSettings.showRating,
          showFavorite: clipSettings.showFavorite,
          showOCounter: clipSettings.showOCounter,
          showMenu: clipSettings.showMenu,
        }}
        // Render slots
        renderImageContent={renderImageContent}
        // Standard props
        className={className}
        onNavigate={handleNavigate}
        onFocus={onFocus}
        tabIndex={tabIndex}
      />
    );
  }
);

ClipCard.displayName = "ClipCard";

export default ClipCard;
