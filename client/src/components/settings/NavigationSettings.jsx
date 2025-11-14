import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Eye, EyeOff } from "lucide-react";
import {
  NAV_DEFINITIONS,
  getNavDefinition,
} from "../../constants/navigation.js";
import { ThemedIcon } from "../icons/index.js";
import { Button } from "../ui/index.js";

/**
 * NavigationSettings component
 * Allows users to toggle visibility and reorder navigation menu items
 */
const NavigationSettings = ({ navPreferences, onSave }) => {
  const [preferences, setPreferences] = useState([]);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    // Sort by order on initial load
    const sorted = [...(navPreferences || [])].sort(
      (a, b) => a.order - b.order
    );
    setPreferences(sorted);
    setHasChanges(false);
  }, [navPreferences]);

  const moveUp = (index) => {
    if (index === 0) return;

    const newPreferences = [...preferences];
    [newPreferences[index - 1], newPreferences[index]] = [
      newPreferences[index],
      newPreferences[index - 1],
    ];

    // Re-normalize order values
    const reordered = newPreferences.map((pref, idx) => ({
      ...pref,
      order: idx,
    }));

    setPreferences(reordered);
    setHasChanges(true);
  };

  const moveDown = (index) => {
    if (index === preferences.length - 1) return;

    const newPreferences = [...preferences];
    [newPreferences[index], newPreferences[index + 1]] = [
      newPreferences[index + 1],
      newPreferences[index],
    ];

    // Re-normalize order values
    const reordered = newPreferences.map((pref, idx) => ({
      ...pref,
      order: idx,
    }));

    setPreferences(reordered);
    setHasChanges(true);
  };

  const toggleEnabled = (id) => {
    const updated = preferences.map((pref) =>
      pref.id === id ? { ...pref, enabled: !pref.enabled } : pref
    );
    setPreferences(updated);
    setHasChanges(true);
  };

  const handleSave = () => {
    onSave(preferences);
    setHasChanges(false);
  };

  const handleReset = () => {
    const sorted = [...navPreferences].sort((a, b) => a.order - b.order);
    setPreferences(sorted);
    setHasChanges(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3
          className="text-lg font-semibold mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          Navigation Menu
        </h3>
        <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
          Use arrow buttons to reorder navigation items, click the eye icon to
          toggle visibility
        </p>
      </div>

      <div className="space-y-2">
        {preferences.map((pref, index) => {
          const definition = getNavDefinition(pref.id);
          if (!definition) return null;

          return (
            <div
              key={pref.id}
              className={`
                p-4 rounded-lg border transition-all duration-200
                ${pref.enabled ? "" : "opacity-60"}
              `}
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              {/* Top row: Icon, Name/Description */}
              <div className="flex items-start gap-3 mb-3">
                {/* Icon */}
                <div className="flex-shrink-0 mt-1">
                  <ThemedIcon name={definition.icon} size={24} />
                </div>

                {/* Name and description */}
                <div className="flex-1 min-w-0">
                  <div
                    className="font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {definition.name}
                  </div>
                  <div
                    className="text-sm mt-1"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {definition.description}
                  </div>
                </div>
              </div>

              {/* Bottom row: Reorder buttons and Toggle visibility */}
              <div className="flex items-center justify-between">
                {/* Reorder buttons */}
                <div className="flex gap-2">
                  <Button
                    onClick={() => moveUp(index)}
                    disabled={index === 0}
                    variant="secondary"
                    className="p-1.5"
                    icon={<ChevronUp className="w-4 h-4" />}
                    title="Move up"
                  />
                  <Button
                    onClick={() => moveDown(index)}
                    disabled={index === preferences.length - 1}
                    variant="secondary"
                    className="p-1.5"
                    icon={<ChevronDown className="w-4 h-4" />}
                    title="Move down"
                  />
                </div>

                {/* Toggle visibility */}
                <Button
                  onClick={() => toggleEnabled(pref.id)}
                  variant={pref.enabled ? "primary" : "secondary"}
                  className="p-2"
                  icon={
                    pref.enabled ? (
                      <Eye className="w-5 h-5" />
                    ) : (
                      <EyeOff className="w-5 h-5" />
                    )
                  }
                  title={pref.enabled ? "Hide from menu" : "Show in menu"}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Save/Cancel buttons - always visible */}
      <div
        className="flex items-center justify-end space-x-3 pt-4 border-t"
        style={{ borderColor: "var(--border-color)" }}
      >
        <Button
          disabled={!hasChanges}
          onClick={handleReset}
          variant="secondary"
        >
          Cancel
        </Button>
        <Button disabled={!hasChanges} onClick={handleSave} variant="primary">
          Save Changes
        </Button>
      </div>
    </div>
  );
};

export default NavigationSettings;
