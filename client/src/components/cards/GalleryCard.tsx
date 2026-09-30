import { forwardRef, memo } from "react";
import type { NormalizedGallery } from "@peek/shared-types";
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext";
import { useConfig } from "../../contexts/ConfigContext";
import { getEntityPath } from "../../utils/entityLinks";
import { galleryTitle } from "../../utils/gallery";
import { BaseCard } from "../ui/BaseCard";
import { useCardIndicators } from "./cardIndicators";

interface Props {
  gallery: NormalizedGallery;
  fromPageTitle?: string;
  tabIndex?: number;
  /** Called once the card's entity is hidden, with its instance */
  onHideSuccess?: (
    entityId: string,
    entityType: string,
    instanceId?: string
  ) => void;
}

// Memoised: a grid that renders again with the same row skips this card
const GalleryCard = memo(
  forwardRef<HTMLDivElement, Props>(
    ({ gallery, fromPageTitle, tabIndex, onHideSuccess, ...rest }, ref) => {
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

        return parts.length > 0 ? parts.join(" • ") : null;
      })();

      // The counts, from the gallery card's table
      const indicators = useCardIndicators("gallery", gallery);

      // Only show indicators if setting is enabled
      const indicatorsToShow = gallerySettings.showRelationshipIndicators
        ? indicators
        : [];

      return (
        <BaseCard
          ref={ref}
          entityType="gallery"
          imagePath={gallery.cover}
          title={galleryTitle(gallery)}
          subtitle={subtitle}
          description={gallery.details}
          linkTo={getEntityPath("gallery", gallery, hasMultipleInstances)}
          fromPageTitle={fromPageTitle}
          tabIndex={tabIndex}
          indicators={indicatorsToShow}
          displayPreferences={{
            showDescription: gallerySettings.showDescriptionOnCard as
              | boolean
              | undefined,
          }}
          ratingControlsProps={{
            entityId: gallery.id,
            instanceId: gallery.instanceId,
            initialRating: gallery.rating100,
            initialFavorite: gallery.favorite || false,
            onHideSuccess,
            showRating: gallerySettings.showRating as boolean | undefined,
            showFavorite: gallerySettings.showFavorite as boolean | undefined,
            showOCounter: gallerySettings.showOCounter as boolean | undefined,
            showMenu: gallerySettings.showMenu as boolean | undefined,
          }}
          {...rest}
        />
      );
    }
  )
);

GalleryCard.displayName = "GalleryCard";

export default GalleryCard;
