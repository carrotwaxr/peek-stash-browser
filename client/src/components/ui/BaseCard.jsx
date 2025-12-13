import { forwardRef } from "react";
import { useEntityImageAspectRatio } from "../../hooks/useEntityImageAspectRatio.js";
import {
  CardContainer,
  CardDescription,
  CardImage,
  CardIndicators,
  CardRatingRow,
  CardTitle,
} from "./CardComponents.jsx";

/**
 * BaseCard - Composable card component that assembles primitives
 * Provides render slots for entity-specific customization
 */
export const BaseCard = forwardRef(
  (
    {
      // Data
      entityType,
      imagePath,
      title,
      subtitle,
      description,
      linkTo,

      // Indicators & Rating
      indicators = [],
      ratingControlsProps,

      // Display options
      hideDescription = false,
      hideSubtitle = false,
      maxTitleLines = 2,
      maxDescriptionLines = 3,
      objectFit = "contain",

      // Customization slots
      renderOverlay,
      renderImageContent,
      renderAfterTitle,

      // Events & behavior
      onClick,
      className = "",
      referrerUrl,
      tabIndex,
      style,
      ...rest
    },
    ref
  ) => {
    const aspectRatio = useEntityImageAspectRatio(entityType);

    return (
      <CardContainer
        ref={ref}
        entityType={entityType}
        linkTo={linkTo}
        onClick={onClick}
        referrerUrl={referrerUrl}
        className={className}
        tabIndex={tabIndex}
        style={style}
        {...rest}
      >
        {/* Image Section */}
        <CardImage
          src={imagePath}
          alt={typeof title === "string" ? title : ""}
          aspectRatio={aspectRatio}
          entityType={entityType}
          objectFit={objectFit}
        >
          {/* Custom image content (e.g., sprite preview) */}
          {renderImageContent?.()}
          {/* Custom overlay (e.g., progress bar, selection checkbox) */}
          {renderOverlay?.()}
        </CardImage>

        {/* Title Section */}
        <CardTitle
          title={title}
          subtitle={hideSubtitle ? null : subtitle}
          maxTitleLines={maxTitleLines}
        />

        {/* After Title Slot (e.g., gender icon) */}
        {renderAfterTitle?.()}

        {/* Description */}
        {!hideDescription && (
          <CardDescription
            description={description}
            maxLines={maxDescriptionLines}
          />
        )}

        {/* Indicators */}
        {indicators.length > 0 && <CardIndicators indicators={indicators} />}

        {/* Rating Controls */}
        {ratingControlsProps && (
          <CardRatingRow entityType={entityType} {...ratingControlsProps} />
        )}
      </CardContainer>
    );
  }
);

BaseCard.displayName = "BaseCard";

export default BaseCard;
