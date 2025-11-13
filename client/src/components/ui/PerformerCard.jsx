import { forwardRef } from "react";
import { GridCard } from "./GridCard.jsx";
import GenderIcon from "./GenderIcon.jsx";

const PerformerCard = forwardRef(
  ({ performer, referrerUrl, isTVMode, tabIndex, ...others }, ref) => {
    return (
      <GridCard
        entityType="performer"
        imagePath={performer.image_path}
        hideDescription
        hideSubtitle
        indicators={[
          { type: "PLAY_COUNT", count: performer.play_count },
          { type: "SCENES", count: performer.scene_count },
          { type: "GROUPS", count: performer.group_count },
          { type: "IMAGES", count: performer.image_count },
          { type: "GALLERIES", count: performer.gallery_count },
          { type: "TAGS", count: performer.tag_count },
        ]}
        linkTo={`/performer/${performer.id}`}
        ratingControlsProps={{
          entityId: performer.id,
          initialRating: performer.rating,
          initialFavorite: performer.favorite || false,
          initialOCounter: performer.o_counter,
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
