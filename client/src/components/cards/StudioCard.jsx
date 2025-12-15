import { forwardRef } from "react";
import { useNavigate } from "react-router-dom";
import { BaseCard } from "../ui/BaseCard.jsx";

/**
 * StudioCard - Card for displaying studio entities
 */
const StudioCard = forwardRef(
  ({ studio, referrerUrl, tabIndex, onHideSuccess, ...rest }, ref) => {
    const navigate = useNavigate();

    const indicators = [
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
        count: studio.gallery_count,
        onClick:
          studio.gallery_count > 0
            ? () => navigate(`/galleries?studioIds=${studio.id}`)
            : undefined,
      },
      {
        type: "PERFORMERS",
        count: studio.performer_count,
        onClick:
          studio.performer_count > 0
            ? () => navigate(`/performers?studioId=${studio.id}`)
            : undefined,
      },
      {
        type: "TAGS",
        count: studio.tags?.length || 0,
        onClick:
          studio.tags?.length > 0
            ? () => navigate(`/tags?studioId=${studio.id}`)
            : undefined,
      },
    ];

    return (
      <BaseCard
        ref={ref}
        entityType="studio"
        imagePath={studio.image_path}
        title={studio.name}
        description={studio.details}
        linkTo={`/studio/${studio.id}`}
        referrerUrl={referrerUrl}
        tabIndex={tabIndex}
        indicators={indicators}
        maxTitleLines={2}
        ratingControlsProps={{
          entityId: studio.id,
          initialRating: studio.rating100,
          initialFavorite: studio.favorite || false,
          initialOCounter: studio.o_counter,
          onHideSuccess,
        }}
        {...rest}
      />
    );
  }
);

StudioCard.displayName = "StudioCard";

export default StudioCard;
