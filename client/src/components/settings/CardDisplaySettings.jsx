import { useState } from "react";
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext.jsx";
import { showSuccess, showError } from "../../utils/toast.jsx";

const ENTITY_TYPES = [
  { id: "scene", label: "Scene", hasCode: true },
  { id: "performer", label: "Performer", hasCode: false },
  { id: "studio", label: "Studio", hasCode: false },
  { id: "gallery", label: "Gallery", hasCode: false },
  { id: "group", label: "Group", hasCode: false },
  { id: "tag", label: "Tag", hasCode: false },
  { id: "image", label: "Image", hasCode: false },
];

const Toggle = ({ label, checked, onChange, description }) => (
  <label className="flex items-start gap-3 cursor-pointer">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="mt-1 w-4 h-4 rounded"
      style={{
        accentColor: "var(--accent-primary)",
      }}
    />
    <div>
      <span style={{ color: "var(--text-primary)" }}>{label}</span>
      {description && (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {description}
        </p>
      )}
    </div>
  </label>
);

const EntitySettingsSection = ({ entityType, hasCode }) => {
  const { getSettings, updateSettings } = useCardDisplaySettings();
  const settings = getSettings(entityType);

  const handleChange = async (key, value) => {
    try {
      await updateSettings(entityType, key, value);
      showSuccess("Setting saved");
    } catch {
      showError("Failed to save setting");
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {hasCode && (
          <Toggle
            label="Show studio code on cards"
            checked={settings.showCodeOnCard}
            onChange={(v) => handleChange("showCodeOnCard", v)}
            description="Display scene codes (e.g., JAV codes) in card subtitles"
          />
        )}
        <Toggle
          label="Show description on cards"
          checked={settings.showDescriptionOnCard}
          onChange={(v) => handleChange("showDescriptionOnCard", v)}
        />
        <Toggle
          label="Show description on detail page"
          checked={settings.showDescriptionOnDetail}
          onChange={(v) => handleChange("showDescriptionOnDetail", v)}
        />
        <Toggle
          label="Show rating"
          checked={settings.showRating}
          onChange={(v) => handleChange("showRating", v)}
        />
        <Toggle
          label="Show favorite"
          checked={settings.showFavorite}
          onChange={(v) => handleChange("showFavorite", v)}
        />
        <Toggle
          label="Show O counter"
          checked={settings.showOCounter}
          onChange={(v) => handleChange("showOCounter", v)}
        />
      </div>
    </div>
  );
};

const CardDisplaySettings = () => {
  const [expandedEntity, setExpandedEntity] = useState("scene");

  return (
    <div>
      <h3
        className="text-lg font-semibold mb-4"
        style={{ color: "var(--text-primary)" }}
      >
        Card Display
      </h3>
      <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
        Control what information appears on entity cards and detail pages.
      </p>

      {/* Accordion-style entity sections */}
      <div className="space-y-2">
        {ENTITY_TYPES.map(({ id, label, hasCode }) => (
          <div
            key={id}
            className="rounded-lg border"
            style={{
              backgroundColor: "var(--bg-secondary)",
              borderColor: "var(--border-color)",
            }}
          >
            <button
              onClick={() => setExpandedEntity(expandedEntity === id ? null : id)}
              className="w-full px-4 py-3 flex justify-between items-center"
              style={{ color: "var(--text-primary)" }}
            >
              <span className="font-medium">{label}</span>
              <span>{expandedEntity === id ? "−" : "+"}</span>
            </button>
            {expandedEntity === id && (
              <div className="px-4 pb-4">
                <EntitySettingsSection
                  entityType={id}
                  hasCode={hasCode}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default CardDisplaySettings;
