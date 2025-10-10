// Theme definitions for the media application
export const themes = {
  dark: {
    name: "Dark",
    properties: {
      // Background colors
      "--bg-primary": "#0f0f0f",
      "--bg-secondary": "#1a1a1a",
      "--bg-tertiary": "#2d2d2d",
      "--bg-card": "#1f1f1f",
      "--bg-hover": "#2a2a2a",
      "--bg-overlay": "rgba(0, 0, 0, 0.8)",

      // Text colors
      "--text-primary": "#ffffff",
      "--text-secondary": "#b3b3b3",
      "--text-muted": "#666666",
      "--text-accent": "#e5e7eb",

      // Accent colors
      "--accent-primary": "#3b82f6", // Blue
      "--accent-secondary": "#8b5cf6", // Purple
      "--accent-success": "#10b981", // Green
      "--accent-warning": "#f59e0b", // Orange
      "--accent-error": "#ef4444", // Red

      // Interactive states
      "--border-color": "#404040",
      "--border-focus": "#3b82f6",
      "--shadow-sm": "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
      "--shadow-md": "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
      "--shadow-lg": "0 10px 15px -3px rgba(0, 0, 0, 0.1)",

      // Media specific
      "--player-bg": "#000000",
      "--controls-bg": "rgba(0, 0, 0, 0.7)",
      "--progress-bg": "#404040",
      "--progress-fill": "#3b82f6",
    },
  },

  light: {
    name: "Light",
    properties: {
      // Background colors
      "--bg-primary": "#ffffff",
      "--bg-secondary": "#f8fafc",
      "--bg-tertiary": "#e2e8f0",
      "--bg-card": "#ffffff",
      "--bg-hover": "#f1f5f9",
      "--bg-overlay": "rgba(255, 255, 255, 0.9)",

      // Text colors
      "--text-primary": "#1f2937",
      "--text-secondary": "#4b5563",
      "--text-muted": "#9ca3af",
      "--text-accent": "#374151",

      // Accent colors
      "--accent-primary": "#2563eb",
      "--accent-secondary": "#7c3aed",
      "--accent-success": "#059669",
      "--accent-warning": "#d97706",
      "--accent-error": "#dc2626",

      // Interactive states
      "--border-color": "#e5e7eb",
      "--border-focus": "#2563eb",
      "--shadow-sm": "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
      "--shadow-md": "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
      "--shadow-lg": "0 10px 15px -3px rgba(0, 0, 0, 0.1)",

      // Media specific
      "--player-bg": "#000000",
      "--controls-bg": "rgba(0, 0, 0, 0.7)",
      "--progress-bg": "#e5e7eb",
      "--progress-fill": "#2563eb",
    },
  },

  midnight: {
    name: "Midnight Blue",
    properties: {
      // Background colors
      "--bg-primary": "#0c1427",
      "--bg-secondary": "#1e293b",
      "--bg-tertiary": "#334155",
      "--bg-card": "#1e293b",
      "--bg-hover": "#334155",
      "--bg-overlay": "rgba(12, 20, 39, 0.9)",

      // Text colors
      "--text-primary": "#f1f5f9",
      "--text-secondary": "#cbd5e1",
      "--text-muted": "#64748b",
      "--text-accent": "#e2e8f0",

      // Accent colors
      "--accent-primary": "#0ea5e9",
      "--accent-secondary": "#8b5cf6",
      "--accent-success": "#22c55e",
      "--accent-warning": "#f59e0b",
      "--accent-error": "#ef4444",

      // Interactive states
      "--border-color": "#475569",
      "--border-focus": "#0ea5e9",
      "--shadow-sm": "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
      "--shadow-md": "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
      "--shadow-lg": "0 10px 15px -3px rgba(0, 0, 0, 0.1)",

      // Media specific
      "--player-bg": "#000000",
      "--controls-bg": "rgba(30, 41, 59, 0.8)",
      "--progress-bg": "#475569",
      "--progress-fill": "#0ea5e9",
    },
  },
};

export const defaultTheme = "dark";
