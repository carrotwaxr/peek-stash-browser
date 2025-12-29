import { forwardRef } from "react";
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

    // Build rich tooltip content for performers and tags
    const performersTooltip =
      image.performers &&
      image.performers.length > 0 && (
        <TooltipEntityGrid
          entityType="performer"
          entities={image.performers}
          title="Performers"
        />
      );

    const tagsTooltip =
      image.tags &&
      image.tags.length > 0 && (
        <TooltipEntityGrid
          entityType="tag"
          entities={image.tags}
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
      ...(image.performers?.length > 0
        ? [
            {
              type: "PERFORMERS",
              count: image.performers.length,
              tooltipContent: performersTooltip,
            },
          ]
        : []),
      ...(image.tags?.length > 0
        ? [
            {
              type: "TAGS",
              count: image.tags.length,
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
