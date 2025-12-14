/**
 * Unit conversion utilities for Metric/Imperial measurements
 */

export const UNITS = {
  METRIC: "metric",
  IMPERIAL: "imperial",
};

/**
 * Convert centimeters to feet and inches
 * @param {number} cm - Height in centimeters
 * @returns {{ feet: number, inches: number }}
 */
export const cmToFeetInches = (cm) => {
  if (!cm) return { feet: 0, inches: 0 };
  const totalInches = cm / 2.54;
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches % 12);
  // Handle case where rounding gives 12 inches
  if (inches === 12) {
    return { feet: feet + 1, inches: 0 };
  }
  return { feet, inches };
};

/**
 * Convert feet and inches to centimeters
 * @param {number} feet
 * @param {number} inches
 * @returns {number} Height in centimeters
 */
export const feetInchesToCm = (feet, inches) => {
  const totalInches = feet * 12 + inches;
  return Math.round(totalInches * 2.54);
};

/**
 * Format height for display based on unit preference
 * @param {number} cm - Height in centimeters
 * @param {string} unit - UNITS.METRIC or UNITS.IMPERIAL
 * @returns {string|null}
 */
export const formatHeight = (cm, unit) => {
  if (!cm) return null;
  if (unit === UNITS.IMPERIAL) {
    const { feet, inches } = cmToFeetInches(cm);
    return `${feet}'${inches}"`;
  }
  return `${cm} cm`;
};
