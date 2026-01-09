import { forwardRef } from "react";
import { useEntityImageAspectRatio } from "../../hooks/useEntityImageAspectRatio.js";
import { useCardSelection } from "../../hooks/useCardSelection.js";
import { useCardKeyboardNav } from "../../hooks/useCardKeyboardNav.js";
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
      entity, // NEW: for selection callbacks
      imagePath,
      title,
      subtitle,
      description,
      linkTo,

      // Selection mode (NEW)
      selectionMode = false,
      isSelected = false,
      onToggleSelect,

      // Indicators & Rating
      indicators = [],
      ratingControlsProps,

      // Display preferences (future: from useEntityDisplayPreferences hook)
      displayPreferences = {},

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
      fromPageTitle,
      tabIndex,
      style,
      onFocus,
      ...rest
    },
    ref
  ) => {
    const aspectRatio = useEntityImageAspectRatio(entityType);

    // Selection hook
    const { selectionHandlers, handleNavigationClick } = useCardSelection({
      entity,
      selectionMode,
      onToggleSelect,
    });

    // Keyboard navigation hook
    const { onKeyDown } = useCardKeyboardNav({
      linkTo,
      onCustomAction: selectionMode ? () => onToggleSelect?.(entity) : undefined,
    });

    // Merge display preferences with explicit props (props take precedence)
    // When hideDescription is explicitly true, respect it
    // Otherwise, check displayPreferences.showDescription (default: true)
    const shouldShowDescription = hideDescription === true
      ? false
      : (displayPreferences.showDescription ?? true);

    // Selection styling
    const selectionStyle = isSelected
      ? {
          borderColor: "var(--selection-color)",
          borderWidth: "2px",
        }
      : {};

    return (
      <CardContainer
        ref={ref}
        entityType={entityType}
        onClick={onClick}
        className={className}
        tabIndex={tabIndex}
        style={{ ...style, ...selectionStyle }}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        {...selectionHandlers}
        {...rest}
      >
        {/* Image Section - navigable when linkTo provided */}
        <CardImage
          src={imagePath}
          alt={typeof title === "string" ? title : ""}
          aspectRatio={aspectRatio}
          entityType={entityType}
          objectFit={objectFit}
          linkTo={linkTo}
          fromPageTitle={fromPageTitle}
          onClickOverride={handleNavigationClick}
        >
          {/* Custom image content (e.g., sprite preview) */}
          {renderImageContent?.()}
          {/* Custom overlay (e.g., progress bar, selection checkbox) */}
          {renderOverlay?.()}
        </CardImage>

        {/* Title Section - navigable when linkTo provided */}
        <CardTitle
          title={title}
          subtitle={hideSubtitle ? null : subtitle}
          maxTitleLines={maxTitleLines}
          linkTo={linkTo}
          fromPageTitle={fromPageTitle}
          onClickOverride={handleNavigationClick}
        />

        {/* After Title Slot (e.g., gender icon) */}
        {renderAfterTitle?.()}

        {/* Description */}
        {shouldShowDescription && (
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
