/**
 * Unit conversion utilities for Metric/Imperial measurements
 *
 * IMPORTANT: Round-trip conversions may not be exact due to rounding.
 * For example:
 *   - 100 kg → 221 lbs → 100 kg (works due to symmetric rounding)
 *   - 65 kg → 143 lbs → 65 kg (works)
 *   - Some edge cases may lose 1 unit precision
 *
 * This is acceptable for display purposes and filter ranges where
 * exact precision is not critical. The API always stores metric values.
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
export const cmToFeetInches = (cm: number) => {
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
export const feetInchesToCm = (feet: number, inches: number) => {
  const totalInches = feet * 12 + inches;
  return Math.round(totalInches * 2.54);
};

/**
 * Format height for display based on unit preference
 * @param {number} cm - Height in centimeters
 * @param {string} unit - UNITS.METRIC or UNITS.IMPERIAL
 * @returns {string|null}
 */
export const formatHeight = (cm: number, unit: string) => {
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
export const kgToLbs = (kg: number) => Math.round(kg * 2.205);

/**
 * Convert pounds to kilograms
 * @param {number} lbs - Weight in pounds
 * @returns {number} Weight in kilograms (rounded)
 */
export const lbsToKg = (lbs: number) => Math.round(lbs / 2.205);

/**
 * Format weight for display based on unit preference
 * @param {number} kg - Weight in kilograms
 * @param {string} unit - UNITS.METRIC or UNITS.IMPERIAL
 * @returns {string|null}
 */
export const formatWeight = (kg: number, unit: string) => {
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
export const cmToInches = (cm: number) => Math.round((cm / 2.54) * 10) / 10;

/**
 * Convert inches to centimeters (1 decimal place)
 * @param {number} inches - Length in inches
 * @returns {number} Length in centimeters
 */
export const inchesToCm = (inches: number) =>
  Math.round(inches * 2.54 * 10) / 10;

/**
 * Format length for display based on unit preference
 * @param {number} cm - Length in centimeters
 * @param {string} unit - UNITS.METRIC or UNITS.IMPERIAL
 * @returns {string|null}
 */
export const formatLength = (cm: number, unit: string) => {
  if (cm === null || cm === undefined) return null;
  if (unit === UNITS.IMPERIAL) {
    return `${cmToInches(cm)} in`;
  }
  return `${cm} cm`;
};

// ── Body measures in the filter editors ───────────────────────────────────
//
// The panel's state, the URL, presets and requests hold metric; an imperial
// viewer's editors convert what is typed into the whole-unit metric range
// whose values display as the typed bound, and back for display. Height and
// Weight are stored by Stash as whole cm and kg, so a bound is the lowest
// (minimum) or highest (maximum) whole value that still shows as typed.

/** Which end of a range a typed bound is */
export type RangeSide = "min" | "max";

/** The whole cm range a typed height covers: the values that display as it */
const cmShowing = (feet: number, inches: number) => {
  const total = Math.round(feet * 12 + inches);
  const shown = { feet: Math.floor(total / 12), inches: total % 12 };
  const near = Math.round(total * 2.54);
  const cms: number[] = [];
  for (let cm = near - 3; cm <= near + 3; cm++) {
    const each = cmToFeetInches(cm);
    if (each.feet === shown.feet && each.inches === shown.inches) cms.push(cm);
  }
  return cms.length > 0 ? cms : [near];
};

/**
 * A typed height as whole cm: a minimum is the lowest cm that displays as
 * it (5'10" is 177 cm), a maximum the highest (6'2" is 189 cm). Nothing
 * typed (zero feet and inches) is no bound.
 */
export const heightBoundToCm = (
  feet: number,
  inches: number,
  side: RangeSide
): number | undefined => {
  if (!Number.isFinite(feet) || !Number.isFinite(inches)) return undefined;
  if (Math.round(feet * 12 + inches) <= 0) return undefined;
  const cms = cmShowing(feet, inches);
  return side === "min" ? Math.min(...cms) : Math.max(...cms);
};

/**
 * A typed weight as whole kg: a minimum is the lowest kg that displays as
 * that many lbs or more, a maximum the highest that displays as that many
 * or fewer (150 lbs at least is 68 kg). Zero is no bound.
 */
export const weightBoundToKg = (
  lbs: number,
  side: RangeSide
): number | undefined => {
  if (!Number.isFinite(lbs) || lbs <= 0) return undefined;
  const near = Math.round(lbs / 2.205);
  for (let kg = near - 3; kg <= near + 3; kg++) {
    if (side === "min" && kgToLbs(kg) >= lbs) return kg;
  }
  if (side === "min") return near;
  for (let kg = near + 3; kg >= near - 3; kg--) {
    if (kgToLbs(kg) <= lbs) return kg;
  }
  return near;
};

/** A typed length in inches as cm, two decimals (6 in is 15.24 cm); nothing typed or zero is no bound */
export const lengthInchesToCm = (inches: number): number | undefined =>
  Number.isFinite(inches) && inches > 0
    ? Math.round(inches * 2.54 * 100) / 100
    : undefined;

/** A length in cm as inches, two decimals (15.24 cm is 6 in) */
export const cmToLengthInches = (cm: number): number =>
  Math.round((cm / 2.54) * 100) / 100;
