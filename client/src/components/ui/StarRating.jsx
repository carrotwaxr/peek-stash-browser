import { useState } from 'react';
import { Star } from 'lucide-react';

/**
 * Star rating component
 * Displays a 5-star rating based on 0-100 value
 * Optionally allows user interaction to set rating
 */
export default function StarRating({
  rating,
  onChange,
  readonly = false,
  size = 20,
  className = '',
  showValue = false,
}) {
  const [hoverRating, setHoverRating] = useState(null);

  // Convert 0-100 rating to 0-5 stars (with half-star accuracy)
  // 10 = 0.5 stars, 20 = 1 star, 30 = 1.5 stars, etc.
  const starsValue = rating ? rating / 20 : 0;
  const displayValue = hoverRating !== null ? hoverRating : starsValue;

  const handleClick = (starIndex, isHalf = false) => {
    if (readonly || !onChange) return;

    // starIndex is 1-5, convert to 0-100 with half-star support
    // Full star: 1 = 20, 2 = 40, 3 = 60, 4 = 80, 5 = 100
    // Half star: 0.5 = 10, 1.5 = 30, 2.5 = 50, 3.5 = 70, 4.5 = 90
    const starValue = isHalf ? starIndex - 0.5 : starIndex;
    const newRating = Math.round(starValue * 20);
    onChange(newRating);
  };

  const handleStarClick = (e, starNumber) => {
    if (readonly || !onChange) return;

    // Determine if clicking left half (half star) or right half (full star)
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const isLeftHalf = clickX < rect.width / 2;

    handleClick(starNumber, isLeftHalf);
  };

  const handleMouseEnter = (starIndex) => {
    if (readonly || !onChange) return;
    setHoverRating(starIndex);
  };

  const handleMouseLeave = () => {
    if (readonly || !onChange) return;
    setHoverRating(null);
  };

  const renderStar = (index) => {
    const starNumber = index + 1;
    // Check if star should be fully filled
    const isFilled = displayValue >= starNumber;
    // Check if star should be half-filled (e.g., 3.5 stars means 4th star is half)
    const isHalf = !isFilled && displayValue >= starNumber - 0.5;

    return (
      <button
        key={index}
        type="button"
        onClick={(e) => handleStarClick(e, starNumber)}
        onMouseEnter={() => handleMouseEnter(starNumber)}
        onMouseLeave={handleMouseLeave}
        disabled={readonly || !onChange}
        className={`
          relative
          ${readonly || !onChange ? 'cursor-default' : 'cursor-pointer hover:scale-110'}
          transition-transform
          ${className}
        `}
        aria-label={`Rate ${starNumber} star${starNumber > 1 ? 's' : ''}`}
      >
        {isHalf ? (
          // Half-filled star using gradient
          <>
            <Star
              size={size}
              className="text-gray-400"
            />
            <Star
              size={size}
              className="fill-yellow-400 text-yellow-400 absolute inset-0"
              style={{
                clipPath: 'inset(0 50% 0 0)',
              }}
            />
          </>
        ) : (
          // Full or empty star
          <Star
            size={size}
            className={`
              ${isFilled ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400'}
              transition-colors
            `}
          />
        )}
      </button>
    );
  };

  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center gap-0.5">
        {[0, 1, 2, 3, 4].map(renderStar)}
      </div>
      {showValue && rating !== null && rating !== undefined && (
        <span className="ml-2 text-sm text-gray-400">
          {rating}
        </span>
      )}
    </div>
  );
}
