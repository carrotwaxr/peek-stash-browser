import { forwardRef, memo, useCallback, useMemo } from "react";
import type { ImageListItem } from "@peek/shared-types";
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext";
import { getImagePath } from "../../utils/entityLinks";
import { getImageTitle } from "../../utils/imageTitle";
import { BaseCard } from "../ui/BaseCard";
import type { CardBadge } from "../ui/CardComponents";
import { useCardIndicators } from "./cardIndicators";

interface Props {
  image: ImageListItem;
  onClick?: (image: ImageListItem) => void;
  fromPageTitle?: string;
  tabIndex?: number;
  /** Called once the card's entity is hidden, with its instance */
  onHideSuccess?: (
    entityId: string,
    entityType: string,
    instanceId: string
  ) => void;
  /** The changes below also name the image's instance: two servers can hold one id */
  onOCounterChange?: (
    entityId: string,
    count: number,
    instanceId: string
  ) => void;
  onRatingChange?: (
    entityId: string,
    rating: number,
    instanceId: string
  ) => void;
  onFavoriteChange?: (
    entityId: string,
    value: boolean,
    instanceId: string
  ) => void;
}

const formatResolution = (width: number | null, height: number | null) => {
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
 * Supports onClick for lightbox integration. Memoised: a grid that renders
 * again with the same row skips this card.
 */
const ImageCard = memo(
  forwardRef<HTMLDivElement, Props>(
    (
      {
        image,
        onClick,
        fromPageTitle,
        tabIndex,
        onHideSuccess,
        onOCounterChange,
        onRatingChange,
        onFavoriteChange,
        ...rest
      },
      ref
    ) => {
      const { getSettings } = useCardDisplaySettings();
      const imageSettings = getSettings("image");
      // Build subtitle from studio and date (respecting settings)
      const subtitle = (() => {
        const parts = [];

        if (imageSettings.showStudio && image.studio?.name) {
          parts.push(image.studio.name);
        }

        if (imageSettings.showDate && image.date) {
          parts.push(new Date(image.date).toLocaleDateString());
        }

        return parts.length > 0 ? parts.join(" • ") : null;
      })();

      // Resolution label
      const resolution = formatResolution(image.width, image.height);

      // The counts, from the image card's table
      const indicatorRow = useMemo(
        () => ({
          instanceId: image.instanceId,
          galleries: image.galleries,
          performers: image.performers,
          tags: image.tags,
        }),
        [image.instanceId, image.galleries, image.performers, image.tags]
      );
      const relationIndicators = useCardIndicators("image", indicatorRow);
      // The resolution is a label beside the counts, not a count
      const resolutionBadge = useMemo<CardBadge | undefined>(
        () =>
          resolution
            ? { label: resolution, title: `${image.width}x${image.height}` }
            : undefined,
        [resolution, image.width, image.height]
      );

      // Only show indicators if setting is enabled
      const indicatorsToShow = imageSettings.showRelationshipIndicators
        ? relationIndicators
        : [];
      const badgeToShow = imageSettings.showRelationshipIndicators
        ? resolutionBadge
        : undefined;

      // Handle click - if onClick provided, use it (for lightbox), otherwise navigate
      const handleClick = onClick
        ? (e?: React.MouseEvent<HTMLDivElement>) => {
            e?.preventDefault();
            onClick(image);
          }
        : undefined;

      // The rating row's changes name the image's instance. Stable while the
      // parent's handlers and the instance are, so the memoised rating row
      // skips a render of this card that changes neither
      const { instanceId } = image;
      const handleOCounterChange = useCallback(
        (id: string, count: number) =>
          onOCounterChange?.(id, count, instanceId),
        [onOCounterChange, instanceId]
      );
      const handleRatingChange = useCallback(
        (id: string, rating: number) =>
          onRatingChange?.(id, rating, instanceId),
        [onRatingChange, instanceId]
      );
      const handleFavoriteChange = useCallback(
        (id: string, value: boolean) =>
          onFavoriteChange?.(id, value, instanceId),
        [onFavoriteChange, instanceId]
      );

      return (
        <BaseCard
          ref={ref}
          entityType="image"
          imagePath={image.paths.thumbnail ?? image.paths.image}
          title={getImageTitle(image)}
          subtitle={subtitle}
          description={image.details}
          onClick={handleClick}
          linkTo={onClick ? undefined : getImagePath(image)}
          fromPageTitle={fromPageTitle}
          tabIndex={tabIndex}
          indicators={indicatorsToShow}
          indicatorBadge={badgeToShow}
          displayPreferences={{
            showDescription: imageSettings.showDescriptionOnCard as
              | boolean
              | undefined,
          }}
          ratingControlsProps={{
            entityId: image.id,
            instanceId: image.instanceId,
            initialRating: image.rating100,
            initialFavorite: image.favorite,
            initialOCounter: image.oCounter,
            onHideSuccess,
            onOCounterChange: onOCounterChange && handleOCounterChange,
            onRatingChange: onRatingChange && handleRatingChange,
            onFavoriteChange: onFavoriteChange && handleFavoriteChange,
            showRating: imageSettings.showRating as boolean | undefined,
            showFavorite: imageSettings.showFavorite as boolean | undefined,
            showOCounter: imageSettings.showOCounter as boolean | undefined,
            showMenu: imageSettings.showMenu as boolean | undefined,
          }}
          {...rest}
        />
      );
    }
  )
);

ImageCard.displayName = "ImageCard";

export default ImageCard;
