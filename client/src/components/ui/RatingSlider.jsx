import { useState, useEffect, useRef } from "react";

/**
 * Inline slider for rating on detail pages
 * Replaces star rating with gradient slider
 * Debounced to avoid excessive API calls
 */
const RatingSlider = ({
  rating,
  onChange,
  label = "Rating",
  showClearButton = true,
}) => {
  const [value, setValue] = useState((rating ?? 0) / 10); // Convert 0-100 to 0-10
  const debounceTimerRef = useRef(null);

  useEffect(() => {
    setValue((rating ?? 0) / 10);
  }, [rating]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const getRatingGradient = (val) => {
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

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new timer to call onChange after 300ms of no changes
    debounceTimerRef.current = setTimeout(() => {
      onChange(Math.round(newValue * 10)); // Convert back to 0-100
    }, 300);
  };

  const handleClear = () => {
    setValue(0);
    onChange(null); // Clear rating
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Label and Value */}
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {label}
        </label>
        <div className="flex items-center gap-3">
          <span
            className="text-lg font-semibold min-w-[3rem] text-right"
            style={{ color: "var(--text-primary)" }}
          >
            {value.toFixed(1)}
          </span>
          {showClearButton && rating !== null && rating !== undefined && (
            <button
              onClick={handleClear}
              className="px-2 py-1 text-xs rounded transition-colors"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                color: "var(--text-muted)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--bg-secondary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--bg-tertiary)";
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Slider */}
      <input
        type="range"
        min="0"
        max="10"
        step="0.1"
        value={value}
        onChange={handleChange}
        className="w-full h-3 rounded-lg appearance-none cursor-pointer"
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
  );
};

export default RatingSlider;
