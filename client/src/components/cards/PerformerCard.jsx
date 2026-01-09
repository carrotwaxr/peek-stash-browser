import { forwardRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { BaseCard } from "../ui/BaseCard.jsx";
import GenderIcon from "../ui/GenderIcon.jsx";
import { TooltipEntityGrid } from "../ui/TooltipEntityGrid.jsx";
import { getIndicatorBehavior } from "../../config/indicatorBehaviors.js";

/**
 * PerformerCard - Card for displaying performer entities
 * Uses BaseCard with performer-specific configuration
 */
const PerformerCard = forwardRef(
  ({ performer, fromPageTitle, isTVMode, tabIndex, onHideSuccess, displayPreferences, ...rest }, ref) => {
    const navigate = useNavigate();

    const indicators = useMemo(() => {
      const tagsTooltip = getIndicatorBehavior('performer', 'tags') === 'rich' &&
        performer.tags?.length > 0 && (
          <TooltipEntityGrid entityType="tag" entities={performer.tags} title="Tags" />
        );

      const groupsTooltip = getIndicatorBehavior('performer', 'groups') === 'rich' &&
        performer.groups?.length > 0 && (
          <TooltipEntityGrid entityType="group" entities={performer.groups} title="Collections" />
        );

      const galleriesTooltip = getIndicatorBehavior('performer', 'galleries') === 'rich' &&
        performer.galleries?.length > 0 && (
          <TooltipEntityGrid entityType="gallery" entities={performer.galleries} title="Galleries" />
        );

      const studiosTooltip = getIndicatorBehavior('performer', 'studios') === 'rich' &&
        performer.studios?.length > 0 && (
          <TooltipEntityGrid entityType="studio" entities={performer.studios} title="Studios" />
        );

      return [
        { type: "PLAY_COUNT", count: performer.play_count },
        {
          type: "SCENES",
          count: performer.scene_count,
          onClick: performer.scene_count > 0 ? () => navigate(`/scenes?performerId=${performer.id}`) : undefined,
        },
        {
          type: "GROUPS",
          count: performer.groups?.length || performer.group_count || 0,
          tooltipContent: groupsTooltip,
        },
        {
          type: "IMAGES",
          count: performer.image_count,
          onClick: performer.image_count > 0 ? () => navigate(`/images?performerId=${performer.id}`) : undefined,
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
    }, [performer, navigate]);

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
        linkTo={`/performer/${performer.id}`}
        fromPageTitle={fromPageTitle}
        tabIndex={isTVMode ? tabIndex : -1}
        hideDescription
        hideSubtitle
        indicators={indicators}
        displayPreferences={displayPreferences}
        ratingControlsProps={{
          entityId: performer.id,
          initialRating: performer.rating,
          initialFavorite: performer.favorite || false,
          initialOCounter: performer.o_counter,
          onHideSuccess,
        }}
        {...rest}
      />
    );
  }
);

PerformerCard.displayName = "PerformerCard";

export default PerformerCard;
