import { Heart } from "lucide-react";
import { useCoarsePointer } from "../../hooks/useHoverCapable";

interface Props {
  isFavorite: boolean;
  onChange?: (value: boolean) => void;
  size?: "small" | "medium" | "large" | number;
  variant?: "card" | "detail";
  className?: string;
  disabled?: boolean;
}

/**
 * Standalone favorite toggle button
 * Filled heart when favorited (theme accent-primary), outline when not
 */
const FavoriteButton = ({
  isFavorite,
  onChange,
  size = "small",
  variant = "card", // eslint-disable-line @typescript-eslint/no-unused-vars
  className = "",
  disabled = false,
}: Props) => {
  const sizeMap = {
    small: 20,
    medium: 24,
    large: 28,
  };

  const iconSize = typeof size === "number" ? size : sizeMap[size];

  // On a finger the button's box (28 px small, 36 and 40 px larger) gets a
  // 44 px hit area from a ::before; the box itself does not change
  const coarsePointer = useCoarsePointer();
  const hitArea = !coarsePointer
    ? ""
    : size === "small"
      ? "relative before:absolute before:-inset-2"
      : size === "large"
        ? "relative before:absolute before:-inset-0.5"
        : "relative before:absolute before:-inset-1";

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
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
      className={`transition-all hover:scale-110 active:scale-95 ${
        disabled || !onChange ? "cursor-default" : "cursor-pointer"
      } ${hitArea} ${className}`}
      style={{
        background: "none",
        border: "none",
        padding: size === "small" ? "4px" : "6px",
      }}
      aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
      title={isFavorite ? "Remove from favorites" : "Add to favorites"}
    >
      <Heart
        size={iconSize}
        fill={isFavorite ? "var(--accent-primary)" : "none"}
        stroke={isFavorite ? "var(--accent-primary)" : "var(--text-muted)"}
        strokeWidth={isFavorite ? 2 : 1.5}
      />
    </button>
  );
};

export default FavoriteButton;
