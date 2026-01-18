import { useState } from "react";
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext.jsx";
import ZoomSlider from "../ui/ZoomSlider.jsx";
import {
  ENTITY_DISPLAY_CONFIG,
  getEntityTypes,
  getAvailableSettings,
  getViewModes,
  SETTING_LABELS,
  SETTING_DESCRIPTIONS,
} from "../../config/entityDisplayConfig.js";
import { showSuccess, showError } from "../../utils/toast.jsx";

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

const Dropdown = ({ label, value, options, onChange, description }) => (
  <div className="flex flex-col gap-1">
    <label className="flex items-center justify-between gap-3">
      <div>
        <span style={{ color: "var(--text-primary)" }}>{label}</span>
        {description && (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {description}
          </p>
        )}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-1.5 rounded border"
        style={{
          backgroundColor: "var(--bg-primary)",
          borderColor: "var(--border-color)",
          color: "var(--text-primary)",
        }}
      >
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  </div>
);

const EntitySettingsSection = ({ entityType }) => {
  const { getSettings, updateSettings } = useCardDisplaySettings();
  const settings = getSettings(entityType);
  const availableSettings = getAvailableSettings(entityType);
  const viewModes = getViewModes(entityType);

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
        {/* Default View Mode - always first if available */}
        {availableSettings.includes("defaultViewMode") && (
          <Dropdown
            label={SETTING_LABELS.defaultViewMode}
            value={settings.defaultViewMode}
            options={viewModes}
            onChange={(v) => handleChange("defaultViewMode", v)}
          />
        )}

        {/* Default Density - shown for Grid or Wall view modes */}
        {(settings.defaultViewMode === "grid" || settings.defaultViewMode === "wall") && (
          <div className="mt-2">
            <label className="flex items-center justify-between gap-3">
              <span style={{ color: "var(--text-primary)" }}>
                {settings.defaultViewMode === "grid" ? "Default Grid Density" : "Default Wall Size"}
              </span>
              <ZoomSlider
                value={
                  settings.defaultViewMode === "grid"
                    ? (settings.defaultGridDensity || "medium")
                    : (settings.defaultWallZoom || "medium")
                }
                onChange={(density) =>
                  handleChange(
                    settings.defaultViewMode === "grid" ? "defaultGridDensity" : "defaultWallZoom",
                    density
                  )
                }
              />
            </label>
          </div>
        )}

        {/* Toggle settings */}
        {availableSettings
          .filter((key) => !["defaultViewMode", "defaultGridDensity", "defaultWallZoom"].includes(key))
          .map((settingKey) => (
            <Toggle
              key={settingKey}
              label={SETTING_LABELS[settingKey]}
              checked={settings[settingKey]}
              onChange={(v) => handleChange(settingKey, v)}
              description={SETTING_DESCRIPTIONS[settingKey]}
            />
          ))}
      </div>
    </div>
  );
};

const CardDisplaySettings = () => {
  const [expandedEntity, setExpandedEntity] = useState("scene");
  const entityTypes = getEntityTypes();

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
        {entityTypes.map((entityType) => {
          const config = ENTITY_DISPLAY_CONFIG[entityType];
          return (
            <div
              key={entityType}
              className="rounded-lg border"
              style={{
                backgroundColor: "var(--bg-secondary)",
                borderColor: "var(--border-color)",
              }}
            >
              <button
                onClick={() =>
                  setExpandedEntity(expandedEntity === entityType ? null : entityType)
                }
                className="w-full px-4 py-3 flex justify-between items-center"
                style={{ color: "var(--text-primary)" }}
              >
                <span className="font-medium">{config.label}</span>
                <span>{expandedEntity === entityType ? "−" : "+"}</span>
              </button>
              {expandedEntity === entityType && (
                <div className="px-4 pb-4">
                  <EntitySettingsSection entityType={entityType} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CardDisplaySettings;
