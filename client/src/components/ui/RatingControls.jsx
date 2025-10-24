import { useState } from 'react';
import StarRating from './StarRating';
import FavoriteButton from './FavoriteButton';
import { ratingsApi } from '../../services/api';

/**
 * Combined rating and favorite controls
 * Handles API calls automatically
 */
export default function RatingControls({
  entityType, // 'scene', 'performer', 'studio', 'tag'
  entityId,
  initialRating = null,
  initialFavorite = false,
  onUpdate, // Callback after successful update
  size = 20,
  className = '',
  layout = 'horizontal', // 'horizontal' or 'vertical'
}) {
  const [rating, setRating] = useState(initialRating);
  const [favorite, setFavorite] = useState(initialFavorite);
  const [isUpdating, setIsUpdating] = useState(false);

  const updateRating = async (entityType, entityId, data) => {
    switch (entityType) {
      case 'scene':
        return ratingsApi.updateSceneRating(entityId, data);
      case 'performer':
        return ratingsApi.updatePerformerRating(entityId, data);
      case 'studio':
        return ratingsApi.updateStudioRating(entityId, data);
      case 'tag':
        return ratingsApi.updateTagRating(entityId, data);
      default:
        throw new Error(`Unknown entity type: ${entityType}`);
    }
  };

  const handleRatingChange = async (newRating) => {
    if (isUpdating) return;

    setIsUpdating(true);
    const oldRating = rating;

    // Optimistic update
    setRating(newRating);

    try {
      await updateRating(entityType, entityId, { rating: newRating });

      if (onUpdate) {
        onUpdate({ rating: newRating, favorite });
      }
    } catch (error) {
      console.error('Failed to update rating:', error);
      // Revert on error
      setRating(oldRating);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleFavoriteChange = async (newFavorite) => {
    if (isUpdating) return;

    setIsUpdating(true);
    const oldFavorite = favorite;

    // Optimistic update
    setFavorite(newFavorite);

    try {
      await updateRating(entityType, entityId, { favorite: newFavorite });

      if (onUpdate) {
        onUpdate({ rating, favorite: newFavorite });
      }
    } catch (error) {
      console.error('Failed to update favorite:', error);
      // Revert on error
      setFavorite(oldFavorite);
    } finally {
      setIsUpdating(false);
    }
  };

  const containerClass = layout === 'vertical'
    ? 'flex flex-col items-center gap-2'
    : 'flex items-center gap-3';

  return (
    <div className={`${containerClass} ${className}`}>
      <StarRating
        rating={rating}
        onChange={handleRatingChange}
        size={size}
        readonly={isUpdating}
      />
      <FavoriteButton
        isFavorite={favorite}
        onChange={handleFavoriteChange}
        size={size}
        disabled={isUpdating}
      />
    </div>
  );
}
