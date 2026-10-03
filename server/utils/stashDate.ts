/**
 * Entity dates as Peek stores them. Stash answers a collection with no date
 * as "0001-01-01" (Go's zero time), so a date before year 2 is none, as a
 * blank one is: stored NULL, it shows, sorts and filters as no date.
 */

/** A stored date before this one (`YYYY-MM-DD` text compares in order) is no date */
export const NO_DATE_BEFORE = "0002";

/** Stash's date as stored: the date as Stash returns it, else null for none */
export function stashDate(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.trim() === "") {
    return null;
  }
  return value < NO_DATE_BEFORE ? null : value;
}
