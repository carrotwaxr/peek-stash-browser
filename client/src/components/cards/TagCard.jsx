import { forwardRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { BaseCard } from "../ui/BaseCard.jsx";
import { TooltipEntityGrid } from "../ui/TooltipEntityGrid.jsx";
import { getIndicatorBehavior } from "../../config/indicatorBehaviors.js";
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext.jsx";

/**
 * TagCard - Card for displaying tag entities
 */
const TagCard = forwardRef(
  ({ tag, fromPageTitle, tabIndex, onHideSuccess, ...rest }, ref) => {
    const navigate = useNavigate();
    const { getSettings } = useCardDisplaySettings();
    const tagSettings = getSettings("tag");

    // Build subtitle from child count
    const subtitle =
      tag.child_count > 0
        ? `${tag.child_count} subtag${tag.child_count !== 1 ? "s" : ""}`
        : null;

    const indicators = useMemo(() => {
      const performersTooltip = getIndicatorBehavior('tag', 'performers') === 'rich' &&
        tag.performers?.length > 0 && (
          <TooltipEntityGrid entityType="performer" entities={tag.performers} title="Performers" />
        );

      const studiosTooltip = getIndicatorBehavior('tag', 'studios') === 'rich' &&
        tag.studios?.length > 0 && (
          <TooltipEntityGrid entityType="studio" entities={tag.studios} title="Studios" />
        );

      const groupsTooltip = getIndicatorBehavior('tag', 'groups') === 'rich' &&
        tag.groups?.length > 0 && (
          <TooltipEntityGrid entityType="group" entities={tag.groups} title="Collections" />
        );

      const galleriesTooltip = getIndicatorBehavior('tag', 'galleries') === 'rich' &&
        tag.galleries?.length > 0 && (
          <TooltipEntityGrid entityType="gallery" entities={tag.galleries} title="Galleries" />
        );

      return [
        { type: "PLAY_COUNT", count: tag.play_count },
        {
          type: "SCENES",
          count: tag.scene_count,
          onClick:
            tag.scene_count > 0
              ? () => navigate(`/scenes?tagIds=${tag.id}`)
              : undefined,
        },
        {
          type: "IMAGES",
          count: tag.image_count,
          onClick:
            tag.image_count > 0
              ? () => navigate(`/images?tagIds=${tag.id}`)
              : undefined,
        },
        {
          type: "GALLERIES",
          count: tag.galleries?.length || tag.gallery_count || 0,
          tooltipContent: galleriesTooltip,
        },
        {
          type: "GROUPS",
          count: tag.groups?.length || tag.group_count || 0,
          tooltipContent: groupsTooltip,
        },
        {
          type: "STUDIOS",
          count: tag.studios?.length || tag.studio_count || 0,
          tooltipContent: studiosTooltip,
        },
        {
          type: "PERFORMERS",
          count: tag.performers?.length || tag.performer_count || 0,
          tooltipContent: performersTooltip,
        },
      ];
    }, [tag, navigate]);

    // Only show indicators if setting is enabled
    const indicatorsToShow = tagSettings.showRelationshipIndicators ? indicators : [];

    return (
      <BaseCard
        ref={ref}
        entityType="tag"
        imagePath={tag.image_path}
        title={tag.name}
        subtitle={subtitle}
        description={tag.description}
        linkTo={`/tag/${tag.id}`}
        fromPageTitle={fromPageTitle}
        tabIndex={tabIndex}
        indicators={indicatorsToShow}
        displayPreferences={{ showDescription: tagSettings.showDescriptionOnCard }}
        ratingControlsProps={
          tag.rating100 !== undefined
            ? {
                entityId: tag.id,
                initialRating: tag.rating100,
                initialFavorite: tag.favorite || false,
                initialOCounter: tag.o_counter,
                onHideSuccess,
                showRating: tagSettings.showRating,
                showFavorite: tagSettings.showFavorite,
                showOCounter: tagSettings.showOCounter,
                showMenu: tagSettings.showMenu,
              }
            : undefined
        }
        {...rest}
      />
    );
  }
);

TagCard.displayName = "TagCard";

export default TagCard;
