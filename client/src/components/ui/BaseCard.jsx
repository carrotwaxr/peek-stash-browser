import { forwardRef } from "react";
import { useEntityImageAspectRatio } from "../../hooks/useEntityImageAspectRatio.js";
import { useCardSelection } from "../../hooks/useCardSelection.js";
import { useCardKeyboardNav } from "../../hooks/useCardKeyboardNav.js";
import {
  CardContainer,
  CardDescription,
  CardImage,
  CardIndicators,
  CardMenuRow,
  CardRatingRow,
  CardTitle,
} from "./CardComponents.jsx";
import EntityMenu from "./EntityMenu.jsx";

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
      maxDescriptionLines = 3,
      objectFit = "contain",

      // Customization slots
      renderOverlay,
      renderImageContent,
      renderAfterTitle,

      // Events & behavior
      onClick,
      onNavigate, // Custom navigation handler - if provided, prevents Link default and calls this instead
      className = "",
      fromPageTitle,
      linkState = {},
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

    // Wrap navigation click handler to support custom navigation
    const wrappedNavigationClick = (e) => {
      // First let selection hook handle its logic
      handleNavigationClick(e);
      // If selection hook didn't prevent default and we have a custom navigate handler
      if (!e.defaultPrevented && onNavigate) {
        e.preventDefault();
        onNavigate(e);
      }
    };

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
          linkState={linkState}
          onClickOverride={wrappedNavigationClick}
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
          linkTo={linkTo}
          fromPageTitle={fromPageTitle}
          linkState={linkState}
          onClickOverride={wrappedNavigationClick}
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

        {/* Indicators and Rating/Menu Controls
            Menu placement logic:
            1. If rating controls visible → menu in rating row
            2. If rating controls hidden but indicators visible → menu in indicators row
            3. If indicators hidden but showMenu enabled → standalone CardMenuRow
            4. If everything hidden → no extra row
        */}
        {(() => {
          // Extract settings from ratingControlsProps
          const hasRatingControls = ratingControlsProps && (
            ratingControlsProps.showRating ||
            ratingControlsProps.showFavorite ||
            ratingControlsProps.showOCounter
          );
          const showMenu = ratingControlsProps?.showMenu ?? true;
          const hasIndicators = indicators.length > 0;

          // Build menu component for indicators row (when needed)
          const menuForIndicators = !hasRatingControls && showMenu && ratingControlsProps ? (
            <EntityMenu
              entityType={ratingControlsProps.entityType || entityType}
              entityId={ratingControlsProps.entityId}
              entityName={ratingControlsProps.entityTitle}
              onHide={ratingControlsProps.onHideClick}
            />
          ) : null;

          return (
            <>
              {/* Indicators - pass menu if rating controls are hidden */}
              {(hasIndicators || menuForIndicators) && (
                <CardIndicators
                  indicators={indicators}
                  menuComponent={menuForIndicators}
                />
              )}

              {/* Rating Controls - only render if has visible controls */}
              {ratingControlsProps && hasRatingControls && (
                <CardRatingRow entityType={entityType} {...ratingControlsProps} />
              )}

              {/* Standalone menu row - only if no indicators and no rating controls but menu enabled */}
              {!hasIndicators && !hasRatingControls && showMenu && ratingControlsProps && (
                <CardMenuRow
                  entityType={ratingControlsProps.entityType || entityType}
                  entityId={ratingControlsProps.entityId}
                  entityTitle={ratingControlsProps.entityTitle}
                  onHideSuccess={ratingControlsProps.onHideSuccess}
                />
              )}
            </>
          );
        })()}
      </CardContainer>
    );
  }
);

BaseCard.displayName = "BaseCard";

export default BaseCard;
