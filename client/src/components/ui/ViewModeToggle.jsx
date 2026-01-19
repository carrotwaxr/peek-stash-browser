import { useState, useEffect } from "react";
import { LucideGrid2X2, LucideSquare, LucideNetwork, LucideList, LucideCalendar, LucideFolderOpen } from "lucide-react";

// Default modes for backward compatibility
const DEFAULT_MODES = [
  { id: "grid", icon: LucideGrid2X2, label: "Grid view" },
  { id: "wall", icon: LucideSquare, label: "Wall view" },
];

// Icon mapping for custom mode definitions
const MODE_ICONS = {
  grid: LucideGrid2X2,
  wall: LucideSquare,
  hierarchy: LucideNetwork,
  table: LucideList,
  timeline: LucideCalendar,
  folder: LucideFolderOpen,
};

/**
 * Toggle between view modes.
 *
 * @param {Array} modes - Optional custom modes array [{id, label, icon?}]
 *                        If not provided, defaults to grid/wall
 * @param {string} value - Currently selected mode id
 * @param {function} onChange - Called with mode id when selection changes
 */
const ViewModeToggle = ({ modes, value = "grid", onChange, className = "" }) => {
  // Local state for immediate visual feedback (optimistic update)
  const [localValue, setLocalValue] = useState(value);

  // Sync local state when parent value changes (authoritative)
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleClick = (modeId) => {
    setLocalValue(modeId); // Immediate visual feedback
    onChange(modeId);       // Trigger parent update
  };

  // Use custom modes or fall back to defaults
  const effectiveModes = modes
    ? modes.map((mode) => ({
        ...mode,
        icon: mode.icon || MODE_ICONS[mode.id] || LucideGrid2X2,
      }))
    : DEFAULT_MODES;

  return (
    <div
      className={`inline-flex items-center rounded-lg overflow-hidden h-[34px] ${className}`}
      style={{
        backgroundColor: "var(--bg-secondary)",
        border: "1px solid var(--border-color)",
      }}
    >
      {effectiveModes.map((mode) => (
        <button
          key={mode.id}
          type="button"
          onClick={() => handleClick(mode.id)}
          className="px-2.5 h-full transition-colors flex items-center justify-center"
          style={{
            backgroundColor: localValue === mode.id ? "var(--accent-primary)" : "transparent",
            color: localValue === mode.id ? "white" : "var(--text-secondary)",
          }}
          title={mode.label}
          aria-label={mode.label}
          aria-pressed={localValue === mode.id}
        >
          <mode.icon size={18} />
        </button>
      ))}
    </div>
  );
};

export default ViewModeToggle;
