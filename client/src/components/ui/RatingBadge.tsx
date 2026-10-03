import { ratingMedal } from "./ratingMedal";

interface Props {
  rating: number | null | undefined;
  onClick?: () => void;
  size?: "small" | "medium";
}

/**
 * Rating badge with metallic medal appearance based on rating value
 * Displays rating as 0.0-10.0 with copper/silver/gold gradients
 * Circular medal shape with realistic metallic sheen and depth
 * The medals are fixed colours (`ratingMedal`, shared with the tag tree)
 * with text that keeps 4.5:1 on every stop; the unrated badge uses the
 * theme's variables.
 */
const RatingBadge = ({ rating, onClick, size = "small" }: Props) => {
  const getRatingGradient = (rating: number | null | undefined) => {
    if (rating === null || rating === undefined) {
      // No rating: the theme's own control colours, so it reads on a light
      // card as on a dark one (a white tint vanished on the Light theme)
      return {
        background: "var(--bg-secondary)",
        boxShadow: "0 1px 2px rgba(0, 0, 0, 0.25)",
        border: "1px solid var(--border-color)",
        color: "var(--text-secondary)",
        text: "--",
      };
    }

    return { ...ratingMedal(rating), text: (rating / 10).toFixed(1) };
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
