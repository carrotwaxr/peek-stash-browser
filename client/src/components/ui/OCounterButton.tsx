import { useState } from "react";
import { LucideDroplets } from "lucide-react";
import { useIncrementOCounter } from "../../api/hooks";
import { useCoarsePointer } from "../../hooks/useHoverCapable";

/**
 * Interactive O Counter button component
 * Displays current O counter value and increments on click (scenes and images)
 * For other entities, displays as read-only indicator
 *
 * @param {string} sceneId - Stash scene ID (for scene interactive mode)
 * @param {string} imageId - Stash image ID (for image interactive mode)
 * @param {string} instanceId - The entity's Stash instance, sent with the increment
 * @param {number} initialCount - Initial O counter value
 * @param {Function} onChange - Optional callback after successful increment (receives new count)
 * @param {string} size - Size variant: small, medium, large
 * @param {string} variant - Style variant: card (transparent), page (with background), lightbox
 * @param {boolean} interactive - Enable click-to-increment (default: true if sceneId or imageId provided)
 */
interface Props {
  sceneId?: string;
  imageId?: string;
  instanceId?: string;
  initialCount?: number;
  onChange?: (count: number) => void;
  size?: "small" | "medium" | "large";
  variant?: "card" | "page" | "lightbox";
  interactive?: boolean;
  disabled?: boolean;
}

const OCounterButton = ({
  sceneId,
  imageId,
  instanceId,
  initialCount = 0,
  onChange,
  size = "small",
  variant = "card",
  interactive = true,
}: Props) => {
  const shownCount = initialCount ?? 0;
  // The count after this button's presses, shown over `initialCount` until
  // the prop moves on (the caller caught up, or the server sent another
  // count): read from props, not copied into state, so a new count renders
  // once
  const [pressed, setPressed] = useState<{
    count: number;
    over: number;
  } | null>(null);
  if (pressed && pressed.over !== shownCount) setPressed(null);
  const count =
    pressed && pressed.over === shownCount ? pressed.count : shownCount;
  const [isAnimating, setIsAnimating] = useState(false);
  const incrementMutation = useIncrementOCounter();
  const coarsePointer = useCoarsePointer();

  // Size configurations
  const sizes = {
    small: { icon: 20, text: "text-sm", padding: "p-1.5", gap: "gap-1" },
    medium: { icon: 24, text: "text-base", padding: "p-2", gap: "gap-1.5" },
    large: { icon: 28, text: "text-lg", padding: "p-2.5", gap: "gap-2" },
  };
  // On a finger the button's box (32, 40 and 48 px) gets a 44 px hit area
  // from a ::before; the box itself does not change
  const coarseHitAreas = {
    small: "before:absolute before:-inset-[6px]",
    medium: "before:absolute before:-inset-0.5",
    large: "",
  };

  const config = sizes[size] || sizes.small;
  const hitArea = coarsePointer ? coarseHitAreas[size] : "";

  // Determine which entity ID to use
  const entityId = sceneId || imageId;
  const entityType = sceneId ? "scene" : imageId ? "image" : null;

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    // Stop propagation to prevent triggering parent click handlers
    e.preventDefault();
    e.stopPropagation();

    // Only allow incrementing for scenes/images with interactive mode
    if (!interactive || incrementMutation.isPending || !entityId) {
      return;
    }

    const previous = pressed;
    const newCount = count + 1;
    setPressed({ count: newCount, over: shownCount }); // Optimistic update
    setIsAnimating(true);

    try {
      const response = await incrementMutation.mutateAsync({
        sceneId,
        imageId,
        instanceId,
      });

      if (response?.success) {
        // The server's count
        const serverCount = response.oCount ?? newCount;
        setPressed({ count: serverCount, over: shownCount });
        onChange?.(serverCount);
      }
    } catch (err) {
      console.error(`Error incrementing O counter for ${entityType}:`, err);
      setPressed(previous); // Revert on error
    } finally {
      setTimeout(() => {
        setIsAnimating(false);
      }, 600);
    }
  };

  return (
    <button
      onClick={(e) => void handleClick(e)}
      disabled={incrementMutation.isPending}
      className={`flex items-center ${config.gap} ${config.padding} rounded transition-all hover:scale-105 active:scale-95 relative ${hitArea} ${
        isAnimating ? "animate-pulse" : ""
      }`}
      style={{
        backgroundColor:
          variant === "card" || variant === "lightbox"
            ? "transparent"
            : "var(--bg-tertiary)",
        border:
          variant === "card" || variant === "lightbox"
            ? "none"
            : "1px solid var(--border-color)",
        cursor:
          interactive && entityId
            ? incrementMutation.isPending
              ? "not-allowed"
              : "pointer"
            : "default",
        opacity: incrementMutation.isPending ? 0.7 : 1,
      }}
      aria-label={
        interactive && entityId
          ? `Increment O counter (current: ${count})`
          : `O Counter: ${count}`
      }
      title={
        interactive && entityId
          ? `O Counter: ${count} (click to increment)`
          : `O Counter: ${count}`
      }
    >
      {/* Droplet icon with bounce animation */}
      <span
        className={`flex items-center justify-center transition-transform ${
          isAnimating ? "scale-125" : "scale-100"
        }`}
        style={{
          color: "var(--status-info)",
          transition: "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        <LucideDroplets size={config.icon} />
      </span>

      {/* Count with scale animation */}
      <span
        className={`card-counter-text ${config.text} font-medium transition-all ${
          isAnimating ? "scale-110 font-bold" : "scale-100"
        }`}
        style={{
          color: "var(--text-primary)",
          transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        {count}
      </span>

      {/* +1 floating feedback */}
      {isAnimating && (
        <span
          className="absolute -top-2 -right-2 text-xs font-bold pointer-events-none"
          style={{
            color: "var(--status-success)",
            animation: "floatUp 0.6s ease-out",
          }}
        >
          +1
        </span>
      )}

      {/* Ripple effect on click */}
      {isAnimating && (
        <span
          className="absolute inset-0 rounded pointer-events-none"
          style={{
            animation: "ripple 0.6s ease-out",
            background:
              "radial-gradient(circle, var(--status-info) 0%, transparent 70%)",
            opacity: 0.3,
          }}
        />
      )}

      <style>{`
        @keyframes ripple {
          0% {
            transform: scale(0.8);
            opacity: 0.5;
          }
          100% {
            transform: scale(1.5);
            opacity: 0;
          }
        }
        @keyframes floatUp {
          0% {
            opacity: 1;
            transform: translateY(0);
          }
          100% {
            opacity: 0;
            transform: translateY(-16px);
          }
        }
      `}</style>
    </button>
  );
};

export default OCounterButton;
