import { forwardRef } from "react";
import { BaseCard } from "../ui/BaseCard.jsx";
import { TooltipEntityGrid } from "../ui/TooltipEntityGrid.jsx";
import { galleryTitle } from "../../utils/gallery.js";

/**
 * GalleryCard - Card for displaying gallery entities
 */
const GalleryCard = forwardRef(
  ({ gallery, referrerUrl, tabIndex, onHideSuccess, displayPreferences, ...rest }, ref) => {

    // Build subtitle from studio and date
    const galleryDate = gallery.date
      ? new Date(gallery.date).toLocaleDateString()
      : null;
    const subtitle = (() => {
      if (gallery.studio && galleryDate) {
        return `${gallery.studio.name} • ${galleryDate}`;
      } else if (gallery.studio) {
        return gallery.studio.name;
      } else if (galleryDate) {
        return galleryDate;
      }
      return null;
    })();

    // Build rich tooltip content for performers and tags
    const performersTooltip =
      gallery.performers &&
      gallery.performers.length > 0 && (
        <TooltipEntityGrid
          entityType="performer"
          entities={gallery.performers}
          title="Performers"
        />
      );

    const tagsTooltip =
      gallery.tags &&
      gallery.tags.length > 0 && (
        <TooltipEntityGrid
          entityType="tag"
          entities={gallery.tags}
          title="Tags"
        />
      );

    const scenesTooltip =
      gallery.scenes &&
      gallery.scenes.length > 0 && (
        <TooltipEntityGrid
          entityType="scene"
          entities={gallery.scenes}
          title="Scenes"
        />
      );

    const indicators = [
      {
        type: "IMAGES",
        count: gallery.image_count,
        tooltipContent:
          gallery.image_count === 1 ? "1 Image" : `${gallery.image_count} Images`,
      },
      {
        type: "SCENES",
        count: gallery.scenes?.length || 0,
        tooltipContent: scenesTooltip,
      },
      {
        type: "PERFORMERS",
        count: gallery.performers?.length || 0,
        tooltipContent: performersTooltip,
      },
      {
        type: "TAGS",
        count: gallery.tags?.length || 0,
        tooltipContent: tagsTooltip,
      },
    ];

    return (
      <BaseCard
        ref={ref}
        entityType="gallery"
        imagePath={gallery.cover}
        title={galleryTitle(gallery)}
        subtitle={subtitle}
        description={gallery.description}
        linkTo={`/gallery/${gallery.id}`}
        referrerUrl={referrerUrl}
        tabIndex={tabIndex}
        indicators={indicators}
        maxTitleLines={2}
        displayPreferences={displayPreferences}
        ratingControlsProps={{
          entityId: gallery.id,
          initialRating: gallery.rating100,
          initialFavorite: gallery.favorite || false,
          onHideSuccess,
        }}
        {...rest}
      />
    );
  }
);

GalleryCard.displayName = "GalleryCard";

export default GalleryCard;
