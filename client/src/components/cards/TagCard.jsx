import { forwardRef } from "react";
import { useNavigate } from "react-router-dom";
import { BaseCard } from "../ui/BaseCard.jsx";

/**
 * TagCard - Card for displaying tag entities
 */
const TagCard = forwardRef(
  ({ tag, referrerUrl, tabIndex, onHideSuccess, ...rest }, ref) => {
    const navigate = useNavigate();

    // Build subtitle from child count
    const subtitle =
      tag.child_count > 0
        ? `${tag.child_count} subtag${tag.child_count !== 1 ? "s" : ""}`
        : null;

    const indicators = [
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
        count: tag.gallery_count,
        onClick:
          tag.gallery_count > 0
            ? () => navigate(`/galleries?tagIds=${tag.id}`)
            : undefined,
      },
      {
        type: "GROUPS",
        count: tag.group_count,
        onClick:
          tag.group_count > 0
            ? () => navigate(`/collections?tagIds=${tag.id}`)
            : undefined,
      },
      {
        type: "STUDIOS",
        count: tag.studio_count,
        onClick:
          tag.studio_count > 0
            ? () => navigate(`/studios?tagIds=${tag.id}`)
            : undefined,
      },
      {
        type: "PERFORMERS",
        count: tag.performer_count,
        onClick:
          tag.performer_count > 0
            ? () => navigate(`/performers?tagIds=${tag.id}`)
            : undefined,
      },
    ];

    return (
      <BaseCard
        ref={ref}
        entityType="tag"
        imagePath={tag.image_path}
        title={tag.name}
        subtitle={subtitle}
        description={tag.description}
        linkTo={`/tag/${tag.id}`}
        referrerUrl={referrerUrl}
        tabIndex={tabIndex}
        indicators={indicators}
        maxTitleLines={2}
        ratingControlsProps={
          tag.rating100 !== undefined
            ? {
                entityId: tag.id,
                initialRating: tag.rating100,
                initialFavorite: tag.favorite || false,
                initialOCounter: tag.o_counter,
                onHideSuccess,
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
