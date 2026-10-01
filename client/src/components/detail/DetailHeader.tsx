import type { ReactNode } from "react";
import type { DetailType } from "../../api/library";
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext";
import FavoriteButton from "../ui/FavoriteButton";
import PageHeader from "../ui/PageHeader";
import RatingSlider from "../ui/RatingSlider";
import ViewInStashButton from "../ui/ViewInStashButton";

export interface DetailHeaderProps {
  type: DetailType;
  /** The name, with any fallback */
  title: string;
  /** Beside the name (the performer's gender icon) */
  titleExtras?: ReactNode;
  /** Under the name (aliases, the gallery's studio, date and photographer) */
  subtitle?: ReactNode;
  /** Beside the header (the gallery's Play Slideshow) */
  actions?: ReactNode;
  /** The entity in Stash, for admins */
  stashUrl?: string | null;
  /** The viewer's rating and favorite, as the detail hook holds them */
  rating: number | null;
  favorite: boolean;
  onRatingChange: (rating: number | null) => void;
  onFavoriteChange: (favorite: boolean) => void;
}

/**
 * A detail page's title row: the name, the favorite button and rating
 * slider (each as the viewer's display settings for the type say), View in
 * Stash, the subtitle and the page's actions.
 */
const DetailHeader = ({
  type,
  title,
  titleExtras,
  subtitle,
  actions,
  stashUrl,
  rating,
  favorite,
  onRatingChange,
  onFavoriteChange,
}: DetailHeaderProps) => {
  const { getSettings } = useCardDisplaySettings();
  const settings = getSettings(type);

  return (
    <div className="mb-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          className="min-w-0"
          title={
            <div className="flex flex-wrap items-center gap-4 min-w-0">
              <span className="min-w-0 break-words">{title}</span>
              {titleExtras}
              {!!settings.showFavorite && (
                <FavoriteButton
                  isFavorite={favorite}
                  onChange={onFavoriteChange}
                  size="large"
                />
              )}
              {stashUrl && <ViewInStashButton stashUrl={stashUrl} size={24} />}
            </div>
          }
          subtitle={subtitle}
        />
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>

      {!!settings.showRating && (
        <div className="mt-4 max-w-md">
          <RatingSlider
            rating={rating}
            onChange={onRatingChange}
            showClearButton={true}
          />
        </div>
      )}
    </div>
  );
};

export default DetailHeader;
