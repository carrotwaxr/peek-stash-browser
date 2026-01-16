import { forwardRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { BaseCard } from "../ui/BaseCard.jsx";
import { TooltipEntityGrid } from "../ui/TooltipEntityGrid.jsx";
import { getIndicatorBehavior } from "../../config/indicatorBehaviors.js";
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext.jsx";

/**
 * StudioCard - Card for displaying studio entities
 */
const StudioCard = forwardRef(
  ({ studio, fromPageTitle, tabIndex, onHideSuccess, ...rest }, ref) => {
    const navigate = useNavigate();
    const { getSettings } = useCardDisplaySettings();
    const studioSettings = getSettings("studio");

    const indicators = useMemo(() => {
      const tagsTooltip = getIndicatorBehavior('studio', 'tags') === 'rich' &&
        studio.tags?.length > 0 && (
          <TooltipEntityGrid entityType="tag" entities={studio.tags} title="Tags" />
        );

      const performersTooltip = getIndicatorBehavior('studio', 'performers') === 'rich' &&
        studio.performers?.length > 0 && (
          <TooltipEntityGrid entityType="performer" entities={studio.performers} title="Performers" />
        );

      const groupsTooltip = getIndicatorBehavior('studio', 'groups') === 'rich' &&
        studio.groups?.length > 0 && (
          <TooltipEntityGrid entityType="group" entities={studio.groups} title="Collections" />
        );

      const galleriesTooltip = getIndicatorBehavior('studio', 'galleries') === 'rich' &&
        studio.galleries?.length > 0 && (
          <TooltipEntityGrid entityType="gallery" entities={studio.galleries} title="Galleries" />
        );

      return [
        { type: "PLAY_COUNT", count: studio.play_count },
        {
          type: "SCENES",
          count: studio.scene_count,
          onClick:
            studio.scene_count > 0
              ? () => navigate(`/scenes?studioId=${studio.id}`)
              : undefined,
        },
        {
          type: "IMAGES",
          count: studio.image_count,
          onClick:
            studio.image_count > 0
              ? () => navigate(`/images?studioId=${studio.id}`)
              : undefined,
        },
        {
          type: "GALLERIES",
          count: studio.galleries?.length || studio.gallery_count || 0,
          tooltipContent: galleriesTooltip,
        },
        {
          type: "GROUPS",
          count: studio.groups?.length || studio.group_count || 0,
          tooltipContent: groupsTooltip,
        },
        {
          type: "PERFORMERS",
          count: studio.performers?.length || studio.performer_count || 0,
          tooltipContent: performersTooltip,
        },
        {
          type: "TAGS",
          count: studio.tags?.length || 0,
          tooltipContent: tagsTooltip,
        },
      ];
    }, [studio, navigate]);

    return (
      <BaseCard
        ref={ref}
        entityType="studio"
        imagePath={studio.image_path}
        title={studio.name}
        description={studio.details}
        linkTo={`/studio/${studio.id}`}
        fromPageTitle={fromPageTitle}
        tabIndex={tabIndex}
        indicators={indicators}
        maxTitleLines={2}
        displayPreferences={{ showDescription: studioSettings.showDescriptionOnCard }}
        ratingControlsProps={{
          entityId: studio.id,
          initialRating: studio.rating100,
          initialFavorite: studio.favorite || false,
          initialOCounter: studio.o_counter,
          onHideSuccess,
          showRating: studioSettings.showRating,
          showFavorite: studioSettings.showFavorite,
          showOCounter: studioSettings.showOCounter,
        }}
        {...rest}
      />
    );
  }
);

StudioCard.displayName = "StudioCard";

export default StudioCard;
