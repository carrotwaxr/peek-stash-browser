import { ZOOM_LEVELS } from "../wall/wallConfig.js";

/**
 * 3-level zoom control for Wall view (S/M/L).
 */
const ZoomSlider = ({ value = "medium", onChange, className = "" }) => {
  const levels = Object.entries(ZOOM_LEVELS);

  return (
    <div
      className={`inline-flex items-center rounded-lg overflow-hidden h-[34px] ${className}`}
      style={{
        backgroundColor: "var(--bg-secondary)",
        border: "1px solid var(--border-color)",
      }}
    >
      {levels.map(([id, { label }]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className="px-2.5 h-full text-sm font-medium transition-colors flex items-center justify-center min-w-[28px]"
          style={{
            backgroundColor: value === id ? "var(--accent-primary)" : "transparent",
            color: value === id ? "white" : "var(--text-secondary)",
          }}
          title={`${label} size`}
          aria-label={`${label} size`}
          aria-pressed={value === id}
        >
          {label}
        </button>
      ))}
    </div>
  );
};

export default ZoomSlider;
