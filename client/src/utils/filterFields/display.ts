/**
 * A number row shown in another scale than it is stored (`display` on its
 * panel row): a rating100 of 68 shows and is typed as 6.8. Only the editor
 * and the chip convert; the state, URL, presets and requests hold the
 * stored value.
 */
import type { NumberField } from "@peek/shared-types";

export type NumberDisplay = NonNullable<NumberField["display"]>;

/** A stored bound as shown: over the divisor, to the display's decimals (68 is 6.8, 60 is 6) */
export const shownBound = (stored: number, display: NumberDisplay): number =>
  Number((stored / display.divisor).toFixed(display.decimals));

/** A shown bound as stored, without the float noise of the multiplication (6.8 is 68) */
export const storedBound = (shown: number, display: NumberDisplay): number =>
  Number((shown * display.divisor).toPrecision(12));
