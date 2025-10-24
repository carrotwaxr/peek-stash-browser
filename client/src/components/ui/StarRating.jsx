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

  // Convert 0-100 rating to 0-5 stars
  const starsValue = rating ? rating / 20 : 0;
  const displayValue = hoverRating !== null ? hoverRating : starsValue;

  const handleClick = (starIndex) => {
    if (readonly || !onChange) return;

    // starIndex is 1-5, convert to 0-100
    const newRating = starIndex * 20;
    onChange(newRating);
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
    const isFilled = starNumber <= Math.round(displayValue);
    const isPartial = !isFilled && starNumber - 0.5 <= displayValue;

    return (
      <button
        key={index}
        type="button"
        onClick={() => handleClick(starNumber)}
        onMouseEnter={() => handleMouseEnter(starNumber)}
        onMouseLeave={handleMouseLeave}
        disabled={readonly || !onChange}
        className={`
          ${readonly || !onChange ? 'cursor-default' : 'cursor-pointer hover:scale-110'}
          transition-transform
          ${className}
        `}
        aria-label={`Rate ${starNumber} star${starNumber > 1 ? 's' : ''}`}
      >
        <Star
          size={size}
          className={`
            ${isFilled ? 'fill-yellow-400 text-yellow-400' : ''}
            ${isPartial ? 'fill-yellow-400/50 text-yellow-400' : ''}
            ${!isFilled && !isPartial ? 'text-gray-400' : ''}
            transition-colors
          `}
        />
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
