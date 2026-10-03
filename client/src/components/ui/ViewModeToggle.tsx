import { useEffect, useRef, useState } from "react";
import { type LucideIcon } from "lucide-react";
import {
  LucideCalendar,
  LucideChevronDown,
  LucideFolderOpen,
  LucideGrid2X2,
  LucideList,
  LucideNetwork,
  LucideSquare,
} from "lucide-react";
import { useRovingFocus } from "../../hooks/useRovingFocus";
import Popover from "./Popover";

interface ViewMode {
  id: string;
  label: string;
  icon?: LucideIcon;
}

interface Props {
  modes?: ViewMode[];
  value?: string;
  onChange: (modeId: string) => void;
  className?: string;
}

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
 * Keyboard and D-pad: Enter on the button opens the menu with focus on the
 * current mode, the arrows move between modes, Enter picks one and Escape
 * closes it (focus returns to the button).
 *
 * @param {Array} modes - Optional custom modes array [{id, label, icon?}]
 *                        If not provided, defaults to grid/wall
 * @param {string} value - Currently selected mode id
 * @param {function} onChange - Called with mode id when selection changes
 */
const ViewModeToggle = ({
  modes,
  value = "grid",
  onChange,
  className = "",
}: Props) => {
  // Local state for immediate visual feedback (optimistic update)
  const [localValue, setLocalValue] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const onListKeyDown = useRovingFocus(listRef, {
    itemSelector: '[role="option"]',
  });

  // Sync local state when parent value changes (authoritative)
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleSelect = (modeId: string) => {
    setLocalValue(modeId); // Immediate visual feedback
    onChange(modeId); // Trigger parent update
    setIsOpen(false);
  };

  // Use custom modes or fall back to defaults
  const effectiveModes = modes
    ? modes.map((mode) => ({
        ...mode,
        icon:
          (mode.icon ?? MODE_ICONS[mode.id as keyof typeof MODE_ICONS]) ||
          LucideGrid2X2,
      }))
    : DEFAULT_MODES;

  const currentMode =
    effectiveModes.find((m) => m.id === localValue) ?? effectiveModes[0];
  if (!currentMode) return null;
  const CurrentIcon = currentMode.icon;

  return (
    <div className={`relative ${className}`}>
      {/* Trigger button */}
      <button
        ref={triggerRef}
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
        aria-haspopup="dialog"
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
      <Popover
        anchorRef={triggerRef}
        open={isOpen}
        onClose={() => setIsOpen(false)}
        label="View modes"
      >
        <div
          ref={listRef}
          className="p-1 flex flex-col gap-0.5 min-w-[100px]"
          role="listbox"
          aria-label="View modes"
          onKeyDown={onListKeyDown}
        >
          {effectiveModes.map((mode) => {
            const ModeIcon = mode.icon;
            const isSelected = currentMode.id === mode.id;
            // Extract single word (remove "view" suffix)
            const shortLabel = mode.label.replace(/ view$/i, "");

            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => handleSelect(mode.id)}
                className="flex items-center gap-2 px-2 py-1.5 rounded transition-colors hover:bg-[var(--bg-tertiary)] text-left"
                style={{
                  color: isSelected
                    ? "var(--accent-primary)"
                    : "var(--text-secondary)",
                  backgroundColor: isSelected
                    ? "var(--bg-tertiary)"
                    : "transparent",
                }}
                role="option"
                aria-selected={isSelected}
                aria-label={mode.label}
                data-popover-focus={isSelected ? "" : undefined}
              >
                <ModeIcon size={16} />
                <span className="text-sm">{shortLabel}</span>
              </button>
            );
          })}
        </div>
      </Popover>
    </div>
  );
};

export default ViewModeToggle;
