// Theme definitions for the media application
import {
  generateBackgroundScale,
  generateTextScale,
  generateShadows,
  generateFocusRing,
  generateStatusColors,
  generateToastColors,
} from "../utils/colorScale.js";

export const themes = {
  peek: {
    name: "Peek",
    properties: (() => {
      // ============================================
      // THEME CONFIGURATION - Single source of truth
      // ============================================
      const config = {
        mode: "dark",

        fonts: {
          brand: "'Lilita One', cursive",
          heading:
            "'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
          body: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          mono: "'JetBrains Mono', 'Courier New', monospace",
        },

        colors: {
          background: "#0a0a0b",
          text: "#ffffff",
          border: "#2a2a32",
        },

        accents: {
          primary: "#6D2CE3", // Purple - Primary brand
          secondary: "#FD6B86", // Pink - Secondary actions
        },

        status: {
          success: "#0F7173", // Teal - Success states
          error: "#FD6B86", // Pink - Errors (softer than red)
          info: "#3993DD", // Blue - Info/links
          warning: "#FA8C2A", // Orange - Warnings
        },
      };

      return {
        "--font-brand": config.fonts.brand,
        "--font-heading": config.fonts.heading,
        "--font-body": config.fonts.body,
        "--font-mono": config.fonts.mono,

        ...generateBackgroundScale(config.colors.background, config.mode),
        ...generateTextScale(config.colors.text, config.mode),

        "--accent-primary": config.accents.primary,
        "--accent-secondary": config.accents.secondary,

        "--border-color": config.colors.border,
        ...generateShadows(config.accents.primary, config.mode),
        ...generateFocusRing(config.accents.primary),

        ...generateStatusColors(config.status),
        ...generateToastColors(config.status, config.mode),
      };
    })(),
  },

  light: {
    name: "Light",
    properties: (() => {
      const config = {
        mode: "light",

        fonts: {
          brand: "'Lilita One', cursive",
          heading: "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
          body: "'Rubik', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          mono: "'Fira Code', 'Courier New', monospace",
        },

        colors: {
          background: "#fcfaf9",
          text: "#333333",
          border: "#e5e7eb",
        },

        accents: {
          primary: "#6D2CE3",
          secondary: "#DA4167",
        },

        status: {
          success: "#059669",
          error: "#dc2626",
          info: "#2563eb",
          warning: "#d97706",
        },
      };

      return {
        "--font-brand": config.fonts.brand,
        "--font-heading": config.fonts.heading,
        "--font-body": config.fonts.body,
        "--font-mono": config.fonts.mono,

        ...generateBackgroundScale(config.colors.background, config.mode),
        ...generateTextScale(config.colors.text, config.mode),

        "--accent-primary": config.accents.primary,
        "--accent-secondary": config.accents.secondary,

        "--border-color": config.colors.border,
        ...generateShadows(config.accents.primary, config.mode),
        ...generateFocusRing(config.accents.primary),

        ...generateStatusColors(config.status),
        ...generateToastColors(config.status, config.mode),
      };
    })(),
  },

  midnight: {
    name: "Midnight Blue",
    properties: (() => {
      const config = {
        mode: "dark",

        fonts: {
          brand: "'Lilita One', cursive",
          heading: "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif",
          body: "'Work Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          mono: "'Space Mono', 'Courier New', monospace",
        },

        colors: {
          background: "#0c1427",
          text: "#f1f5f9",
          border: "#475569",
        },

        accents: {
          primary: "#0ea5e9",
          secondary: "#8b5cf6",
        },

        status: {
          success: "#22c55e",
          error: "#ef4444",
          info: "#0ea5e9",
          warning: "#f59e0b",
        },
      };

      return {
        "--font-brand": config.fonts.brand,
        "--font-heading": config.fonts.heading,
        "--font-body": config.fonts.body,
        "--font-mono": config.fonts.mono,

        ...generateBackgroundScale(config.colors.background, config.mode),
        ...generateTextScale(config.colors.text, config.mode),

        "--accent-primary": config.accents.primary,
        "--accent-secondary": config.accents.secondary,

        "--border-color": config.colors.border,
        ...generateShadows(config.accents.primary, config.mode),
        ...generateFocusRing(config.accents.primary),

        ...generateStatusColors(config.status),
        ...generateToastColors(config.status, config.mode),
      };
    })(),
  },

  deepPurple: {
    name: "Deep Purple",
    properties: (() => {
      const config = {
        mode: "dark",

        fonts: {
          brand: "'Lilita One', cursive",
          heading: "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
          body: "'Rubik', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          mono: "'Fira Code', 'Courier New', monospace",
        },

        colors: {
          background: "#230C33",
          text: "#EBEDE3",
          border: "#381353",
        },

        accents: {
          primary: "#5C538B",
          secondary: "#9984D4",
        },

        status: {
          success: "#4ade80",
          error: "#f87171",
          info: "#a78bfa",
          warning: "#fbbf24",
        },
      };

      return {
        "--font-brand": config.fonts.brand,
        "--font-heading": config.fonts.heading,
        "--font-body": config.fonts.body,
        "--font-mono": config.fonts.mono,

        ...generateBackgroundScale(config.colors.background, config.mode),
        ...generateTextScale(config.colors.text, config.mode),

        "--accent-primary": config.accents.primary,
        "--accent-secondary": config.accents.secondary,

        "--border-color": config.colors.border,
        ...generateShadows(config.colors.background, config.mode),
        ...generateFocusRing(config.colors.background),

        ...generateStatusColors(config.status),
        ...generateToastColors(config.status, config.mode),
      };
    })(),
  },

  theHub: {
    name: "The Hub",
    properties: (() => {
      const config = {
        mode: "dark",

        fonts: {
          brand: "'Lilita One', cursive",
          heading: "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
          body: "'Rubik', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          mono: "'Fira Code', 'Courier New', monospace",
        },

        colors: {
          background: "#000000",
          text: "#ffffff",
          border: "#3D3D3D",
        },

        accents: {
          primary: "#ffa31a",
          secondary: "#7c3aed",
        },

        status: {
          success: "#22c55e",
          error: "#f87171",
          info: "#fb923c",
          warning: "#fbbf24",
        },
      };

      return {
        "--font-brand": config.fonts.brand,
        "--font-heading": config.fonts.heading,
        "--font-body": config.fonts.body,
        "--font-mono": config.fonts.mono,

        ...generateBackgroundScale(config.colors.background, config.mode),
        ...generateTextScale(config.colors.text, config.mode),

        "--accent-primary": config.accents.primary,
        "--accent-secondary": config.accents.secondary,

        "--border-color": config.colors.border,
        ...generateShadows(config.accents.primary, config.mode),
        ...generateFocusRing(config.accents.primary),

        ...generateStatusColors(config.status),
        ...generateToastColors(config.status, config.mode),
      };
    })(),
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
