import { forwardRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { BaseCard } from "../ui/BaseCard.jsx";
import GenderIcon from "../ui/GenderIcon.jsx";
import { TooltipEntityGrid } from "../ui/TooltipEntityGrid.jsx";
import { getIndicatorBehavior } from "../../config/indicatorBehaviors.js";
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext.jsx";
import { useConfig } from "../../contexts/ConfigContext.jsx";
import { getEntityPath, appendInstanceParam } from "../../utils/entityLinks.js";

/**
 * PerformerCard - Card for displaying performer entities
 * Uses BaseCard with performer-specific configuration
 */
const PerformerCard = forwardRef(
  ({ performer, fromPageTitle, isTVMode, tabIndex, onHideSuccess, ...rest }, ref) => {
    const navigate = useNavigate();
    const { getSettings } = useCardDisplaySettings();
    const performerSettings = getSettings("performer");
    const { hasMultipleInstances } = useConfig();

    const indicators = useMemo(() => {
      const tagsTooltip = getIndicatorBehavior('performer', 'tags') === 'rich' &&
        performer.tags?.length > 0 && (
          <TooltipEntityGrid entityType="tag" entities={performer.tags} title="Tags" parentInstanceId={performer.instanceId} />
        );

      const groupsTooltip = getIndicatorBehavior('performer', 'groups') === 'rich' &&
        performer.groups?.length > 0 && (
          <TooltipEntityGrid entityType="group" entities={performer.groups} title="Collections" parentInstanceId={performer.instanceId} />
        );

      const galleriesTooltip = getIndicatorBehavior('performer', 'galleries') === 'rich' &&
        performer.galleries?.length > 0 && (
          <TooltipEntityGrid entityType="gallery" entities={performer.galleries} title="Galleries" parentInstanceId={performer.instanceId} />
        );

      const studiosTooltip = getIndicatorBehavior('performer', 'studios') === 'rich' &&
        performer.studios?.length > 0 && (
          <TooltipEntityGrid entityType="studio" entities={performer.studios} title="Studios" parentInstanceId={performer.instanceId} />
        );

      return [
        { type: "PLAY_COUNT", count: performer.play_count },
        {
          type: "SCENES",
          count: performer.scene_count,
          onClick: performer.scene_count > 0 ? () => navigate(appendInstanceParam(`/scenes?performerId=${performer.id}`, performer, hasMultipleInstances)) : undefined,
        },
        {
          type: "GROUPS",
          count: performer.groups?.length || performer.group_count || 0,
          tooltipContent: groupsTooltip,
        },
        {
          type: "IMAGES",
          count: performer.image_count,
          onClick: performer.image_count > 0 ? () => navigate(appendInstanceParam(`/images?performerId=${performer.id}`, performer, hasMultipleInstances)) : undefined,
        },
        {
          type: "GALLERIES",
          count: performer.galleries?.length || performer.gallery_count || 0,
          tooltipContent: galleriesTooltip,
        },
        {
          type: "TAGS",
          count: performer.tags?.length || 0,
          tooltipContent: tagsTooltip,
        },
        {
          type: "STUDIOS",
          count: performer.studios?.length || 0,
          tooltipContent: studiosTooltip,
        },
      ];
    }, [performer, navigate, hasMultipleInstances]);

    // Only show indicators if setting is enabled
    const indicatorsToShow = performerSettings.showRelationshipIndicators ? indicators : [];

    return (
      <BaseCard
        ref={ref}
        entityType="performer"
        imagePath={performer.image_path}
        title={
          <div className="flex items-center justify-center gap-2">
            {performer.name}
            <GenderIcon gender={performer.gender} size={16} />
          </div>
        }
        linkTo={getEntityPath('performer', performer, hasMultipleInstances)}
        fromPageTitle={fromPageTitle}
        tabIndex={isTVMode ? tabIndex : -1}
        description={performer.details}
        hideSubtitle
        indicators={indicatorsToShow}
        displayPreferences={{ showDescription: performerSettings.showDescriptionOnCard }}
        ratingControlsProps={{
          entityId: performer.id,
          instanceId: performer.instanceId,
          initialRating: performer.rating,
          initialFavorite: performer.favorite || false,
          initialOCounter: performer.o_counter,
          onHideSuccess,
          showRating: performerSettings.showRating,
          showFavorite: performerSettings.showFavorite,
          showOCounter: performerSettings.showOCounter,
          showMenu: performerSettings.showMenu,
        }}
        {...rest}
      />
    );
  }
);

PerformerCard.displayName = "PerformerCard";

export default PerformerCard;
