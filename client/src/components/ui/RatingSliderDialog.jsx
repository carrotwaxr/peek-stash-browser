import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * Lightweight popover for editing rating from cards
 * Appears near the badge, auto-saves on change
 * Uses portal to render outside card DOM to prevent click bubbling to Link
 */
const RatingSliderDialog = ({
  isOpen,
  onClose,
  initialRating,
  onSave,
  entityType,
  entityTitle,
  anchorEl,
}) => {
  // Track null separately - null means unrated, not 0
  const [value, setValue] = useState(
    initialRating === null || initialRating === undefined
      ? null
      : initialRating / 10
  );
  const [position, setPosition] = useState({
    top: 0,
    left: 0,
    transformY: "-100%",
  });
  const popoverRef = useRef(null);
  const debounceTimerRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setValue(
        initialRating === null || initialRating === undefined
          ? null
          : initialRating / 10
      );
    }
  }, [isOpen, initialRating]);

  // Calculate position based on anchor element
  useEffect(() => {
    if (isOpen && anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      const popoverWidth = 280; // Match the width in the popover style
      const popoverHeight = 240; // Approximate height of popover
      const viewportWidth = window.innerWidth;
      const _viewportHeight = window.innerHeight;
      const gap = 8;

      // Calculate left position, ensuring it doesn't go off-screen
      let left = rect.left;

      // If popover would extend beyond right edge, align to right of badge
      if (left + popoverWidth > viewportWidth - 16) {
        left = rect.right - popoverWidth;
      }

      // Ensure it doesn't go off left edge either
      if (left < 16) {
        left = 16;
      }

      // Calculate vertical position - prefer above, but position below if not enough space
      let top = rect.top - gap;
      let transformY = "-100%"; // Position above by default

      // Check if there's enough space above
      if (rect.top < popoverHeight + gap) {
        // Not enough space above, position below instead
        top = rect.bottom + gap;
        transformY = "0";
      }

      setPosition({
        top: top,
        left: left,
        transformY: transformY,
      });
    }
  }, [isOpen, anchorEl]);

  // Click outside or scroll to close
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target) &&
        !anchorEl?.contains(e.target)
      ) {
        onClose();
      }
    };

    const handleScroll = () => {
      onClose();
    };

    // Slight delay to avoid immediate close from the opening click
    setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 10);

    // Close on any scroll event (capture phase to catch all scroll events)
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [isOpen, onClose, anchorEl]);

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  if (!isOpen) return null;

  const getRatingGradient = (val) => {
    // Unrated: neutral gray
    if (val === null || val === undefined) {
      return "linear-gradient(90deg, #6B7280 0%, #4B5563 100%)"; // Neutral gray
    }
    // Rated: metallic gradients
    if (val < 3.5) {
      return "linear-gradient(90deg, #CD7F32 0%, #B87333 100%)"; // Copper
    } else if (val < 7.0) {
      return "linear-gradient(90deg, #C0C0C0 0%, #A8A8A8 100%)"; // Silver
    } else {
      return "linear-gradient(90deg, #FFD700 0%, #FFA500 100%)"; // Gold
    }
  };

  const handleChange = (e) => {
    const newValue = parseFloat(e.target.value);
    setValue(newValue);

    // Debounced auto-save
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      const ratingValue = Math.round(newValue * 10); // Convert back to 0-100
      // If user drags to 0, treat as clearing the rating
      onSave(ratingValue === 0 ? null : ratingValue);
    }, 300);
  };

  const handleClear = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onSave(null); // Clear rating
    onClose();
  };

  const popoverContent = (
    <div
      ref={popoverRef}
      className="fixed z-50 rounded-lg p-4 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
      onMouseMove={(e) => e.stopPropagation()}
      onMouseEnter={(e) => e.stopPropagation()}
      onMouseLeave={(e) => e.stopPropagation()}
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-color)",
        border: "1px solid",
        width: "280px",
        top: `${position.top}px`,
        left: `${position.left}px`,
        transform: `translateY(${position.transformY})`,
        pointerEvents: "auto",
      }}
    >
      {/* Header */}
      <div className="mb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div
              className="text-sm font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Rate {entityType}
            </div>
            {entityTitle && (
              <div
                className="text-xs mt-1 line-clamp-1"
                style={{ color: "var(--text-muted)" }}
              >
                {entityTitle}
              </div>
            )}
          </div>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            className="flex-shrink-0 p-1 rounded hover:opacity-70 transition-opacity"
            style={{ color: "var(--text-muted)" }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Current Value Display */}
      <div className="text-center mb-4">
        <div
          className="text-4xl font-bold"
          style={{
            color: value === null ? "var(--text-muted)" : "var(--text-primary)",
          }}
        >
          {value === null ? "--" : value.toFixed(1)}
        </div>
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          {value === null ? "Not rated" : "out of 10.0"}
        </div>
      </div>

      {/* Slider */}
      <div className="mb-3">
        <input
          type="range"
          min="0"
          max="10"
          step="0.1"
          value={value ?? 0}
          onChange={handleChange}
          className="w-full h-2 rounded-lg appearance-none cursor-pointer"
          style={{
            background: getRatingGradient(value),
          }}
        />
        <style>{`
          input[type="range"]::-webkit-slider-thumb {
            appearance: none;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: white;
            cursor: pointer;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          }
          input[type="range"]::-moz-range-thumb {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: white;
            cursor: pointer;
            border: none;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          }
        `}</style>
      </div>

      {/* Clear Button */}
      <button
        onClick={handleClear}
        className="w-full px-3 py-1.5 text-xs rounded hover:opacity-80 transition-opacity"
        style={{
          backgroundColor: "var(--bg-tertiary)",
          color: "var(--text-muted)",
        }}
      >
        Clear Rating
      </button>
    </div>
  );

  return createPortal(popoverContent, document.body);
};

export default RatingSliderDialog;
