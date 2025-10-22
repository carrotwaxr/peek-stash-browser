// Theme definitions for the media application
import {
  generateBackgroundScale,
  generateTextScale,
  generateShadows,
  generateFocusRing,
} from "../utils/colorScale.js";

export const themes = {
  peek: {
    name: "Peek",
    properties: {
      // Typography
      "--font-brand": "'Lilita One', cursive",
      "--font-heading":
        "'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
      "--font-body":
        "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      "--font-mono": "'JetBrains Mono', 'Courier New', monospace",

      // Background colors - Generated from base color
      ...generateBackgroundScale("#0a0a0b", "dark"),

      // Text colors - Generated from base color
      ...generateTextScale("#ffffff", "dark"),

      // Accent colors - Your logo palette
      "--accent-primary": "#6D2CE3", // Purple - Primary brand
      "--accent-secondary": "#FD6B86", // Pink - Secondary actions
      "--accent-success": "#0F7173", // Teal - Success states
      "--accent-info": "#3993DD", // Blue - Info/links
      "--accent-warning": "#FA8C2A", // Orange - Warnings
      "--accent-error": "#FD6B86", // Pink - Errors (softer than red)

      // Interactive states - Generated from accent color
      "--border-color": "#2a2a32",
      ...generateShadows("#6D2CE3", "dark"),
      ...generateFocusRing("#6D2CE3"),

      // Media specific
      "--player-bg": "#000000",
      "--controls-bg": "rgba(10, 10, 11, 0.8)",
      "--progress-bg": "#2a2a32",

      // Rating gradient (0-100 scale)
      "--rating-excellent": "#22c55e", // 80-100: Green
      "--rating-good": "#84cc16", // 60-79: Lime
      "--rating-average": "#eab308", // 40-59: Yellow
      "--rating-poor": "#f97316", // 20-39: Orange
      "--rating-bad": "#ef4444", // 0-19: Red

      // Role badges
      "--role-admin-bg": "rgba(168, 85, 247, 0.1)",
      "--role-admin-text": "#a855f7",
      "--role-user-bg": "rgba(100, 116, 139, 0.1)",
      "--role-user-text": "#64748b",

      // Status states
      "--status-error-bg": "rgba(239, 68, 68, 0.1)",
      "--status-error-border": "rgba(239, 68, 68, 0.3)",
      "--status-error-text": "#ef4444",
      "--status-info-bg": "rgba(59, 130, 246, 0.1)",
      "--status-info-border": "rgba(59, 130, 246, 0.3)",
      "--status-info-text": "#3b82f6",

      // Toast notifications
      "--toast-error-bg": "#dc2626",
      "--toast-error-border": "#f87171",
      "--toast-error-shadow": "rgba(220, 38, 38, 0.4)",
      "--toast-info-bg": "#1d4ed8",
      "--toast-info-border": "#60a5fa",
      "--toast-info-shadow": "rgba(29, 78, 216, 0.4)",

      // Icon colors (for stats and indicators)
      "--icon-play-count": "#0F7173", // Teal - matches accent-success
      "--icon-rating": "#FA8C2A", // Orange for rating stars
      "--icon-organized": "#22c55e", // Green
    },
  },

  light: {
    name: "Light",
    properties: {
      // Typography
      "--font-brand": "'Lilita One', cursive",
      "--font-heading":
        "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
      "--font-body":
        "'Rubik', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      "--font-mono": "'Fira Code', 'Courier New', monospace",

      // Background colors - Generated from base color (off white)
      ...generateBackgroundScale("#fcfaf9", "light"),

      // Text colors - Generated from base color
      ...generateTextScale("#333333", "light"),

      // Accent colors
      "--accent-primary": "#6D2CE3",
      "--accent-secondary": "#DA4167",
      "--accent-success": "#059669",
      "--accent-info": "#2563eb", // Bright blue for links/info
      "--accent-warning": "#d97706",
      "--accent-error": "#dc2626",

      // Interactive states - Generated from accent color
      "--border-color": "#e5e7eb",
      ...generateShadows("#6D2CE3", "light"),
      ...generateFocusRing("#6D2CE3"),

      // Media specific
      "--player-bg": "#000000",
      "--controls-bg": "rgba(0, 0, 0, 0.7)",
      "--progress-bg": "#e5e7eb",

      // Rating gradient (0-100 scale)
      "--rating-excellent": "#059669", // 80-100: Green
      "--rating-good": "#65a30d", // 60-79: Lime
      "--rating-average": "#ca8a04", // 40-59: Yellow
      "--rating-poor": "#ea580c", // 20-39: Orange
      "--rating-bad": "#dc2626", // 0-19: Red

      // Role badges
      "--role-admin-bg": "rgba(109, 44, 227, 0.1)", // Purple tint to match primary
      "--role-admin-text": "#6D2CE3", // Match primary
      "--role-user-bg": "rgba(100, 116, 139, 0.1)",
      "--role-user-text": "#64748b",

      // Status states
      "--status-error-bg": "rgba(220, 38, 38, 0.1)",
      "--status-error-border": "rgba(220, 38, 38, 0.3)",
      "--status-error-text": "#dc2626",
      "--status-info-bg": "rgba(37, 99, 235, 0.1)",
      "--status-info-border": "rgba(37, 99, 235, 0.3)",
      "--status-info-text": "#2563eb",

      // Toast notifications
      "--toast-error-bg": "#dc2626",
      "--toast-error-border": "#f87171",
      "--toast-error-shadow": "rgba(220, 38, 38, 0.4)",
      "--toast-info-bg": "#2563eb",
      "--toast-info-border": "#60a5fa",
      "--toast-info-shadow": "rgba(37, 99, 235, 0.4)",

      // Icon colors (for stats and indicators)
      "--icon-play-count": "#059669", // Green - matches accent-success
      "--icon-rating": "#d97706", // Orange - matches accent-warning
      "--icon-organized": "#059669", // Green - matches success
    },
  },

  midnight: {
    name: "Midnight Blue",
    properties: {
      // Typography
      "--font-brand": "'Lilita One', cursive",
      "--font-heading":
        "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif",
      "--font-body":
        "'Work Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      "--font-mono": "'Space Mono', 'Courier New', monospace",

      // Background colors - Generated from base color
      ...generateBackgroundScale("#0c1427", "dark"),

      // Text colors - Generated from base color
      ...generateTextScale("#f1f5f9", "dark"),

      // Accent colors
      "--accent-primary": "#0ea5e9",
      "--accent-secondary": "#8b5cf6",
      "--accent-success": "#22c55e",
      "--accent-warning": "#f59e0b",
      "--accent-error": "#ef4444",

      // Interactive states - Generated from accent color
      "--border-color": "#475569",
      ...generateShadows("#0ea5e9", "dark"),
      ...generateFocusRing("#0ea5e9"),

      // Media specific
      "--player-bg": "#000000",
      "--controls-bg": "rgba(30, 41, 59, 0.8)",
      "--progress-bg": "#475569",

      // Rating gradient (0-100 scale)
      "--rating-excellent": "#22c55e", // 80-100: Green
      "--rating-good": "#84cc16", // 60-79: Lime
      "--rating-average": "#eab308", // 40-59: Yellow
      "--rating-poor": "#f97316", // 20-39: Orange
      "--rating-bad": "#ef4444", // 0-19: Red

      // Role badges
      "--role-admin-bg": "rgba(139, 92, 246, 0.1)",
      "--role-admin-text": "#8b5cf6",
      "--role-user-bg": "rgba(100, 116, 139, 0.1)",
      "--role-user-text": "#64748b",

      // Status states
      "--status-error-bg": "rgba(239, 68, 68, 0.1)",
      "--status-error-border": "rgba(239, 68, 68, 0.3)",
      "--status-error-text": "#ef4444",
      "--status-info-bg": "rgba(14, 165, 233, 0.1)",
      "--status-info-border": "rgba(14, 165, 233, 0.3)",
      "--status-info-text": "#0ea5e9",

      // Toast notifications
      "--toast-error-bg": "#dc2626",
      "--toast-error-border": "#f87171",
      "--toast-error-shadow": "rgba(220, 38, 38, 0.4)",
      "--toast-info-bg": "#0369a1",
      "--toast-info-border": "#38bdf8",
      "--toast-info-shadow": "rgba(3, 105, 161, 0.4)",

      // Icon colors (for stats and indicators)
      "--icon-play-count": "#22c55e", // Green - matches accent-success
      "--icon-rating": "#f59e0b", // Orange - matches accent-warning
      "--icon-organized": "#22c55e", // Green
    },
  },

  deepPurple: {
    name: "Deep Purple",
    properties: {
      // Typography
      "--font-brand": "'Lilita One', cursive",
      "--font-heading":
        "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
      "--font-body":
        "'Rubik', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      "--font-mono": "'Fira Code', 'Courier New', monospace",

      // Background colors - Generated from base color (soft pink)
      ...generateBackgroundScale("#230C33", "dark"),

      // Text colors - Generated from base color
      ...generateTextScale("#EBEDE3", "dark"),

      // Accent colors
      "--accent-primary": "#5C538B",
      "--accent-secondary": "#9984D4",
      "--accent-success": "#4ade80", // Brighter green for dark purple bg
      "--accent-info": "#a78bfa", // Purple-tinted info color
      "--accent-warning": "#fbbf24", // Brighter yellow for visibility
      "--accent-error": "#f87171", // Softer red for dark bg

      // Interactive states - Generated from accent color
      "--border-color": "#381353",
      ...generateShadows("#230C33", "dark"),
      ...generateFocusRing("#230C33"),

      // Media specific
      "--player-bg": "#000000",
      "--controls-bg": "rgba(0, 0, 0, 0.7)",
      "--progress-bg": "#4F1B74",

      // Rating gradient (0-100 scale)
      "--rating-excellent": "#4ade80", // 80-100: Bright green
      "--rating-good": "#a3e635", // 60-79: Lime
      "--rating-average": "#fbbf24", // 40-59: Yellow
      "--rating-poor": "#fb923c", // 20-39: Orange
      "--rating-bad": "#f87171", // 0-19: Soft red

      // Role badges
      "--role-admin-bg": "rgba(153, 132, 212, 0.15)", // Purple tint matching secondary
      "--role-admin-text": "#9984D4", // Match secondary color
      "--role-user-bg": "rgba(100, 116, 139, 0.1)",
      "--role-user-text": "#94a3b8", // Lighter for dark bg

      // Status states
      "--status-error-bg": "rgba(248, 113, 113, 0.1)",
      "--status-error-border": "rgba(248, 113, 113, 0.3)",
      "--status-error-text": "#f87171",
      "--status-info-bg": "rgba(167, 139, 250, 0.1)", // Purple-tinted
      "--status-info-border": "rgba(167, 139, 250, 0.3)",
      "--status-info-text": "#a78bfa",

      // Toast notifications
      "--toast-error-bg": "#dc2626",
      "--toast-error-border": "#f87171",
      "--toast-error-shadow": "rgba(220, 38, 38, 0.4)",
      "--toast-info-bg": "#7c3aed", // Purple for info toasts
      "--toast-info-border": "#a78bfa",
      "--toast-info-shadow": "rgba(124, 58, 237, 0.4)",

      // Icon colors (for stats and indicators)
      "--icon-play-count": "#4ade80", // Bright green
      "--icon-rating": "#fbbf24", // Yellow
      "--icon-organized": "#4ade80", // Bright green
    },
  },

  theHub: {
    name: "The Hub",
    properties: {
      // Typography
      "--font-brand": "'Lilita One', cursive",
      "--font-heading":
        "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
      "--font-body":
        "'Rubik', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      "--font-mono": "'Fira Code', 'Courier New', monospace",

      // Background colors - Generated from base color (soft pink)
      ...generateBackgroundScale("#000000", "dark"),

      // Text colors - Generated from base color
      ...generateTextScale("#ffffff", "dark"),

      // Accent colors
      "--accent-primary": "#ffa31a",
      "--accent-secondary": "#7c3aed",
      "--accent-success": "#22c55e", // Warmer green
      "--accent-info": "#fb923c", // Orange-tinted info to match Hub theme
      "--accent-warning": "#fbbf24", // Bright yellow
      "--accent-error": "#f87171", // Softer red

      // Interactive states - Generated from accent color
      "--border-color": "#3D3D3D",
      ...generateShadows("#ffa31a", "dark"),
      ...generateFocusRing("#ffa31a"),

      // Media specific
      "--player-bg": "#000000",
      "--controls-bg": "rgba(0, 0, 0, 0.7)",
      "--progress-bg": "#2a2a32",

      // Rating gradient (0-100 scale)
      "--rating-excellent": "#22c55e", // 80-100: Green
      "--rating-good": "#a3e635", // 60-79: Lime
      "--rating-average": "#fbbf24", // 40-59: Yellow
      "--rating-poor": "#fb923c", // 20-39: Orange
      "--rating-bad": "#f87171", // 0-19: Red

      // Role badges
      "--role-admin-bg": "rgba(255, 163, 26, 0.15)", // Orange tint matching primary
      "--role-admin-text": "#ffa31a", // Match primary orange
      "--role-user-bg": "rgba(100, 116, 139, 0.1)",
      "--role-user-text": "#94a3b8", // Lighter for black bg

      // Status states
      "--status-error-bg": "rgba(248, 113, 113, 0.1)",
      "--status-error-border": "rgba(248, 113, 113, 0.3)",
      "--status-error-text": "#f87171",
      "--status-info-bg": "rgba(251, 146, 60, 0.1)", // Orange-tinted info
      "--status-info-border": "rgba(251, 146, 60, 0.3)",
      "--status-info-text": "#fb923c",

      // Toast notifications
      "--toast-error-bg": "#dc2626",
      "--toast-error-border": "#f87171",
      "--toast-error-shadow": "rgba(220, 38, 38, 0.4)",
      "--toast-info-bg": "#ea580c", // Orange info toast to match Hub theme
      "--toast-info-border": "#fb923c",
      "--toast-info-shadow": "rgba(234, 88, 12, 0.4)",

      // Icon colors (for stats and indicators)
      "--icon-play-count": "#22c55e", // Green
      "--icon-rating": "#ffa31a", // Orange matching primary
      "--icon-organized": "#22c55e", // Green
    },
  },
};

// Available font options for custom theme creation
export const fontOptions = {
  brand: [{ value: "'Lilita One', cursive", label: "Lilita One" }],
  heading: [
    {
      value: "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
      label: "Poppins",
    },
    {
      value: "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif",
      label: "Outfit",
    },
    {
      value: "'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
      label: "Space Grotesk",
    },
    {
      value: "'Manrope', -apple-system, BlinkMacSystemFont, sans-serif",
      label: "Manrope",
    },
  ],
  body: [
    {
      value:
        "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      label: "Inter",
    },
    {
      value:
        "'Rubik', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      label: "Rubik",
    },
    {
      value:
        "'Work Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      label: "Work Sans",
    },
    {
      value:
        "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      label: "DM Sans",
    },
  ],
  mono: [
    {
      value: "'JetBrains Mono', 'Courier New', monospace",
      label: "JetBrains Mono",
    },
    { value: "'Fira Code', 'Courier New', monospace", label: "Fira Code" },
    { value: "'Space Mono', 'Courier New', monospace", label: "Space Mono" },
  ],
};

export const defaultTheme = "peek";
