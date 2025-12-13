import { forwardRef } from "react";
import { BaseCard } from "../ui/BaseCard.jsx";
import GenderIcon from "../ui/GenderIcon.jsx";

/**
 * PerformerCard - Card for displaying performer entities
 * Uses BaseCard with performer-specific configuration
 */
const PerformerCard = forwardRef(
  ({ performer, referrerUrl, isTVMode, tabIndex, onHideSuccess, ...rest }, ref) => {
    const indicators = [
      { type: "PLAY_COUNT", count: performer.play_count },
      { type: "SCENES", count: performer.scene_count },
      { type: "GROUPS", count: performer.group_count },
      { type: "IMAGES", count: performer.image_count },
      { type: "GALLERIES", count: performer.gallery_count },
      { type: "TAGS", count: performer.tags?.length || 0 },
    ];

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
        referrerUrl={referrerUrl}
        tabIndex={isTVMode ? tabIndex : -1}
        hideDescription
        hideSubtitle
        indicators={indicators}
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
