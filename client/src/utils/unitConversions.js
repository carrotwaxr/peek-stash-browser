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

/**
 * Convert kilograms to pounds
 * @param {number} kg - Weight in kilograms
 * @returns {number} Weight in pounds (rounded)
 */
export const kgToLbs = (kg) => Math.round(kg * 2.205);

/**
 * Convert pounds to kilograms
 * @param {number} lbs - Weight in pounds
 * @returns {number} Weight in kilograms (rounded)
 */
export const lbsToKg = (lbs) => Math.round(lbs / 2.205);

/**
 * Format weight for display based on unit preference
 * @param {number} kg - Weight in kilograms
 * @param {string} unit - UNITS.METRIC or UNITS.IMPERIAL
 * @returns {string|null}
 */
export const formatWeight = (kg, unit) => {
  if (!kg) return null;
  if (unit === UNITS.IMPERIAL) {
    return `${kgToLbs(kg)} lbs`;
  }
  return `${kg} kg`;
};

/**
 * Convert centimeters to inches (1 decimal place)
 * @param {number} cm - Length in centimeters
 * @returns {number} Length in inches
 */
export const cmToInches = (cm) => Math.round((cm / 2.54) * 10) / 10;

/**
 * Convert inches to centimeters (1 decimal place)
 * @param {number} inches - Length in inches
 * @returns {number} Length in centimeters
 */
export const inchesToCm = (inches) => Math.round(inches * 2.54 * 10) / 10;

/**
 * Format length for display based on unit preference
 * @param {number} cm - Length in centimeters
 * @param {string} unit - UNITS.METRIC or UNITS.IMPERIAL
 * @returns {string|null}
 */
export const formatLength = (cm, unit) => {
  if (cm === null || cm === undefined) return null;
  if (unit === UNITS.IMPERIAL) {
    return `${cmToInches(cm)} in`;
  }
  return `${cm} cm`;
};
