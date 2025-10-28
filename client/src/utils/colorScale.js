/**
 * Color scale generation utilities for theme system
 *
 * These functions generate color scales from base colors, ensuring
 * consistent theming and simplifying theme creation.
 */

/**
 * Convert hex color to HSL
 * @param {string} hex - Hex color (e.g., "#0a0a0b")
 * @returns {[number, number, number]} [hue, saturation, lightness]
 */
function hexToHSL(hex) {
  // Remove # if present
  hex = hex.replace(/^#/, "");

  // Convert to RGB
  const r = parseInt(hex.substr(0, 2), 16) / 255;
  const g = parseInt(hex.substr(2, 2), 16) / 255;
  const b = parseInt(hex.substr(4, 2), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;

  let h = 0;
  let s = 0;
  let l = (max + min) / 2;

  if (diff !== 0) {
    s = l > 0.5 ? diff / (2 - max - min) : diff / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / diff + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / diff + 2) / 6;
        break;
      case b:
        h = ((r - g) / diff + 4) / 6;
        break;
    }
  }

  return [h * 360, s * 100, l * 100];
}

/**
 * Convert HSL to hex color
 * @param {number} h - Hue (0-360)
 * @param {number} s - Saturation (0-100)
 * @param {number} l - Lightness (0-100)
 * @returns {string} Hex color
 */
function hslToHex(h, s, l) {
  h = h / 360;
  s = s / 100;
  l = l / 100;

  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  const toHex = (x) => {
    const hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Adjust color lightness
 * @param {string} hex - Hex color
 * @param {number} amount - Amount to adjust (-100 to +100)
 * @returns {string} Adjusted hex color
 */
function adjustLightness(hex, amount) {
  const [h, s, l] = hexToHSL(hex);
  const newL = Math.max(0, Math.min(100, l + amount));
  return hslToHex(h, s, newL);
}

/**
 * Generate background color scale for themes
 * @param {string} baseColor - Base background color (hex)
 * @param {'dark'|'light'} mode - Theme mode
 * @returns {Object} Background color scale
 */
export function generateBackgroundScale(baseColor, mode = "dark") {
  if (mode === "dark") {
    // Dark mode: start dark, go lighter
    return {
      "--bg-primary": baseColor, // Darkest
      "--bg-secondary": adjustLightness(baseColor, 8), // +8% lighter
      "--bg-card": adjustLightness(baseColor, 6), // +6% lighter
      "--bg-tertiary": adjustLightness(baseColor, 12), // +12% lighter
      "--bg-hover": adjustLightness(baseColor, 14), // +14% lighter
    };
  } else {
    // Light mode: start light, go darker
    return {
      "--bg-primary": baseColor, // Lightest
      "--bg-secondary": adjustLightness(baseColor, -8), // -6% darker
      "--bg-card": adjustLightness(baseColor, -6), // -4% darker
      "--bg-tertiary": adjustLightness(baseColor, -12), // -10% darker
      "--bg-hover": adjustLightness(baseColor, -14), // -12% darker
    };
  }
}

/**
 * Generate text color scale for themes
 * @param {string} baseColor - Base text color (hex)
 * @param {'dark'|'light'} mode - Theme mode
 * @returns {Object} Text color scale
 */
export function generateTextScale(baseColor, mode = "dark") {
  if (mode === "dark") {
    // Dark mode: start white, go darker
    return {
      "--text-primary": baseColor, // Brightest
      "--text-secondary": adjustLightness(baseColor, -15), // -15% darker
      "--text-muted": adjustLightness(baseColor, -30), // -30% darker
    };
  } else {
    // Light mode: start dark, go lighter
    return {
      "--text-primary": baseColor, // Darkest
      "--text-secondary": adjustLightness(baseColor, 15), // +15% lighter
      "--text-muted": adjustLightness(baseColor, 35), // +35% lighter
    };
  }
}

/**
 * Generate accent color shades for hover/active states
 * @param {string} accentColor - Primary accent color (hex)
 * @returns {Object} Accent color shades
 */
export function generateAccentShades(accentColor) {
  return {
    base: accentColor,
    hover: adjustLightness(accentColor, -8), // Slightly darker for hover
    active: adjustLightness(accentColor, -12), // Even darker for active
    light: adjustLightness(accentColor, 10), // Lighter variant
  };
}

/**
 * Generate shadow colors based on accent color
 * @param {string} accentColor - Primary accent color (hex)
 * @param {'dark'|'light'} mode - Theme mode
 * @returns {Object} Shadow definitions
 */
export function generateShadows(accentColor, mode = "dark") {
  // Extract RGB from hex for rgba shadows
  const hex = accentColor.replace(/^#/, "");
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);

  const opacity = mode === "dark" ? [0.05, 0.1, 0.15] : [0.1, 0.15, 0.2];

  return {
    "--shadow-sm": `0 1px 2px 0 rgba(${r}, ${g}, ${b}, ${opacity[0]})`,
    "--shadow-md": `0 4px 6px -1px rgba(${r}, ${g}, ${b}, ${opacity[1]})`,
    "--shadow-lg": `0 10px 15px -3px rgba(${r}, ${g}, ${b}, ${opacity[2]})`,
  };
}

/**
 * Generate focus ring colors
 * @param {string} accentColor - Primary accent color (hex)
 * @returns {Object} Focus ring styles
 */
export function generateFocusRing(accentColor) {
  // Extract RGB for rgba shadow
  const hex = accentColor.replace(/^#/, "");
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);

  return {
    "--focus-ring-color": accentColor,
    "--focus-ring-shadow": `0 0 0 3px rgba(${r}, ${g}, ${b}, 0.3)`,
    "--selection-color": accentColor,
    "--selection-bg": `rgba(${r}, ${g}, ${b}, 0.1)`,
    "--border-focus": accentColor,
  };
}

/**
 * Convert hex to RGB object
 * @param {string} hex - Hex color
 * @returns {Object} RGB values { r, g, b }
 */
function hexToRgb(hex) {
  const h = hex.replace(/^#/, "");
  return {
    r: parseInt(h.substr(0, 2), 16),
    g: parseInt(h.substr(2, 2), 16),
    b: parseInt(h.substr(4, 2), 16),
  };
}

/**
 * Generate status colors from base status colors
 * Creates base color + background/border variants with alpha
 * @param {Object} status - Status colors { success, error, info, warning }
 * @returns {Object} Complete status color definitions
 */
export function generateStatusColors(status) {
  const colors = {};

  // Generate for each status type
  Object.entries(status).forEach(([type, baseColor]) => {
    const rgb = hexToRgb(baseColor);

    colors[`--status-${type}`] = baseColor; // Base color
    colors[`--status-${type}-bg`] = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`; // Background with alpha
    colors[`--status-${type}-border`] = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`; // Border with alpha
  });

  return colors;
}

/**
 * Generate toast notification colors from base status colors
 * Creates darker/lighter variants for toast backgrounds, borders, and shadows
 * @param {Object} status - Status colors { success, error, info, warning }
 * @param {'dark'|'light'} mode - Theme mode
 * @returns {Object} Toast color definitions
 */
export function generateToastColors(status, mode = "dark") {
  const colors = {};

  // Generate for each status type
  Object.entries(status).forEach(([type, baseColor]) => {
    // Toast backgrounds are slightly darker/more saturated versions
    const toastBg = adjustLightness(baseColor, mode === "dark" ? -8 : -12);

    // Borders are lighter versions
    const toastBorder = adjustLightness(baseColor, mode === "dark" ? 10 : 8);

    // Shadows use the background color with alpha
    const bgRgb = hexToRgb(toastBg);

    colors[`--toast-${type}-bg`] = toastBg;
    colors[`--toast-${type}-border`] = toastBorder;
    colors[`--toast-${type}-shadow`] = `rgba(${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b}, 0.4)`;
  });

  return colors;
}
