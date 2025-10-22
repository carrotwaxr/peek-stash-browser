// Theme definitions for the media application
import {
  generateBackgroundScale,
  generateTextScale,
  generateShadows,
  generateFocusRing,
} from '../utils/colorScale.js';

export const themes = {
  peek: {
    name: "Peek",
    properties: {
      // Typography
      "--font-brand": "'Lilita One', cursive",
      "--font-heading": "'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
      "--font-body": "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
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
      "--font-heading": "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
      "--font-body": "'Rubik', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      "--font-mono": "'Fira Code', 'Courier New', monospace",

      // Background colors - Generated from base color
      ...generateBackgroundScale("#ffffff", "light"),

      // Text colors - Generated from base color
      ...generateTextScale("#1f2937", "light"),

      // Accent colors
      "--accent-primary": "#2563eb",
      "--accent-secondary": "#7c3aed",
      "--accent-success": "#059669",
      "--accent-warning": "#d97706",
      "--accent-error": "#dc2626",

      // Interactive states - Generated from accent color
      "--border-color": "#e5e7eb",
      ...generateShadows("#2563eb", "light"),
      ...generateFocusRing("#2563eb"),

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
      "--role-admin-bg": "rgba(124, 58, 237, 0.1)",
      "--role-admin-text": "#7c3aed",
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
      "--toast-info-bg": "#1d4ed8",
      "--toast-info-border": "#60a5fa",
      "--toast-info-shadow": "rgba(29, 78, 216, 0.4)",

      // Icon colors (for stats and indicators)
      "--icon-play-count": "#059669", // Green - matches accent-success
      "--icon-rating": "#d97706", // Orange - matches accent-warning
      "--icon-organized": "#22c55e", // Green
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
