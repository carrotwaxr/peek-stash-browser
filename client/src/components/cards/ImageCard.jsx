import { forwardRef } from "react";
import { getEffectiveImageMetadata, getImageTitle } from "../../utils/imageGalleryInheritance.js";
import { BaseCard } from "../ui/BaseCard.jsx";
import { TooltipEntityGrid } from "../ui/TooltipEntityGrid.jsx";
import { getIndicatorBehavior } from "../../config/indicatorBehaviors.js";
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext.jsx";
import { useConfig } from "../../contexts/ConfigContext.jsx";
import { getEntityPath } from "../../utils/entityLinks.js";

/**
 * Format resolution string from width/height
 */
const formatResolution = (width, height) => {
  if (!width || !height) return null;
  if (height >= 2160) return "4K";
  if (height >= 1440) return "1440p";
  if (height >= 1080) return "1080p";
  if (height >= 720) return "720p";
  if (height >= 480) return "480p";
  return `${width}x${height}`;
};

/**
 * ImageCard - Card for displaying image entities
 * Supports onClick for lightbox integration
 */
const ImageCard = forwardRef(
  ({ image, onClick, fromPageTitle, tabIndex, onHideSuccess, onOCounterChange, onRatingChange, onFavoriteChange, ...rest }, ref) => {
    const { getSettings } = useCardDisplaySettings();
    const imageSettings = getSettings("image");
    const { hasMultipleInstances } = useConfig();
    // Get effective metadata (inherits from galleries if image doesn't have its own)
    const { effectivePerformers, effectiveTags, effectiveStudio, effectiveDate } = getEffectiveImageMetadata(image);

    // Build subtitle from studio and date (respecting settings)
    const subtitle = (() => {
      const parts = [];

      if (imageSettings.showStudio && effectiveStudio?.name) {
        parts.push(effectiveStudio.name);
      }

      if (imageSettings.showDate && effectiveDate) {
        parts.push(new Date(effectiveDate).toLocaleDateString());
      }

      return parts.length > 0 ? parts.join(' • ') : null;
    })();

    // Resolution badge
    const resolution = formatResolution(image.width, image.height);

    const galleries = image.galleries || [];

    // Build rich tooltip content using centralized config
    const performersTooltip = getIndicatorBehavior('image', 'performers') === 'rich' &&
      effectivePerformers.length > 0 && (
        <TooltipEntityGrid
          entityType="performer"
          entities={effectivePerformers}
          title="Performers"
          parentInstanceId={image.instanceId}
        />
      );

    const tagsTooltip = getIndicatorBehavior('image', 'tags') === 'rich' &&
      effectiveTags.length > 0 && (
        <TooltipEntityGrid
          entityType="tag"
          entities={effectiveTags}
          title="Tags"
          parentInstanceId={image.instanceId}
        />
      );

    const galleriesCount = galleries.length;
    const galleriesContent = getIndicatorBehavior('image', 'galleries') === 'rich' &&
      galleriesCount > 0 && (
        <TooltipEntityGrid
          entityType="gallery"
          entities={galleries}
          title="Galleries"
          parentInstanceId={image.instanceId}
        />
      );

    const indicators = [
      ...(resolution
        ? [
            {
              type: "RESOLUTION",
              label: resolution,
              tooltipContent: `${image.width}x${image.height}`,
            },
          ]
        : []),
      ...(galleriesCount > 0
        ? [
            {
              type: "GALLERIES",
              count: galleriesCount,
              tooltipContent: galleriesContent,
            },
          ]
        : []),
      ...(effectivePerformers.length > 0
        ? [
            {
              type: "PERFORMERS",
              count: effectivePerformers.length,
              tooltipContent: performersTooltip,
            },
          ]
        : []),
      ...(effectiveTags.length > 0
        ? [
            {
              type: "TAGS",
              count: effectiveTags.length,
              tooltipContent: tagsTooltip,
            },
          ]
        : []),
    ];

    // Only show indicators if setting is enabled
    const indicatorsToShow = imageSettings.showRelationshipIndicators ? indicators : [];

    // Handle click - if onClick provided, use it (for lightbox), otherwise navigate
    const handleClick = onClick
      ? (e) => {
          e.preventDefault();
          onClick(image);
        }
      : undefined;

    return (
      <BaseCard
        ref={ref}
        entityType="image"
        imagePath={image.paths?.thumbnail || image.paths?.image}
        title={getImageTitle(image)}
        subtitle={subtitle}
        description={image.details}
        onClick={handleClick}
        linkTo={onClick ? undefined : getEntityPath('image', image, hasMultipleInstances)}
        fromPageTitle={fromPageTitle}
        tabIndex={tabIndex}
        indicators={indicatorsToShow}
        displayPreferences={{ showDescription: imageSettings.showDescriptionOnCard }}
        ratingControlsProps={
          image.rating100 !== undefined || image.favorite !== undefined || image.oCounter !== undefined
            ? {
                entityId: image.id,
                initialRating: image.rating100,
                initialFavorite: image.favorite || false,
                initialOCounter: image.oCounter ?? 0,
                onHideSuccess,
                onOCounterChange,
                onRatingChange,
                onFavoriteChange,
                showRating: imageSettings.showRating,
                showFavorite: imageSettings.showFavorite,
                showOCounter: imageSettings.showOCounter,
                showMenu: imageSettings.showMenu,
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
