import { forwardRef } from "react";
import { useNavigate } from "react-router-dom";
import { BaseCard } from "../ui/BaseCard.jsx";
import { TooltipEntityGrid } from "../ui/TooltipEntityGrid.jsx";
import { getIndicatorBehavior } from "../../config/indicatorBehaviors.js";
import { galleryTitle } from "../../utils/gallery.js";
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext.jsx";

/**
 * GalleryCard - Card for displaying gallery entities
 */
const GalleryCard = forwardRef(
  ({ gallery, fromPageTitle, tabIndex, onHideSuccess, ...rest }, ref) => {
    const navigate = useNavigate();
    const { getSettings } = useCardDisplaySettings();
    const gallerySettings = getSettings("gallery");

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

    // Build rich tooltip content for performers and tags (using centralized config)
    const performersTooltip = getIndicatorBehavior('gallery', 'performers') === 'rich' &&
      gallery.performers?.length > 0 && (
        <TooltipEntityGrid
          entityType="performer"
          entities={gallery.performers}
          title="Performers"
        />
      );

    const tagsTooltip = getIndicatorBehavior('gallery', 'tags') === 'rich' &&
      gallery.tags?.length > 0 && (
        <TooltipEntityGrid
          entityType="tag"
          entities={gallery.tags}
          title="Tags"
        />
      );

    // Scenes indicator: config says 'nav' for gallery->scenes
    const scenesTooltip = getIndicatorBehavior('gallery', 'scenes') === 'rich' &&
      gallery.scenes?.length > 0 && (
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
        // Config says 'nav' for gallery->images
        onClick: getIndicatorBehavior('gallery', 'images') === 'nav' && gallery.image_count > 0
          ? () => navigate(`/images?galleryId=${gallery.id}`)
          : undefined,
      },
      {
        type: "SCENES",
        count: gallery.scenes?.length || 0,
        tooltipContent: scenesTooltip,
        // Config says 'nav' for gallery->scenes
        onClick: getIndicatorBehavior('gallery', 'scenes') === 'nav' && gallery.scenes?.length > 0
          ? () => navigate(`/scenes?galleryId=${gallery.id}`)
          : undefined,
      },
      {
        type: "PERFORMERS",
        count: gallery.performers?.length || 0,
        tooltipContent: performersTooltip,
        onClick: getIndicatorBehavior('gallery', 'performers') === 'nav' && gallery.performers?.length > 0
          ? () => navigate(`/performers?galleryId=${gallery.id}`)
          : undefined,
      },
      {
        type: "TAGS",
        count: gallery.tags?.length || 0,
        tooltipContent: tagsTooltip,
        onClick: getIndicatorBehavior('gallery', 'tags') === 'nav' && gallery.tags?.length > 0
          ? () => navigate(`/tags?galleryId=${gallery.id}`)
          : undefined,
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
        fromPageTitle={fromPageTitle}
        tabIndex={tabIndex}
        indicators={indicators}
        maxTitleLines={2}
        displayPreferences={{ showDescription: gallerySettings.showDescriptionOnCard }}
        ratingControlsProps={{
          entityId: gallery.id,
          initialRating: gallery.rating100,
          initialFavorite: gallery.favorite || false,
          onHideSuccess,
          showRating: gallerySettings.showRating,
          showFavorite: gallerySettings.showFavorite,
          showOCounter: gallerySettings.showOCounter,
        }}
        {...rest}
      />
    );
  }
);

GalleryCard.displayName = "GalleryCard";

export default GalleryCard;
