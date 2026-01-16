import { forwardRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { BaseCard } from "../ui/BaseCard.jsx";
import { TooltipEntityGrid } from "../ui/TooltipEntityGrid.jsx";
import { getIndicatorBehavior } from "../../config/indicatorBehaviors.js";
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext.jsx";

/**
 * GroupCard - Card for displaying group/collection entities
 */
const GroupCard = forwardRef(
  ({ group, fromPageTitle, tabIndex, onHideSuccess, ...rest }, ref) => {
    const navigate = useNavigate();
    const { getSettings } = useCardDisplaySettings();
    const groupSettings = getSettings("group");

    // Build subtitle from studio and date
    const subtitle = (() => {
      if (group.studio && group.date) {
        return `${group.studio.name} • ${group.date}`;
      } else if (group.studio) {
        return group.studio.name;
      } else if (group.date) {
        return group.date;
      }
      return null;
    })();

    const indicators = useMemo(() => {
      const tagsTooltip = getIndicatorBehavior('group', 'tags') === 'rich' &&
        group.tags?.length > 0 && (
          <TooltipEntityGrid entityType="tag" entities={group.tags} title="Tags" />
        );

      const performersTooltip = getIndicatorBehavior('group', 'performers') === 'rich' &&
        group.performers?.length > 0 && (
          <TooltipEntityGrid entityType="performer" entities={group.performers} title="Performers" />
        );

      const galleriesTooltip = getIndicatorBehavior('group', 'galleries') === 'rich' &&
        group.galleries?.length > 0 && (
          <TooltipEntityGrid entityType="gallery" entities={group.galleries} title="Galleries" />
        );

      return [
        {
          type: "SCENES",
          count: group.scene_count,
          onClick:
            group.scene_count > 0
              ? () => navigate(`/scenes?groupIds=${group.id}`)
              : undefined,
        },
        {
          type: "GROUPS",
          count: group.sub_group_count,
          onClick:
            group.sub_group_count > 0
              ? () => navigate(`/collections?groupIds=${group.id}`)
              : undefined,
        },
        {
          type: "PERFORMERS",
          count: group.performers?.length || group.performer_count || 0,
          tooltipContent: performersTooltip,
        },
        {
          type: "GALLERIES",
          count: group.galleries?.length || 0,
          tooltipContent: galleriesTooltip,
        },
        {
          type: "TAGS",
          count: group.tags?.length || 0,
          tooltipContent: tagsTooltip,
        },
      ];
    }, [group, navigate]);

    return (
      <BaseCard
        ref={ref}
        entityType="group"
        imagePath={group.front_image_path || group.back_image_path}
        title={group.name}
        subtitle={subtitle}
        description={group.description}
        linkTo={`/collection/${group.id}`}
        fromPageTitle={fromPageTitle}
        tabIndex={tabIndex}
        indicators={indicators}
        maxTitleLines={2}
        displayPreferences={{ showDescription: groupSettings.showDescriptionOnCard }}
        ratingControlsProps={{
          entityId: group.id,
          initialRating: group.rating100,
          initialFavorite: group.favorite || false,
          onHideSuccess,
          showRating: groupSettings.showRating,
          showFavorite: groupSettings.showFavorite,
          showOCounter: groupSettings.showOCounter,
        }}
        {...rest}
      />
    );
  }
);

GroupCard.displayName = "GroupCard";

export default GroupCard;
