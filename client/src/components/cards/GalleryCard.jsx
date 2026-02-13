import { forwardRef } from "react";
import { useNavigate } from "react-router-dom";
import { BaseCard } from "../ui/BaseCard.jsx";
import { TooltipEntityGrid } from "../ui/TooltipEntityGrid.jsx";
import { getIndicatorBehavior } from "../../config/indicatorBehaviors.js";
import { galleryTitle } from "../../utils/gallery.js";
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext.jsx";
import { useConfig } from "../../contexts/ConfigContext.jsx";
import { getEntityPath, appendInstanceParam } from "../../utils/entityLinks.js";

/**
 * GalleryCard - Card for displaying gallery entities
 */
const GalleryCard = forwardRef(
  ({ gallery, fromPageTitle, tabIndex, onHideSuccess, ...rest }, ref) => {
    const navigate = useNavigate();
    const { getSettings } = useCardDisplaySettings();
    const gallerySettings = getSettings("gallery");
    const { hasMultipleInstances } = useConfig();

    // Build subtitle from studio and date (respecting settings)
    const subtitle = (() => {
      const parts = [];

      if (gallerySettings.showStudio && gallery.studio) {
        parts.push(gallery.studio.name);
      }

      if (gallerySettings.showDate && gallery.date) {
        parts.push(new Date(gallery.date).toLocaleDateString());
      }

      return parts.length > 0 ? parts.join(' • ') : null;
    })();

    // Build rich tooltip content for performers and tags (using centralized config)
    const performersTooltip = getIndicatorBehavior('gallery', 'performers') === 'rich' &&
      gallery.performers?.length > 0 && (
        <TooltipEntityGrid
          entityType="performer"
          entities={gallery.performers}
          title="Performers"
          parentInstanceId={gallery.instanceId}
        />
      );

    const tagsTooltip = getIndicatorBehavior('gallery', 'tags') === 'rich' &&
      gallery.tags?.length > 0 && (
        <TooltipEntityGrid
          entityType="tag"
          entities={gallery.tags}
          title="Tags"
          parentInstanceId={gallery.instanceId}
        />
      );

    // Scenes indicator: config says 'nav' for gallery->scenes
    const scenesTooltip = getIndicatorBehavior('gallery', 'scenes') === 'rich' &&
      gallery.scenes?.length > 0 && (
        <TooltipEntityGrid
          entityType="scene"
          entities={gallery.scenes}
          title="Scenes"
          parentInstanceId={gallery.instanceId}
        />
      );

    const indicators = [
      {
        type: "IMAGES",
        count: gallery.image_count,
        // Config says 'nav' for gallery->images
        onClick: getIndicatorBehavior('gallery', 'images') === 'nav' && gallery.image_count > 0
          ? () => navigate(appendInstanceParam(`/images?galleryId=${gallery.id}`, gallery, hasMultipleInstances))
          : undefined,
      },
      {
        type: "SCENES",
        count: gallery.scenes?.length || 0,
        tooltipContent: scenesTooltip,
        // Config says 'nav' for gallery->scenes
        onClick: getIndicatorBehavior('gallery', 'scenes') === 'nav' && gallery.scenes?.length > 0
          ? () => navigate(appendInstanceParam(`/scenes?galleryId=${gallery.id}`, gallery, hasMultipleInstances))
          : undefined,
      },
      {
        type: "PERFORMERS",
        count: gallery.performers?.length || 0,
        tooltipContent: performersTooltip,
        onClick: getIndicatorBehavior('gallery', 'performers') === 'nav' && gallery.performers?.length > 0
          ? () => navigate(appendInstanceParam(`/performers?galleryId=${gallery.id}`, gallery, hasMultipleInstances))
          : undefined,
      },
      {
        type: "TAGS",
        count: gallery.tags?.length || 0,
        tooltipContent: tagsTooltip,
        onClick: getIndicatorBehavior('gallery', 'tags') === 'nav' && gallery.tags?.length > 0
          ? () => navigate(appendInstanceParam(`/tags?galleryId=${gallery.id}`, gallery, hasMultipleInstances))
          : undefined,
      },
    ];

    // Only show indicators if setting is enabled
    const indicatorsToShow = gallerySettings.showRelationshipIndicators ? indicators : [];

    return (
      <BaseCard
        ref={ref}
        entityType="gallery"
        imagePath={gallery.cover}
        title={galleryTitle(gallery)}
        subtitle={subtitle}
        description={gallery.description}
        linkTo={getEntityPath('gallery', gallery, hasMultipleInstances)}
        fromPageTitle={fromPageTitle}
        tabIndex={tabIndex}
        indicators={indicatorsToShow}
        displayPreferences={{ showDescription: gallerySettings.showDescriptionOnCard }}
        ratingControlsProps={{
          entityId: gallery.id,
          instanceId: gallery.instanceId,
          initialRating: gallery.rating100,
          initialFavorite: gallery.favorite || false,
          onHideSuccess,
          showRating: gallerySettings.showRating,
          showFavorite: gallerySettings.showFavorite,
          showOCounter: gallerySettings.showOCounter,
          showMenu: gallerySettings.showMenu,
        }}
        {...rest}
      />
    );
  }
);

GalleryCard.displayName = "GalleryCard";

export default GalleryCard;
