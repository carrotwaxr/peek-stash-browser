import { ratingSequence } from "../utils/ratingSequence";
import { useShortcutScope } from "./useShortcutScope";

/**
 * Rating and favorite hotkeys for the page's entity (Stash-compatible): press
 * "r" then "1-5" to rate (20/40/60/80/100), "0" to clear the rating, or "f"
 * to toggle the favorite, within 1 s.
 *
 * A `page` scope: a lightbox or dialog open over the page takes the keys, so
 * rating an image in the lightbox never rates the page's entity.
 *
 * @example
 * useRatingHotkeys({
 *   enabled: true,
 *   setRating: (newRating) => updateEntityRating(newRating),
 *   toggleFavorite: () => setFavorite(!favorite)
 * });
 */
export const useRatingHotkeys = ({
  enabled = true,
  setRating,
  toggleFavorite = null,
}: {
  enabled?: boolean;
  setRating: (rating: number | null) => void;
  toggleFavorite?: (() => void) | null;
}) => {
  useShortcutScope({
    layer: "page",
    enabled,
    sequences: { r: ratingSequence(setRating, toggleFavorite) },
  });
};
