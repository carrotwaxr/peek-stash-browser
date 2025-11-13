/**
 * Rating badge with metallic medal appearance based on rating value
 * Displays rating as 0.0-10.0 with copper/silver/gold gradients
 * Circular medal shape with realistic metallic sheen and depth
 */
const RatingBadge = ({ rating, onClick, size = "small" }) => {
  const getRatingGradient = (rating) => {
    if (rating === null || rating === undefined) {
      // No rating - transparent badge with low opacity
      return {
        background: "rgba(255, 255, 255, 0.1)",
        boxShadow: "inset 0 1px 2px rgba(255, 255, 255, 0.2), 0 2px 4px rgba(0, 0, 0, 0.3)",
        border: "1px solid rgba(255, 255, 255, 0.3)",
        color: "rgba(255, 255, 255, 0.5)",
        text: "--",
      };
    }

    const value = rating / 10; // Convert 0-100 to 0-10

    if (value < 3.5) {
      // Bronze medal - warm metallic with highlights and shadows
      return {
        background: "linear-gradient(135deg, #C77B30 0%, #965A1E 30%, #C77B30 50%, #8B4513 70%, #965A1E 100%)",
        boxShadow: "inset 0 1px 3px rgba(255, 200, 150, 0.6), inset 0 -1px 2px rgba(80, 40, 20, 0.8), 0 3px 6px rgba(0, 0, 0, 0.4)",
        border: "1px solid rgba(139, 69, 19, 0.5)",
        color: "#FFF",
        text: value.toFixed(1),
      };
    } else if (value < 7.0) {
      // Silver medal - cool metallic with bright highlights
      return {
        background: "linear-gradient(135deg, #E8E8E8 0%, #A8A8A8 30%, #D0D0D0 50%, #909090 70%, #C0C0C0 100%)",
        boxShadow: "inset 0 1px 3px rgba(255, 255, 255, 0.8), inset 0 -1px 2px rgba(100, 100, 100, 0.6), 0 3px 6px rgba(0, 0, 0, 0.4)",
        border: "1px solid rgba(144, 144, 144, 0.5)",
        color: "#333",
        text: value.toFixed(1),
      };
    } else {
      // Gold medal - rich metallic with warm highlights
      return {
        background: "linear-gradient(135deg, #FFE87C 0%, #D4AF37 30%, #FFD700 50%, #B8860B 70%, #DAA520 100%)",
        boxShadow: "inset 0 1px 3px rgba(255, 250, 200, 0.9), inset 0 -1px 2px rgba(150, 100, 0, 0.6), 0 3px 6px rgba(0, 0, 0, 0.4)",
        border: "1px solid rgba(184, 134, 11, 0.5)",
        color: "#333",
        text: value.toFixed(1),
      };
    }
  };

  const style = getRatingGradient(rating);
  const sizeClasses = {
    small: "text-xs px-2 py-1",
    medium: "text-sm px-3 py-1.5",
  };

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick?.();
      }}
      className={`${sizeClasses[size]} rounded font-bold transition-all hover:scale-105 active:scale-95`}
      style={{
        background: style.background,
        boxShadow: style.boxShadow,
        border: style.border,
        color: style.color,
        cursor: "pointer",
        minWidth: "2.5rem",
      }}
      aria-label={
        rating !== null && rating !== undefined
          ? `Rating: ${(rating / 10).toFixed(1)}`
          : "Not rated"
      }
    >
      {style.text}
    </button>
  );
};

export default RatingBadge;
