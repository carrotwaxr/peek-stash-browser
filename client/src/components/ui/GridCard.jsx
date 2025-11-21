import { forwardRef } from "react";
import { useEntityImageAspectRatio } from "../../hooks/useEntityImageAspectRatio";
import {
  CardContainer,
  CardDefaultImage,
  CardDescription,
  CardImage,
  CardIndicators,
  CardRatingRow,
  CardTitle,
} from "./CardComponents";

export const GridCard = forwardRef(
  (
    {
      className,
      description,
      entityType = "card",
      hideDescription = false,
      hideSubtitle = false,
      imagePath,
      indicators,
      linkTo,
      maxDescriptionLines = 3,
      maxTitleLines = 1,
      onClick,
      ratingControlsProps,
      referrerUrl,
      renderImage, // Custom render function for image slot
      renderTitle, // Custom render function for title slot
      renderContent, // Custom render function for additional content between description and indicators
      title,
      subtitle,
      ...others
    },
    ref
  ) => {
    const aspectRatio = useEntityImageAspectRatio(entityType);

    return (
      <CardContainer
        ref={ref}
        className={className}
        entityType={entityType}
        linkTo={linkTo}
        onClick={onClick}
        referrerUrl={referrerUrl}
        {...others}
      >
        <CardImage aspectRatio={aspectRatio}>
          {renderImage ? (
            renderImage()
          ) : (
            <CardDefaultImage
              src={imagePath}
              alt={typeof title === "string" ? title : ""}
              entityType={entityType}
            />
          )}
        </CardImage>

        {renderTitle ? (
          renderTitle()
        ) : (
          <CardTitle
            title={title}
            subtitle={subtitle}
            hideSubtitle={hideSubtitle}
            maxTitleLines={maxTitleLines}
          />
        )}

        {!hideDescription && (
          <CardDescription
            description={description}
            maxLines={maxDescriptionLines}
          />
        )}

        {renderContent && renderContent()}

        <CardIndicators indicators={indicators} />

        {ratingControlsProps && (
          <CardRatingRow
            entityType={entityType}
            entityId={ratingControlsProps.entityId}
            initialRating={ratingControlsProps.initialRating}
            initialFavorite={ratingControlsProps.initialFavorite}
            initialOCounter={ratingControlsProps.initialOCounter}
            entityTitle={typeof title === "string" ? title : undefined}
            onHideSuccess={ratingControlsProps.onHideSuccess}
          />
        )}
      </CardContainer>
    );
  }
);

GridCard.displayName = "GridCard";
