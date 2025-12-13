import { forwardRef } from "react";
import { useNavigate } from "react-router-dom";
import { BaseCard } from "../ui/BaseCard.jsx";
import { TooltipEntityGrid } from "../ui/TooltipEntityGrid.jsx";
import { galleryTitle } from "../../utils/gallery.js";

/**
 * GalleryCard - Card for displaying gallery entities
 */
const GalleryCard = forwardRef(
  ({ gallery, referrerUrl, tabIndex, onHideSuccess, ...rest }, ref) => {
    const navigate = useNavigate();

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

    const indicators = [
      {
        type: "IMAGES",
        count: gallery.image_count,
        tooltipContent:
          gallery.image_count === 1 ? "1 Image" : `${gallery.image_count} Images`,
      },
      {
        type: "PERFORMERS",
        count: gallery.performers?.length || 0,
        tooltipContent: performersTooltip,
        onClick:
          gallery.performers?.length > 0
            ? () => navigate(`/performers?galleryId=${gallery.id}`)
            : undefined,
      },
      {
        type: "TAGS",
        count: gallery.tags?.length || 0,
        tooltipContent: tagsTooltip,
        onClick:
          gallery.tags?.length > 0
            ? () => navigate(`/tags?galleryId=${gallery.id}`)
            : undefined,
      },
    ];

    return (
      <BaseCard
        ref={ref}
        entityType="gallery"
        imagePath={gallery.paths?.cover}
        title={galleryTitle(gallery)}
        subtitle={subtitle}
        description={gallery.description}
        linkTo={`/gallery/${gallery.id}`}
        referrerUrl={referrerUrl}
        tabIndex={tabIndex}
        indicators={indicators}
        maxTitleLines={2}
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
