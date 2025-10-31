import { useState, useRef, useEffect } from "react";
import { Star, X } from "lucide-react";

/**
 * Star rating component
 * Displays a 5-star rating based on 0-100 value
 * Optionally allows user interaction to set rating
 * Supports click-and-drag interaction for easier rating selection
 */
export default function StarRating({
  rating,
  onChange,
  readonly = false,
  size = 20,
  className = "",
  showValue = false,
}) {
  const [hoverRating, setHoverRating] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);
  const justDraggedRef = useRef(false);

  // Convert 0-100 rating to 0-5 stars (with half-star accuracy)
  // 10 = 0.5 stars, 20 = 1 star, 30 = 1.5 stars, etc.
  // Note: rating of 0 is valid (0 stars), null/undefined means unrated
  const starsValue = rating !== null && rating !== undefined ? rating / 20 : 0;
  const displayValue = hoverRating !== null ? hoverRating : starsValue;
  const isRated = rating !== null && rating !== undefined;

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

    // Don't handle click if we just finished dragging
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      return;
    }

    // Determine if clicking left half (half star) or right half (full star)
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const isLeftHalf = clickX < rect.width / 2;

    handleClick(starNumber, isLeftHalf);
  };

  const handleMouseMove = (e, starIndex) => {
    if (readonly || !onChange || isDragging) return;

    // Determine if hovering over left half (half star) or right half (full star)
    const rect = e.currentTarget.getBoundingClientRect();
    const hoverX = e.clientX - rect.left;
    const isLeftHalf = hoverX < rect.width / 2;

    // Show half-star or full-star preview
    setHoverRating(isLeftHalf ? starIndex - 0.5 : starIndex);
  };

  const handleMouseLeave = () => {
    if (readonly || !onChange || isDragging) return;
    setHoverRating(null);
  };

  const handleReset = () => {
    if (readonly || !onChange) return;
    onChange(null); // Set to null (unrated)
  };

  // Calculate rating based on mouse/touch position within the stars container
  const getRatingFromPosition = (clientX) => {
    if (!containerRef.current) return null;

    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const width = rect.width;

    // Calculate which star and which half based on position
    // Each star takes up 1/5 of the width, plus gaps
    const relativePosition = Math.max(0, Math.min(1, x / width));
    const starValue = relativePosition * 5;

    // Round to nearest 0.5 (half-star precision)
    const roundedValue = Math.round(starValue * 2) / 2;

    // Clamp between 0.5 and 5 (minimum half star, maximum 5 stars)
    return Math.max(0.5, Math.min(5, roundedValue));
  };

  // Handle drag start (mouse or touch)
  const handleDragStart = (e) => {
    if (readonly || !onChange) return;

    setIsDragging(true);
    justDraggedRef.current = false;

    // Get initial position and set hover rating
    const clientX = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
    const newRating = getRatingFromPosition(clientX);
    if (newRating !== null) {
      setHoverRating(newRating);
    }
  };

  // Add global event listeners for drag operations
  useEffect(() => {
    if (!isDragging) return;

    // Handle drag move (mouse or touch)
    const handleDragMove = (e) => {
      if (readonly || !onChange) return;

      const clientX = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
      const newRating = getRatingFromPosition(clientX);
      if (newRating !== null) {
        setHoverRating(newRating);
      }
    };

    // Handle drag end (mouse or touch)
    const handleDragEnd = () => {
      if (readonly || !onChange) return;

      if (hoverRating !== null) {
        // Convert star value (0.5-5) to 0-100 rating
        const newRating = Math.round(hoverRating * 20);
        onChange(newRating);
        justDraggedRef.current = true; // Prevent click handler from firing
      }

      setIsDragging(false);
      setHoverRating(null);
    };

    const handleGlobalMove = (e) => {
      if (e.type === 'mousemove') {
        handleDragMove(e);
      } else if (e.type === 'touchmove') {
        e.preventDefault(); // Prevent scrolling while dragging
        handleDragMove(e);
      }
    };

    const handleGlobalEnd = () => {
      handleDragEnd();
    };

    // Add listeners
    document.addEventListener('mousemove', handleGlobalMove);
    document.addEventListener('mouseup', handleGlobalEnd);
    document.addEventListener('touchmove', handleGlobalMove, { passive: false });
    document.addEventListener('touchend', handleGlobalEnd);
    document.addEventListener('touchcancel', handleGlobalEnd);

    // Cleanup
    return () => {
      document.removeEventListener('mousemove', handleGlobalMove);
      document.removeEventListener('mouseup', handleGlobalEnd);
      document.removeEventListener('touchmove', handleGlobalMove);
      document.removeEventListener('touchend', handleGlobalEnd);
      document.removeEventListener('touchcancel', handleGlobalEnd);
    };
  }, [isDragging, hoverRating, readonly, onChange]);

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
        onMouseMove={(e) => handleMouseMove(e, starNumber)}
        onMouseLeave={handleMouseLeave}
        disabled={readonly || !onChange}
        className={`
          relative
          ${
            readonly || !onChange
              ? "cursor-default"
              : "cursor-pointer hover:scale-110"
          }
          transition-transform
          ${className}
        `}
        aria-label={`Rate ${starNumber} star${starNumber > 1 ? "s" : ""}`}
      >
        {isHalf ? (
          // Half-filled star using gradient
          <>
            <Star size={size} className="text-gray-400" />
            <Star
              size={size}
              className="fill-yellow-400 text-yellow-400 absolute inset-0"
              style={{
                clipPath: "inset(0 50% 0 0)",
              }}
            />
          </>
        ) : (
          // Full or empty star
          <Star
            size={size}
            className={`
              ${isFilled ? "fill-yellow-400 text-yellow-400" : "text-gray-400"}
              transition-colors
            `}
          />
        )}
      </button>
    );
  };

  return (
    <div className="flex items-center gap-1">
      {/* Reset button - only show if rated and not readonly */}
      {!readonly && onChange && isRated && (
        <button
          type="button"
          onClick={handleReset}
          className="p-0.5 rounded hover:bg-red-500/20 transition-colors"
          title="Clear rating"
          aria-label="Clear rating"
        >
          <X
            size={size * 0.8}
            className="transition-colors"
            style={{ color: "var(--status-error)" }}
          />
        </button>
      )}
      <div
        ref={containerRef}
        className="flex items-center gap-0.5"
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
        style={{
          userSelect: 'none',
          WebkitUserSelect: 'none',
          touchAction: 'none',
          cursor: readonly || !onChange ? 'default' : 'pointer',
        }}
      >
        {[0, 1, 2, 3, 4].map(renderStar)}
      </div>
      {showValue && rating !== null && rating !== undefined && (
        <span className="ml-2 text-sm text-gray-400">{rating}</span>
      )}
    </div>
  );
}
