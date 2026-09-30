import { useCallback, useEffect, useRef, useState } from "react";
import type { UpdateUserSettingsBody } from "@peek/shared-types";
import { LucideSettings } from "lucide-react";
import { getErrorMessage } from "../../api";
import {
  type UserSettings,
  useUpdateUserSettings,
  useUserSettings,
} from "../../api/hooks/useUserSettings";
import {
  SETTING_LABELS,
  getAvailableSettings,
  getViewModes,
} from "../../config/entityDisplayConfig";
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext";
import { showError, showSuccess } from "../../utils/toast";
import ZoomSlider from "./ZoomSlider";

/**
 * Context-aware settings cog for the toolbar.
 * Shows a popover with settings relevant to the current page/view.
 *
 * @param {Array} settings - Array of user settings to offer, each read from
 *   and saved to the user-settings query (so every reader updates at once):
 *   [{
 *     key: "wallPlayback",
 *     label: "Preview Behavior",
 *     type: "select",
 *     options: [{ value: "autoplay", label: "Autoplay All" }, ...]
 *   }]
 */
interface SettingOption {
  value: string;
  label: string;
}

/** A user setting the cog can read and save. */
type UserSettingKey = keyof UserSettings & keyof UpdateUserSettingsBody;

interface SettingConfig {
  key: UserSettingKey;
  label: string;
  type: "select" | "toggle";
  options?: SettingOption[];
  toggleLabel?: string;
}

interface Props {
  settings?: SettingConfig[];
  className?: string;
  entityType?: string | null;
}

/** A stored card setting, or the default when it is unset or not a string. */
const settingText = (value: unknown, fallback: string) =>
  typeof value === "string" && value ? value : fallback;

/**
 * The popover's user settings. Rendered only while the popover is open, so a
 * closed cog asks nothing of the settings query.
 */
const UserSettingFields = ({ settings }: { settings: SettingConfig[] }) => {
  const { data } = useUserSettings();
  const save = useUpdateUserSettings();

  const handleSettingChange = useCallback(
    async (key: UserSettingKey, value: string | boolean) => {
      try {
        await save.mutateAsync({ [key]: value } as UpdateUserSettingsBody);
        showSuccess("Setting saved");
      } catch (err) {
        showError(getErrorMessage(err, "Failed to save setting"));
      }
    },
    [save]
  );

  const current = (key: UserSettingKey): unknown => data?.settings[key];

  return (
    <>
      {settings.map((setting) => (
        <div key={setting.key}>
          {setting.type === "select" && (
            <>
              <label
                htmlFor={`context-${setting.key}`}
                className="block text-xs font-medium mb-1"
                style={{ color: "var(--text-secondary)" }}
              >
                {setting.label}
              </label>
              <select
                id={`context-${setting.key}`}
                value={settingText(current(setting.key), "")}
                onChange={(e) =>
                  void handleSettingChange(setting.key, e.target.value)
                }
                disabled={save.isPending || !data}
                className="w-full px-2 py-1.5 rounded text-sm"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                  color: "var(--text-primary)",
                }}
              >
                {setting.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </>
          )}

          {setting.type === "toggle" && (
            <label
              htmlFor={`context-${setting.key}`}
              className="flex items-center cursor-pointer"
            >
              <input
                id={`context-${setting.key}`}
                type="checkbox"
                checked={current(setting.key) === true}
                onChange={(e) =>
                  void handleSettingChange(setting.key, e.target.checked)
                }
                disabled={save.isPending || !data}
                className="w-4 h-4"
                style={{ accentColor: "var(--accent-primary)" }}
              />
              <span
                className="ml-2 text-sm"
                style={{ color: "var(--text-primary)" }}
              >
                {setting.label}
                {setting.toggleLabel && (
                  <span style={{ color: "var(--text-muted)" }}>
                    {" "}
                    ({setting.toggleLabel})
                  </span>
                )}
              </span>
            </label>
          )}
        </div>
      ))}
    </>
  );
};

const ContextSettings = ({
  settings = [],
  className = "",
  entityType = null,
}: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Card display settings
  const { getSettings, updateSettings } = useCardDisplaySettings();
  const cardSettings = entityType ? getSettings(entityType) : null;

  const hasSettings = settings.length > 0 || entityType;

  // Close popover when clicking outside
  // Use mouseup instead of mousedown to avoid closing when interacting with
  // native select dropdowns (their options render outside our container)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mouseup", handleClickOutside);
      return () => document.removeEventListener("mouseup", handleClickOutside);
    }
    return undefined;
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
    return undefined;
  }, [isOpen]);

  const handleCardSettingChange = useCallback(
    async (key: string, value: string | boolean) => {
      // Card settings are shown only when there is an entity type
      if (!entityType) return;
      try {
        await updateSettings(entityType, key, value);
        showSuccess("Setting saved");
      } catch {
        showError("Failed to save setting");
      }
    },
    [entityType, updateSettings]
  );

  const togglePopover = () => {
    if (hasSettings) {
      setIsOpen(!isOpen);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Cog Button */}
      <button
        type="button"
        onClick={togglePopover}
        disabled={!hasSettings}
        className="px-2.5 h-[34px] rounded-lg transition-colors flex items-center justify-center"
        style={{
          backgroundColor: isOpen
            ? "var(--accent-primary)"
            : "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
          color: isOpen
            ? "white"
            : hasSettings
              ? "var(--text-secondary)"
              : "var(--text-muted)",
          opacity: hasSettings ? 1 : 0.5,
          cursor: hasSettings ? "pointer" : "not-allowed",
        }}
        title={
          hasSettings ? "View settings" : "No view-specific settings available"
        }
        aria-label="View settings"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <LucideSettings size={18} />
      </button>

      {/* Popover */}
      {isOpen && hasSettings && (
        <div
          className="absolute top-full mt-2 w-64 rounded-lg shadow-lg z-50"
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border-color)",
            right: "max(-1rem, calc(-100vw + 100% + 1rem))",
            maxWidth: "calc(100vw - 1rem)",
          }}
        >
          {/* Header */}
          <div
            className="px-3 py-2 border-b"
            style={{ borderColor: "var(--border-color)" }}
          >
            <h3
              className="text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              View Settings
            </h3>
          </div>

          {/* Settings */}
          <div className="p-3 space-y-3">
            <UserSettingFields settings={settings} />

            {/* Card Display Section - shown when entityType is provided */}
            {entityType && (
              <div
                className="border-t pt-3 mt-3"
                style={{ borderColor: "var(--border-color)" }}
              >
                <h4
                  className="text-xs font-medium mb-2"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Card Display
                </h4>
                <div className="space-y-2">
                  {/* Default View Mode dropdown */}
                  {(getAvailableSettings(entityType) as string[]).includes(
                    "defaultViewMode"
                  ) && (
                    <div>
                      <label
                        htmlFor="context-defaultViewMode"
                        className="block text-xs font-medium mb-1"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {SETTING_LABELS.defaultViewMode}
                      </label>
                      <select
                        id="context-defaultViewMode"
                        value={settingText(
                          cardSettings?.defaultViewMode,
                          "grid"
                        )}
                        onChange={(e) =>
                          void handleCardSettingChange(
                            "defaultViewMode",
                            e.target.value
                          )
                        }
                        className="w-full px-2 py-1.5 rounded text-sm"
                        style={{
                          backgroundColor: "var(--bg-secondary)",
                          border: "1px solid var(--border-color)",
                          color: "var(--text-primary)",
                        }}
                      >
                        {(
                          getViewModes(entityType) as Array<{
                            id: string;
                            label: string;
                          }>
                        ).map((mode) => (
                          <option key={mode.id} value={mode.id}>
                            {mode.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {/* Default Density - shown for Grid or Wall view modes */}
                  {(cardSettings?.defaultViewMode === "grid" ||
                    cardSettings?.defaultViewMode === "wall") && (
                    <div className="mt-2">
                      <label
                        className="block text-xs font-medium mb-1"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {cardSettings?.defaultViewMode === "grid"
                          ? "Default Grid Density"
                          : "Default Wall Size"}
                      </label>
                      <ZoomSlider
                        value={
                          cardSettings?.defaultViewMode === "grid"
                            ? settingText(
                                cardSettings?.defaultGridDensity,
                                "medium"
                              )
                            : settingText(
                                cardSettings?.defaultWallZoom,
                                "medium"
                              )
                        }
                        onChange={(density) =>
                          void handleCardSettingChange(
                            cardSettings?.defaultViewMode === "grid"
                              ? "defaultGridDensity"
                              : "defaultWallZoom",
                            density
                          )
                        }
                      />
                    </div>
                  )}
                  {/* Toggle settings */}
                  {(getAvailableSettings(entityType) as string[])
                    .filter(
                      (key) =>
                        ![
                          "defaultViewMode",
                          "defaultGridDensity",
                          "defaultWallZoom",
                          "showDescriptionOnDetail",
                        ].includes(key)
                    )
                    .map((settingKey) => (
                      <label
                        key={settingKey}
                        className="flex items-center cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(cardSettings?.[settingKey] ?? true)}
                          onChange={(e) =>
                            void handleCardSettingChange(
                              settingKey,
                              e.target.checked
                            )
                          }
                          className="w-4 h-4"
                          style={{ accentColor: "var(--accent-primary)" }}
                        />
                        <span
                          className="ml-2 text-sm"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {SETTING_LABELS[
                            settingKey as keyof typeof SETTING_LABELS
                          ] || settingKey}
                        </span>
                      </label>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ContextSettings;
