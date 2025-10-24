import { Heart } from 'lucide-react';

/**
 * Favorite heart button component
 * Toggles favorite status with a heart icon
 */
export default function FavoriteButton({
  isFavorite,
  onChange,
  size = 20,
  className = '',
  disabled = false,
}) {
  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (disabled || !onChange) return;
    onChange(!isFavorite);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || !onChange}
      className={`
        ${disabled || !onChange ? 'cursor-default' : 'cursor-pointer hover:scale-110'}
        transition-transform
        ${className}
      `}
      aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
    >
      <Heart
        size={size}
        className={`
          ${isFavorite ? 'fill-red-500 text-red-500' : 'text-gray-400 hover:text-red-400'}
          transition-colors
        `}
      />
    </button>
  );
}
