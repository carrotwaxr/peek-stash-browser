import { forwardRef } from "react";
import { BaseCard } from "../ui/BaseCard.jsx";

/**
 * ImageCard - Card for displaying image entities
 */
const ImageCard = forwardRef(
  ({ image, referrerUrl, tabIndex, onHideSuccess, ...rest }, ref) => {
    return (
      <BaseCard
        ref={ref}
        entityType="image"
        imagePath={image.paths?.thumbnail || image.paths?.image}
        title={image.title || `Image ${image.id}`}
        linkTo={`/image/${image.id}`}
        referrerUrl={referrerUrl}
        tabIndex={tabIndex}
        hideDescription
        hideSubtitle
        indicators={[]}
        ratingControlsProps={
          image.rating100 !== undefined
            ? {
                entityId: image.id,
                initialRating: image.rating100,
                initialFavorite: image.favorite || false,
                onHideSuccess,
              }
            : undefined
        }
        {...rest}
      />
    );
  }
);

ImageCard.displayName = "ImageCard";

export default ImageCard;
