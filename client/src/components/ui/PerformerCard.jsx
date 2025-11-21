import { forwardRef } from "react";
import { useNavigate } from "react-router-dom";
import GenderIcon from "./GenderIcon.jsx";
import { GridCard } from "./GridCard.jsx";

const PerformerCard = forwardRef(
  ({ performer, referrerUrl, isTVMode, tabIndex, onHideSuccess, ...others }, ref) => {
    const navigate = useNavigate();

    return (
      <GridCard
        entityType="performer"
        imagePath={performer.image_path}
        hideDescription
        hideSubtitle
        indicators={[
          { type: "PLAY_COUNT", count: performer.play_count },
          {
            type: "SCENES",
            count: performer.scene_count,
            onClick: performer.scene_count > 0 ? () => navigate(`/scenes?performerIds=${performer.id}`) : undefined,
          },
          {
            type: "GROUPS",
            count: performer.group_count,
            onClick: performer.group_count > 0 ? () => navigate(`/collections?performerIds=${performer.id}`) : undefined,
          },
          {
            type: "IMAGES",
            count: performer.image_count,
            onClick: performer.image_count > 0 ? () => navigate(`/images?performerIds=${performer.id}`) : undefined,
          },
          {
            type: "GALLERIES",
            count: performer.gallery_count,
            onClick: performer.gallery_count > 0 ? () => navigate(`/galleries?performerIds=${performer.id}`) : undefined,
          },
          {
            type: "TAGS",
            count: performer.tags?.length || 0,
            onClick: performer.tags?.length > 0 ? () => navigate(`/tags?performerIds=${performer.id}`) : undefined,
          },
        ]}
        linkTo={`/performer/${performer.id}`}
        ratingControlsProps={{
          entityId: performer.id,
          initialRating: performer.rating,
          initialFavorite: performer.favorite || false,
          initialOCounter: performer.o_counter,
          onHideSuccess,
        }}
        ref={ref}
        referrerUrl={referrerUrl}
        tabIndex={isTVMode ? tabIndex : -1}
        title={
          <div className="flex items-center justify-center gap-2">
            {performer.name}
            <GenderIcon gender={performer.gender} size={16} />
          </div>
        }
        {...others}
      />
    );
  }
);

PerformerCard.displayName = "PerformerCard";

export default PerformerCard;
