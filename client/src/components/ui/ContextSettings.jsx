import { useCallback, useEffect, useRef, useState } from "react";
import { LucideSettings } from "lucide-react";
import axios from "axios";
import { showError, showSuccess } from "../../utils/toast.jsx";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

/**
 * Context-aware settings cog for the toolbar.
 * Shows a popover with settings relevant to the current page/view.
 *
 * @param {Array} settings - Array of setting configs:
 *   [{
 *     key: "wallPlayback",
 *     label: "Preview Behavior",
 *     type: "select",
 *     options: [{ value: "autoplay", label: "Autoplay All" }, ...]
 *   }]
 * @param {Object} currentValues - Current values for each setting key
 * @param {Function} onSettingChange - Called with (key, value) when setting changes
 */
const ContextSettings = ({
  settings = [],
  currentValues = {},
  onSettingChange,
  className = "",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const containerRef = useRef(null);

  const hasSettings = settings.length > 0;

  // Close popover when clicking outside
  // Use mouseup instead of mousedown to avoid closing when interacting with
  // native select dropdowns (their options render outside our container)
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mouseup", handleClickOutside);
      return () => document.removeEventListener("mouseup", handleClickOutside);
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen]);

  const handleSettingChange = useCallback(
    async (key, value) => {
      setSaving(true);
      try {
        await api.put("/user/settings", { [key]: value });
        if (onSettingChange) {
          onSettingChange(key, value);
        }
        showSuccess("Setting saved");
      } catch (err) {
        showError(err.response?.data?.error || "Failed to save setting");
      } finally {
        setSaving(false);
      }
    },
    [onSettingChange]
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
          backgroundColor: isOpen ? "var(--accent-primary)" : "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
          color: isOpen ? "white" : hasSettings ? "var(--text-secondary)" : "var(--text-muted)",
          opacity: hasSettings ? 1 : 0.5,
          cursor: hasSettings ? "pointer" : "not-allowed",
        }}
        title={hasSettings ? "View settings" : "No view-specific settings available"}
        aria-label="View settings"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <LucideSettings size={18} />
      </button>

      {/* Popover */}
      {isOpen && hasSettings && (
        <div
          className="absolute right-0 top-full mt-2 w-64 rounded-lg shadow-lg z-50"
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border-color)",
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
                      value={currentValues[setting.key] || ""}
                      onChange={(e) => handleSettingChange(setting.key, e.target.value)}
                      disabled={saving}
                      className="w-full px-2 py-1.5 rounded text-sm"
                      style={{
                        backgroundColor: "var(--bg-secondary)",
                        border: "1px solid var(--border-color)",
                        color: "var(--text-primary)",
                      }}
                    >
                      {setting.options.map((option) => (
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
                      checked={currentValues[setting.key] || false}
                      onChange={(e) => handleSettingChange(setting.key, e.target.checked)}
                      disabled={saving}
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
                          {" "}({setting.toggleLabel})
                        </span>
                      )}
                    </span>
                  </label>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ContextSettings;
