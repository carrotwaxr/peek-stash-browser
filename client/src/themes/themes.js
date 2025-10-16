// Theme definitions for the media application
export const themes = {
  peek: {
    name: "Peek",
    properties: {
      // Typography
      "--font-brand": "'Lilita One', cursive",
      "--font-heading": "'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
      "--font-body": "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      "--font-mono": "'JetBrains Mono', 'Courier New', monospace",

      // Background colors - Deep dark for elegant feel
      "--bg-primary": "#0a0a0b",
      "--bg-secondary": "#141418",
      "--bg-tertiary": "#1e1e24",
      "--bg-card": "#181820",
      "--bg-hover": "#22222a",
      "--bg-overlay": "rgba(0, 0, 0, 0.85)",

      // Text colors - Clean whites and grays
      "--text-primary": "#ffffff",
      "--text-secondary": "#c8c8cc",
      "--text-muted": "#8a8a92",
      "--text-accent": "#f0f0f2",

      // Accent colors - Your logo palette
      "--accent-primary": "#6D2CE3", // Purple - Primary brand
      "--accent-secondary": "#FD6B86", // Pink - Secondary actions
      "--accent-tertiary": "#FA8C2A", // Orange - Highlights
      "--accent-success": "#0F7173", // Teal - Success states
      "--accent-info": "#3993DD", // Blue - Info/links
      "--accent-warning": "#FA8C2A", // Orange - Warnings
      "--accent-error": "#FD6B86", // Pink - Errors (softer than red)

      // Interactive states
      "--border-color": "#2a2a32",
      "--border-focus": "#6D2CE3",
      "--border-hover": "#3a3a42",
      "--shadow-sm": "0 1px 2px 0 rgba(109, 44, 227, 0.05)",
      "--shadow-md": "0 4px 6px -1px rgba(109, 44, 227, 0.1)",
      "--shadow-lg": "0 10px 15px -3px rgba(109, 44, 227, 0.15)",

      // Media specific
      "--player-bg": "#000000",
      "--controls-bg": "rgba(10, 10, 11, 0.8)",
      "--progress-bg": "#2a2a32",
      "--progress-fill": "#6D2CE3",

      // Button states
      "--btn-primary-bg": "#6D2CE3",
      "--btn-primary-hover": "#5a24c0",
      "--btn-secondary-bg": "#FD6B86",
      "--btn-secondary-hover": "#fc4f6f",
      "--btn-tertiary-bg": "#FA8C2A",
      "--btn-tertiary-hover": "#f77b0a",
    },
  },

  light: {
    name: "Light",
    properties: {
      // Typography
      "--font-brand": "'Lilita One', cursive",
      "--font-heading": "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
      "--font-body": "'Rubik', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      "--font-mono": "'Fira Code', 'Courier New', monospace",

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
      // Typography
      "--font-brand": "'Lilita One', cursive",
      "--font-heading": "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif",
      "--font-body": "'Work Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      "--font-mono": "'Space Mono', 'Courier New', monospace",

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

// Available font options for custom theme creation
export const fontOptions = {
  brand: [
    { value: "'Lilita One', cursive", label: "Lilita One" },
  ],
  heading: [
    { value: "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif", label: "Poppins" },
    { value: "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif", label: "Outfit" },
    { value: "'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", label: "Space Grotesk" },
    { value: "'Manrope', -apple-system, BlinkMacSystemFont, sans-serif", label: "Manrope" },
  ],
  body: [
    { value: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", label: "Inter" },
    { value: "'Rubik', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", label: "Rubik" },
    { value: "'Work Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", label: "Work Sans" },
    { value: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", label: "DM Sans" },
  ],
  mono: [
    { value: "'JetBrains Mono', 'Courier New', monospace", label: "JetBrains Mono" },
    { value: "'Fira Code', 'Courier New', monospace", label: "Fira Code" },
    { value: "'Space Mono', 'Courier New', monospace", label: "Space Mono" },
  ],
};

export const defaultTheme = "peek";
