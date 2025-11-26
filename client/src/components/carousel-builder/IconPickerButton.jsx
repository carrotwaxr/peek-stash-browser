import { useState } from "react";
import * as LucideIcons from "lucide-react";
import IconPicker from "./IconPicker.jsx";

/**
 * IconPickerButton Component
 * Compact button that shows current icon and opens picker on click.
 *
 * @param {string} icon - Current icon name
 * @param {function} onChange - Callback when icon changes
 */
const IconPickerButton = ({ icon, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const IconComponent = LucideIcons[icon] || LucideIcons.Film;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors hover:border-gray-500"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderColor: "var(--border-color)",
          color: "var(--text-primary)",
        }}
      >
        <IconComponent className="w-5 h-5" />
        <span className="text-sm">Change Icon</span>
      </button>

      {isOpen && (
        <div className="absolute z-50 top-full mt-2 left-0">
          <IconPicker
            selectedIcon={icon}
            onSelect={onChange}
            onClose={() => setIsOpen(false)}
          />
        </div>
      )}
    </div>
  );
};

export default IconPickerButton;
