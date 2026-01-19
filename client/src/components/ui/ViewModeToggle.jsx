import { useState, useEffect, useRef } from "react";
import { LucideGrid2X2, LucideSquare, LucideNetwork, LucideList, LucideCalendar, LucideFolderOpen, LucideChevronDown } from "lucide-react";

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
 * Toggle between view modes via icon dropdown.
 *
 * @param {Array} modes - Optional custom modes array [{id, label, icon?}]
 *                        If not provided, defaults to grid/wall
 * @param {string} value - Currently selected mode id
 * @param {function} onChange - Called with mode id when selection changes
 */
const ViewModeToggle = ({ modes, value = "grid", onChange, className = "" }) => {
  // Local state for immediate visual feedback (optimistic update)
  const [localValue, setLocalValue] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Sync local state when parent value changes (authoritative)
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [isOpen]);

  const handleSelect = (modeId) => {
    setLocalValue(modeId); // Immediate visual feedback
    onChange(modeId);       // Trigger parent update
    setIsOpen(false);
  };

  // Use custom modes or fall back to defaults
  const effectiveModes = modes
    ? modes.map((mode) => ({
        ...mode,
        icon: mode.icon || MODE_ICONS[mode.id] || LucideGrid2X2,
      }))
    : DEFAULT_MODES;

  const currentMode = effectiveModes.find((m) => m.id === localValue) || effectiveModes[0];
  const CurrentIcon = currentMode.icon;

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1 px-2.5 h-[34px] rounded-lg transition-colors"
        style={{
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
          color: "var(--text-primary)",
        }}
        title={`View: ${currentMode.label}`}
        aria-label={`View mode: ${currentMode.label}`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <CurrentIcon size={18} />
        <LucideChevronDown
          size={14}
          style={{
            color: "var(--text-tertiary)",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 150ms ease",
          }}
        />
      </button>

      {/* Dropdown menu - icons only */}
      {isOpen && (
        <div
          className="absolute top-full left-0 mt-1 p-1 rounded-lg shadow-lg z-50 flex flex-col gap-0.5 min-w-[100px]"
          style={{
            backgroundColor: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
          }}
          role="listbox"
          aria-label="View modes"
        >
          {effectiveModes.map((mode) => {
            const ModeIcon = mode.icon;
            const isSelected = localValue === mode.id;
            // Extract single word (remove "view" suffix)
            const shortLabel = mode.label.replace(/ view$/i, "");

            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => handleSelect(mode.id)}
                className="flex items-center gap-2 px-2 py-1.5 rounded transition-colors hover:bg-[var(--bg-tertiary)] text-left"
                style={{
                  color: isSelected ? "var(--accent-primary)" : "var(--text-secondary)",
                  backgroundColor: isSelected ? "var(--bg-tertiary)" : "transparent",
                }}
                role="option"
                aria-selected={isSelected}
                aria-label={mode.label}
              >
                <ModeIcon size={16} />
                <span className="text-sm">{shortLabel}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ViewModeToggle;
