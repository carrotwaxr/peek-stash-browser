import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTheme } from "../../../themes/useTheme.js";
import CustomThemeManager from "../CustomThemeManager.jsx";
import { Button } from "../../ui/index.js";

const ThemeTab = () => {
  const { changeTheme, availableThemes, currentTheme } = useTheme();
  const [uiExamplesExpanded, setUiExamplesExpanded] = useState(false);

  return (
    <div className="space-y-6">
      {/* Built-in Themes */}
      <div
        className="p-6 rounded-lg border"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <h3
          className="text-lg font-semibold mb-4"
          style={{ color: "var(--text-primary)" }}
        >
          Built-in Themes
        </h3>
        <div className="space-y-2">
          {availableThemes
            .filter((theme) => !theme.isCustom)
            .map((theme) => (
              <Button
                key={theme.key}
                type="button"
                onClick={() => changeTheme(theme.key)}
                variant={currentTheme === theme.key ? "primary" : "secondary"}
                fullWidth
                className="text-left px-4 py-3 text-sm flex items-center justify-between"
              >
                <span>{theme.name}</span>
                {currentTheme === theme.key && <span className="text-sm">✓</span>}
              </Button>
            ))}
        </div>
        <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>
          Choose from our built-in color themes (changes apply immediately)
        </p>

        {/* UI Examples (collapsible) */}
        <div
          className="mt-8 pt-6 border-t"
          style={{ borderColor: "var(--border-color)" }}
        >
          <button
            onClick={() => setUiExamplesExpanded(!uiExamplesExpanded)}
            className="w-full flex items-center justify-between text-left mb-6 hover:opacity-70 transition-opacity"
          >
            <h3
              className="text-lg font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              UI Examples
            </h3>
            <ChevronDown
              size={20}
              style={{
                color: "var(--text-secondary)",
                transform: uiExamplesExpanded ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s",
              }}
            />
          </button>

          {uiExamplesExpanded && (
            <div
              className="p-6 rounded-lg"
              style={{ backgroundColor: "var(--bg-primary)" }}
            >
              <p style={{ color: "var(--text-secondary)" }}>
                UI examples from original Settings page will be added here
                (typography, colors, buttons, etc.)
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Custom Themes */}
      <div
        className="p-6 rounded-lg border"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <CustomThemeManager />
      </div>
    </div>
  );
};

export default ThemeTab;
