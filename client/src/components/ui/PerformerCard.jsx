import { forwardRef } from "react";
import { LucideVenus, LucideMars, LucideUser } from "lucide-react";
import { GridCard } from "./GridCard.jsx";

const PerformerGenderIcon = ({ gender, size = 16 }) => {
  if (gender === "FEMALE") {
    return <LucideVenus size={size} color="#ff0080" />;
  } else if (gender === "MALE") {
    return <LucideMars size={size} color="#0561fa" />;
  } else {
    return <LucideUser size={size} color="#6c757d" />;
  }
};

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
            <PerformerGenderIcon gender={performer.gender} size={16} />
          </div>
        }
        {...others}
      />
    );
  }
);

PerformerCard.displayName = "PerformerCard";

export default PerformerCard;
