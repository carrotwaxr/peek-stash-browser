import { forwardRef } from "react";
import { useNavigate } from "react-router-dom";
import { BaseCard } from "../ui/BaseCard.jsx";

/**
 * TagCard - Card for displaying tag entities
 */
const TagCard = forwardRef(
  ({ tag, referrerUrl, tabIndex, onHideSuccess, ...rest }, ref) => {
    const navigate = useNavigate();

    const indicators = [
      {
        type: "SCENES",
        count: tag.scene_count,
        onClick:
          tag.scene_count > 0
            ? () => navigate(`/scenes?tagIds=${tag.id}`)
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
      {
        type: "GALLERIES",
        count: tag.gallery_count,
        onClick:
          tag.gallery_count > 0
            ? () => navigate(`/galleries?tagIds=${tag.id}`)
            : undefined,
      },
    ];

    return (
      <BaseCard
        ref={ref}
        entityType="tag"
        imagePath={tag.image_path}
        title={tag.name}
        description={tag.description}
        linkTo={`/tags/${tag.id}`}
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
