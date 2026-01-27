import { forwardRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { BaseCard } from "../ui/BaseCard.jsx";
import { TooltipEntityGrid } from "../ui/TooltipEntityGrid.jsx";
import { getIndicatorBehavior } from "../../config/indicatorBehaviors.js";
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext.jsx";
import { useConfig } from "../../contexts/ConfigContext.jsx";
import { getEntityPath } from "../../utils/entityLinks.js";

/**
 * GroupCard - Card for displaying group/collection entities
 */
const GroupCard = forwardRef(
  ({ group, fromPageTitle, tabIndex, onHideSuccess, ...rest }, ref) => {
    const navigate = useNavigate();
    const { getSettings } = useCardDisplaySettings();
    const groupSettings = getSettings("group");
    const { hasMultipleInstances } = useConfig();

    // Build subtitle from studio and date (respecting settings)
    const subtitle = (() => {
      const parts = [];

      if (groupSettings.showStudio && group.studio) {
        parts.push(group.studio.name);
      }

      if (groupSettings.showDate && group.date) {
        parts.push(group.date);
      }

      return parts.length > 0 ? parts.join(' • ') : null;
    })();

    const indicators = useMemo(() => {
      const tagsTooltip = getIndicatorBehavior('group', 'tags') === 'rich' &&
        group.tags?.length > 0 && (
          <TooltipEntityGrid entityType="tag" entities={group.tags} title="Tags" parentInstanceId={group.instanceId} />
        );

      const performersTooltip = getIndicatorBehavior('group', 'performers') === 'rich' &&
        group.performers?.length > 0 && (
          <TooltipEntityGrid entityType="performer" entities={group.performers} title="Performers" parentInstanceId={group.instanceId} />
        );

      const galleriesTooltip = getIndicatorBehavior('group', 'galleries') === 'rich' &&
        group.galleries?.length > 0 && (
          <TooltipEntityGrid entityType="gallery" entities={group.galleries} title="Galleries" parentInstanceId={group.instanceId} />
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

    // Only show indicators if setting is enabled
    const indicatorsToShow = groupSettings.showRelationshipIndicators ? indicators : [];

    return (
      <BaseCard
        ref={ref}
        entityType="group"
        imagePath={group.front_image_path || group.back_image_path}
        title={group.name}
        subtitle={subtitle}
        description={group.description}
        linkTo={getEntityPath('group', group, hasMultipleInstances)}
        fromPageTitle={fromPageTitle}
        tabIndex={tabIndex}
        indicators={indicatorsToShow}
        displayPreferences={{ showDescription: groupSettings.showDescriptionOnCard }}
        ratingControlsProps={{
          entityId: group.id,
          initialRating: group.rating100,
          initialFavorite: group.favorite || false,
          onHideSuccess,
          showRating: groupSettings.showRating,
          showFavorite: groupSettings.showFavorite,
          showOCounter: groupSettings.showOCounter,
          showMenu: groupSettings.showMenu,
        }}
        {...rest}
      />
    );
  }
);

GroupCard.displayName = "GroupCard";

export default GroupCard;
