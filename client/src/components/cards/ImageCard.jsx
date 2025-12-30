import { forwardRef } from "react";
import { getEffectiveImageMetadata } from "../../utils/imageGalleryInheritance.js";
import { BaseCard } from "../ui/BaseCard.jsx";
import { TooltipEntityGrid } from "../ui/TooltipEntityGrid.jsx";

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
 * Get image title with fallback to filename
 */
const getImageTitle = (image) => {
  if (image.title) return image.title;
  if (image.filePath) {
    // Extract filename from path
    const parts = image.filePath.split(/[\\/]/);
    return parts[parts.length - 1];
  }
  return `Image ${image.id}`;
};

/**
 * ImageCard - Card for displaying image entities
 * Supports onClick for lightbox integration
 */
const ImageCard = forwardRef(
  ({ image, onClick, referrerUrl, tabIndex, onHideSuccess, onOCounterChange, ...rest }, ref) => {
    // Get effective metadata (inherits from galleries if image doesn't have its own)
    const { effectivePerformers, effectiveTags } = getEffectiveImageMetadata(image);

    // Build subtitle from gallery and date
    const imageDate = image.date
      ? new Date(image.date).toLocaleDateString()
      : null;
    const galleryName = image.galleries?.[0]?.title;
    const subtitle = (() => {
      if (galleryName && imageDate) {
        return `${galleryName} • ${imageDate}`;
      } else if (galleryName) {
        return galleryName;
      } else if (imageDate) {
        return imageDate;
      }
      return null;
    })();

    // Resolution badge
    const resolution = formatResolution(image.width, image.height);

    // Build rich tooltip content for performers and tags (using effective metadata)
    const performersTooltip =
      effectivePerformers.length > 0 && (
        <TooltipEntityGrid
          entityType="performer"
          entities={effectivePerformers}
          title="Performers"
        />
      );

    const tagsTooltip =
      effectiveTags.length > 0 && (
        <TooltipEntityGrid
          entityType="tag"
          entities={effectiveTags}
          title="Tags"
        />
      );

    const galleriesCount = image.galleries?.length || 0;

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
              tooltipContent:
                galleriesCount === 1 ? "1 Gallery" : `${galleriesCount} Galleries`,
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
        onClick={handleClick}
        linkTo={onClick ? undefined : `/image/${image.id}`}
        referrerUrl={referrerUrl}
        tabIndex={tabIndex}
        indicators={indicators}
        maxTitleLines={2}
        ratingControlsProps={
          image.rating100 !== undefined || image.favorite !== undefined || image.oCounter !== undefined
            ? {
                entityId: image.id,
                initialRating: image.rating100,
                initialFavorite: image.favorite || false,
                initialOCounter: image.oCounter ?? 0,
                onHideSuccess,
                onOCounterChange,
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
