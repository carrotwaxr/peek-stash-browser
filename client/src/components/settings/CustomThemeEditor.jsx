import { useState } from "react";
import { fontOptions } from "../../themes/themes.js";
import { Button, Paper } from "../ui/index.js";

/**
 * Color picker input component
 */
const ColorInput = ({ label, value, onChange, description }) => {
  return (
    <div>
      <label
        className="block text-sm font-medium mb-2"
        style={{ color: "var(--text-secondary)" }}
      >
        {label}
      </label>
      <div className="flex gap-3 items-center">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-16 h-10 rounded cursor-pointer"
          style={{ border: "1px solid var(--border-color)" }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          className="flex-1 px-4 py-2 rounded-lg font-mono text-sm"
          style={{
            backgroundColor: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
            color: "var(--text-primary)",
          }}
          pattern="^#[0-9A-Fa-f]{6}$"
        />
      </div>
      {description && (
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          {description}
        </p>
      )}
    </div>
  );
};

/**
 * Font selector component
 */
const FontSelector = ({ label, value, onChange, options }) => {
  return (
    <div>
      <label
        className="block text-sm font-medium mb-2"
        style={{ color: "var(--text-secondary)" }}
      >
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-2 rounded-lg"
        style={{
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
          color: "var(--text-primary)",
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};

/**
 * Custom theme editor component
 */
const CustomThemeEditor = ({ theme, onSave, onCancel, isNew = false }) => {
  const [name, setName] = useState(theme?.name || "");
  const [config, setConfig] = useState(
    theme?.config || {
      mode: "dark",
      fonts: {
        brand: fontOptions.brand[0].value,
        heading: fontOptions.heading[0].value,
        body: fontOptions.body[0].value,
        mono: fontOptions.mono[0].value,
      },
      colors: {
        background: "#0a0a0b",
        backgroundSecondary: "#1d1d20",
        backgroundCard: "#19191b",
        text: "#ffffff",
        border: "#2a2a32",
      },
      accents: {
        primary: "#6D2CE3",
        secondary: "#FD6B86",
      },
      status: {
        success: "#0F7173",
        error: "#FD6B86",
        info: "#3993DD",
        warning: "#FA8C2A",
      },
    }
  );

  const [errors, setErrors] = useState({});

  const updateConfig = (path, value) => {
    setConfig((prev) => {
      const newConfig = { ...prev };
      const keys = path.split(".");
      let current = newConfig;
      for (let i = 0; i < keys.length - 1; i++) {
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = value;
      return newConfig;
    });
  };

  const validateHexColor = (color) => {
    return /^#[0-9A-Fa-f]{6}$/.test(color);
  };

  const validate = () => {
    const newErrors = {};

    if (!name || name.trim().length === 0) {
      newErrors.name = "Theme name is required";
    } else if (name.length > 50) {
      newErrors.name = "Theme name must be 50 characters or less";
    }

    // Validate colors
    const colorFields = [
      "colors.background",
      "colors.backgroundSecondary",
      "colors.backgroundCard",
      "colors.text",
      "colors.border",
      "accents.primary",
      "accents.secondary",
      "status.success",
      "status.error",
      "status.info",
      "status.warning",
    ];

    colorFields.forEach((field) => {
      const keys = field.split(".");
      let value = config;
      keys.forEach((key) => {
        value = value[key];
      });
      if (!validateHexColor(value)) {
        newErrors[field] = "Invalid hex color format";
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (validate()) {
      onSave({ name: name.trim(), config });
    }
  };

  return (
    <div className="space-y-6">
      {/* Theme Name */}
      <div>
        <label
          className="block text-sm font-medium mb-2"
          style={{ color: "var(--text-secondary)" }}
        >
          Theme Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Custom Theme"
          maxLength={50}
          className="w-full px-4 py-2 rounded-lg"
          style={{
            backgroundColor: "var(--bg-secondary)",
            border: `1px solid ${errors.name ? "var(--status-error)" : "var(--border-color)"}`,
            color: "var(--text-primary)",
          }}
        />
        {errors.name && (
          <p className="text-sm mt-1" style={{ color: "var(--status-error)" }}>
            {errors.name}
          </p>
        )}
      </div>

      {/* Mode Selector */}
      <div>
        <label
          className="block text-sm font-medium mb-2"
          style={{ color: "var(--text-secondary)" }}
        >
          Theme Mode
        </label>
        <div className="flex gap-3">
          <Button
            variant={config.mode === "dark" ? "primary" : "secondary"}
            onClick={() => updateConfig("mode", "dark")}
            className="flex-1"
          >
            Dark
          </Button>
          <Button
            variant={config.mode === "light" ? "primary" : "secondary"}
            onClick={() => updateConfig("mode", "light")}
            className="flex-1"
          >
            Light
          </Button>
        </div>
      </div>

      {/* Fonts Section */}
      <Paper>
        <Paper.Header title="Fonts" />
        <Paper.Body>
          <div className="space-y-4">
            <FontSelector
              label="Brand Font"
              value={config.fonts.brand}
              onChange={(value) => updateConfig("fonts.brand", value)}
              options={fontOptions.brand}
            />
            <FontSelector
              label="Heading Font"
              value={config.fonts.heading}
              onChange={(value) => updateConfig("fonts.heading", value)}
              options={fontOptions.heading}
            />
            <FontSelector
              label="Body Font"
              value={config.fonts.body}
              onChange={(value) => updateConfig("fonts.body", value)}
              options={fontOptions.body}
            />
            <FontSelector
              label="Monospace Font"
              value={config.fonts.mono}
              onChange={(value) => updateConfig("fonts.mono", value)}
              options={fontOptions.mono}
            />
          </div>
        </Paper.Body>
      </Paper>

      {/* Background Colors Section */}
      <Paper>
        <Paper.Header title="Background Colors" />
        <Paper.Body>
          <div className="space-y-4">
            <ColorInput
              label="Primary Background"
              value={config.colors.background}
              onChange={(value) => updateConfig("colors.background", value)}
              description="Page background color"
            />
            <ColorInput
              label="Secondary Background"
              value={config.colors.backgroundSecondary}
              onChange={(value) =>
                updateConfig("colors.backgroundSecondary", value)
              }
              description="Nav menu, buttons, form controls, icon placeholders"
            />
            <ColorInput
              label="Card Background"
              value={config.colors.backgroundCard}
              onChange={(value) => updateConfig("colors.backgroundCard", value)}
              description="Cards, papers, and modals"
            />
          </div>
        </Paper.Body>
      </Paper>

      {/* Text & Border Section */}
      <Paper>
        <Paper.Header title="Text & Border" />
        <Paper.Body>
          <div className="space-y-4">
            <ColorInput
              label="Text Color"
              value={config.colors.text}
              onChange={(value) => updateConfig("colors.text", value)}
              description="Primary text color (secondary and muted are auto-generated)"
            />
            <ColorInput
              label="Border Color"
              value={config.colors.border}
              onChange={(value) => updateConfig("colors.border", value)}
              description="Border and divider color"
            />
          </div>
        </Paper.Body>
      </Paper>

      {/* Accent Colors Section */}
      <Paper>
        <Paper.Header title="Accent Colors" />
        <Paper.Body>
          <div className="space-y-4">
            <ColorInput
              label="Primary Accent"
              value={config.accents.primary}
              onChange={(value) => updateConfig("accents.primary", value)}
              description="Primary brand color for buttons and highlights"
            />
            <ColorInput
              label="Secondary Accent"
              value={config.accents.secondary}
              onChange={(value) => updateConfig("accents.secondary", value)}
              description="Secondary actions and accents"
            />
          </div>
        </Paper.Body>
      </Paper>

      {/* Status Colors Section */}
      <Paper>
        <Paper.Header title="Status Colors" />
        <Paper.Body>
          <div className="space-y-4">
            <ColorInput
              label="Success"
              value={config.status.success}
              onChange={(value) => updateConfig("status.success", value)}
              description="Success states and messages"
            />
            <ColorInput
              label="Error"
              value={config.status.error}
              onChange={(value) => updateConfig("status.error", value)}
              description="Error states and messages"
            />
            <ColorInput
              label="Info"
              value={config.status.info}
              onChange={(value) => updateConfig("status.info", value)}
              description="Info states and links"
            />
            <ColorInput
              label="Warning"
              value={config.status.warning}
              onChange={(value) => updateConfig("status.warning", value)}
              description="Warning states and messages"
            />
          </div>
        </Paper.Body>
      </Paper>

      {/* Action Buttons */}
      <div
        className="flex gap-3 justify-end sticky bottom-4 p-4 rounded-lg"
        style={{
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--border-color)",
        }}
      >
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleSave}>
          {isNew ? "Create Theme" : "Save Changes"}
        </Button>
      </div>
    </div>
  );
};

export default CustomThemeEditor;
