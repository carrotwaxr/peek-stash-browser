import { useState, useEffect } from "react";
import { apiPost } from "../../services/api.js";
import { LucideDroplets } from "lucide-react";

/**
 * Interactive O Counter button component
 * Displays current O counter value and increments on click
 * Works only for scenes currently
 *
 * @param {string} sceneId - Stash scene ID (required)
 * @param {number} initialCount - Initial O counter value
 * @param {Function} onChange - Optional callback after successful increment (receives new count)
 * @param {string} size - Size variant: small, medium, large
 * @param {string} variant - Style variant: card (transparent), page (with background)
 */
const OCounterButton = ({
  sceneId,
  initialCount = 0,
  onChange,
  size = "small",
  variant = "card",
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

  const handleClick = async (e) => {
    // Stop propagation to prevent triggering parent click handlers
    e.preventDefault();
    e.stopPropagation();

    if (isUpdating || !sceneId) {
      return;
    }

    const newCount = count + 1;
    setCount(newCount); // Optimistic update
    setIsAnimating(true);
    setIsUpdating(true);

    try {
      const response = await apiPost("/watch-history/increment-o", { sceneId });

      if (response.success) {
        setCount(response.oCount); // Update with server value
        onChange?.(response.oCount);
      }
    } catch (err) {
      console.error("Error incrementing O counter:", err);
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
        backgroundColor: variant === "card" ? "transparent" : "var(--bg-tertiary)",
        border: variant === "card" ? "none" : "1px solid var(--border-color)",
        cursor: isUpdating ? "not-allowed" : "pointer",
        opacity: isUpdating ? 0.7 : 1,
      }}
      aria-label={`Increment O counter (current: ${count})`}
      title={`O Counter: ${count} (click to increment)`}
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
            background: "radial-gradient(circle, var(--status-info) 0%, transparent 70%)",
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
