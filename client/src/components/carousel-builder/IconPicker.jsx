import { useState } from "react";
import * as LucideIcons from "lucide-react";
import { Search, X } from "lucide-react";
import { CAROUSEL_ICONS } from "./carouselIcons.js";

/**
 * IconPicker Component
 * Grid-based icon selector with search functionality for choosing carousel icons.
 *
 * @param {string} selectedIcon - Currently selected icon name
 * @param {function} onSelect - Callback when an icon is selected
 * @param {function} onClose - Callback when picker is closed
 */
const IconPicker = ({ selectedIcon, onSelect, onClose }) => {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredIcons = CAROUSEL_ICONS.filter((iconName) =>
    iconName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelect = (iconName) => {
    onSelect(iconName);
    onClose();
  };

  return (
    <div
      className="rounded-lg border shadow-lg p-4"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-color)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3
          className="text-sm font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Choose Icon
        </h3>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-500/20 transition-colors"
        >
          <X className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search
          className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4"
          style={{ color: "var(--text-secondary)" }}
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search icons..."
          className="w-full pl-10 pr-4 py-2 rounded-lg border text-sm"
          style={{
            backgroundColor: "var(--bg-primary)",
            borderColor: "var(--border-color)",
            color: "var(--text-primary)",
          }}
        />
      </div>

      {/* Icon Grid */}
      <div
        className="grid grid-cols-6 gap-2 max-h-64 overflow-y-auto"
        style={{ scrollbarWidth: "thin" }}
      >
        {filteredIcons.map((iconName) => {
          const IconComponent = LucideIcons[iconName];
          if (!IconComponent) return null;

          const isSelected = selectedIcon === iconName;

          return (
            <button
              key={iconName}
              onClick={() => handleSelect(iconName)}
              className={`
                p-2.5 rounded-lg transition-all duration-200
                hover:scale-110 flex items-center justify-center
                ${isSelected ? "ring-2 ring-offset-2" : ""}
              `}
              style={{
                backgroundColor: isSelected
                  ? "var(--accent-primary)"
                  : "var(--bg-secondary)",
                color: isSelected
                  ? "var(--text-on-accent)"
                  : "var(--text-primary)",
                ringColor: "var(--accent-primary)",
                ringOffsetColor: "var(--bg-card)",
              }}
              title={iconName}
            >
              <IconComponent className="w-5 h-5" />
            </button>
          );
        })}
      </div>

      {/* Empty state */}
      {filteredIcons.length === 0 && (
        <div
          className="text-center py-8 text-sm"
          style={{ color: "var(--text-secondary)" }}
        >
          No icons match &quot;{searchQuery}&quot;
        </div>
      )}
    </div>
  );
};

export default IconPicker;
