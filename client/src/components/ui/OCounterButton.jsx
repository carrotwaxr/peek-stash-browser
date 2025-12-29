import { useEffect, useState } from "react";
import { LucideDroplets } from "lucide-react";
import { apiPost } from "../../services/api.js";

/**
 * Interactive O Counter button component
 * Displays current O counter value and increments on click (scenes and images)
 * For other entities, displays as read-only indicator
 *
 * @param {string} sceneId - Stash scene ID (for scene interactive mode)
 * @param {string} imageId - Stash image ID (for image interactive mode)
 * @param {number} initialCount - Initial O counter value
 * @param {Function} onChange - Optional callback after successful increment (receives new count)
 * @param {string} size - Size variant: small, medium, large
 * @param {string} variant - Style variant: card (transparent), page (with background), lightbox
 * @param {boolean} interactive - Enable click-to-increment (default: true if sceneId or imageId provided)
 */
const OCounterButton = ({
  sceneId,
  imageId,
  initialCount = 0,
  onChange,
  size = "small",
  variant = "card",
  interactive = true,
}) => {
  const [count, setCount] = useState(initialCount ?? 0);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  // Sync count when initialCount changes
  useEffect(() => {
    setCount(initialCount ?? 0);
  }, [initialCount]);

  // Size configurations
  const sizes = {
    small: { icon: 20, text: "text-sm", padding: "p-1.5", gap: "gap-1" },
    medium: { icon: 24, text: "text-base", padding: "p-2", gap: "gap-1.5" },
    large: { icon: 28, text: "text-lg", padding: "p-2.5", gap: "gap-2" },
  };

  const config = sizes[size] || sizes.small;

  // Determine which entity ID to use
  const entityId = sceneId || imageId;
  const entityType = sceneId ? "scene" : imageId ? "image" : null;

  const handleClick = async (e) => {
    // Stop propagation to prevent triggering parent click handlers
    e.preventDefault();
    e.stopPropagation();

    // Only allow incrementing for scenes/images with interactive mode
    if (!interactive || isUpdating || !entityId) {
      return;
    }

    const newCount = count + 1;
    setCount(newCount); // Optimistic update
    setIsAnimating(true);
    setIsUpdating(true);

    try {
      let response;
      if (sceneId) {
        response = await apiPost("/watch-history/increment-o", { sceneId });
      } else if (imageId) {
        response = await apiPost("/image-view-history/increment-o", { imageId });
      }

      if (response?.success) {
        setCount(response.oCount); // Update with server value
        onChange?.(response.oCount);
      }
    } catch (err) {
      console.error(`Error incrementing O counter for ${entityType}:`, err);
      setCount(count); // Revert on error
    } finally {
      setTimeout(() => {
        setIsAnimating(false);
        setIsUpdating(false);
      }, 600);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={isUpdating}
      className={`flex items-center ${config.gap} ${config.padding} rounded transition-all hover:scale-105 active:scale-95 relative ${
        isAnimating ? "animate-pulse" : ""
      }`}
      style={{
        backgroundColor:
          variant === "card" || variant === "lightbox" ? "transparent" : "var(--bg-tertiary)",
        border: variant === "card" || variant === "lightbox" ? "none" : "1px solid var(--border-color)",
        cursor:
          interactive && entityId
            ? isUpdating
              ? "not-allowed"
              : "pointer"
            : "default",
        opacity: isUpdating ? 0.7 : 1,
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
        className={`${config.text} font-medium transition-all ${
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
